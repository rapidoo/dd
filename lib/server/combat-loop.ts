// Server-side combat noyau. NOT a 'use server' module — it exposes pure
// helpers (findNextActor, checkAllNpcsDown) alongside async DB I/O. Only
// import from server code (gm-agent, server actions); never from client
// components. The single Server Action (getActiveCombat) lives next to it
// in combat-actions.ts.

import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type {
  CharacterRow,
  CombatEncounterRow,
  NpcCombatant,
  ParticipantKind,
  ParticipantOrderEntry,
} from '../db/types';
import { rollInitiative, sortInitiative } from '../rules/combat';
import { addCondition, removeCondition, tickConditions } from '../rules/conditions';
import { applyDamage, applyHealing } from '../rules/hitPoints';
import type { Condition, ConditionType } from '../rules/types';

/**
 * Server-authoritative combat noyau. Owns the turn cursor, condition ticks,
 * end-of-encounter detection, and per-mutation optimistic concurrency control.
 * The LLM is reduced to: declaring NPC actions and rolling dice via the GM
 * agent's tools — it does not orchestrate the loop anymore.
 */

export interface Participant {
  id: string;
  kind: ParticipantKind;
  name: string;
  ac: number;
  currentHP: number;
  maxHP: number;
  conditions: Array<{ type: string; durationRounds?: number; source?: string }>;
  isCurrent: boolean;
  initiative: number;
}

export interface CombatState {
  combatId: string;
  round: number;
  currentTurnIndex: number;
  participants: Participant[];
  endedAt?: string;
}

const npcInputSchema = z.object({
  name: z.string().min(1).max(60),
  ac: z.number().int().min(5).max(30),
  hp: z.number().int().min(1),
  dexMod: z.number().int().min(-5).max(10).optional(),
});

export const startEncounterSchema = z.object({
  sessionId: z.string().uuid(),
  npcs: z.array(npcInputSchema).min(1),
});

// ----------------------------------------------------------------------------
// Lifecycle
// ----------------------------------------------------------------------------

export async function startEncounter(input: {
  sessionId: string;
  npcs: Array<{ name: string; ac: number; hp: number; dexMod?: number }>;
  characters: CharacterRow[];
}): Promise<CombatState> {
  const supabase = createSupabaseServiceClient();
  const npcs: NpcCombatant[] = [];
  const orderRaw: ParticipantOrderEntry[] = [];

  for (const c of input.characters) {
    const dexMod = Math.floor((c.dex - 10) / 2);
    const init = rollInitiative({ dexMod }).total;
    orderRaw.push({
      id: c.id,
      kind: c.is_ai ? 'companion' : 'pc',
      initiative: init,
      dexMod,
    });
  }
  let npcIdx = 0;
  for (const n of input.npcs) {
    const dexMod = n.dexMod ?? 0;
    const init = rollInitiative({ dexMod }).total;
    const id = `npc-${Date.now()}-${npcIdx++}`;
    orderRaw.push({ id, kind: 'npc', initiative: init, dexMod });
    npcs.push({
      id,
      name: n.name,
      ac: n.ac,
      currentHP: n.hp,
      maxHP: n.hp,
      dexMod,
      conditions: [],
    });
  }

  const sortedRaw = sortInitiative(
    orderRaw.map((o) => ({ id: o.id, total: o.initiative, dexMod: o.dexMod })),
  );
  const order: ParticipantOrderEntry[] = sortedRaw.map((s) => {
    const found = orderRaw.find((o) => o.id === s.id);
    if (!found) throw new Error(`participant ${s.id} disparu après tri`);
    return { id: s.id, kind: found.kind, initiative: s.total, dexMod: s.dexMod };
  });

  const { data, error } = await supabase
    .from('combat_encounters')
    .insert({
      session_id: input.sessionId,
      status: 'active',
      round: 1,
      current_turn_index: 0,
      participants_order: order,
      npcs,
      version: 0,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'startEncounter failed');
  return await buildCombatState(data as CombatEncounterRow);
}

export async function endEncounter(combatId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from('combat_encounters')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', combatId);
}

export async function getActiveEncounter(sessionId: string): Promise<CombatEncounterRow | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as CombatEncounterRow | null;
}

export async function getActiveCombatState(sessionId: string): Promise<CombatState | null> {
  const enc = await getActiveEncounter(sessionId);
  if (!enc) return null;
  return await buildCombatState(enc);
}

// ----------------------------------------------------------------------------
// State assembly (npcs JSONB ⊕ characters table)
// ----------------------------------------------------------------------------

export async function buildCombatState(encounter: CombatEncounterRow): Promise<CombatState> {
  const supabase = createSupabaseServiceClient();
  const order = encounter.participants_order ?? [];
  const npcs = encounter.npcs ?? [];
  const charIds = order.filter((o) => o.kind !== 'npc').map((o) => o.id);
  const charById = new Map<
    string,
    Pick<CharacterRow, 'id' | 'name' | 'ac' | 'current_hp' | 'max_hp' | 'conditions'>
  >();
  if (charIds.length > 0) {
    const { data: chars } = await supabase
      .from('characters')
      .select('id, name, ac, current_hp, max_hp, conditions')
      .in('id', charIds);
    for (const c of chars ?? []) {
      charById.set(
        c.id,
        c as Pick<CharacterRow, 'id' | 'name' | 'ac' | 'current_hp' | 'max_hp' | 'conditions'>,
      );
    }
  }
  const npcById = new Map(npcs.map((n) => [n.id, n]));

  const participants: Participant[] = [];
  order.forEach((o, idx) => {
    if (o.kind === 'npc') {
      const n = npcById.get(o.id);
      if (!n) return;
      participants.push({
        id: n.id,
        kind: 'npc',
        name: n.name,
        ac: n.ac,
        currentHP: n.currentHP,
        maxHP: n.maxHP,
        conditions: n.conditions ?? [],
        isCurrent: idx === encounter.current_turn_index,
        initiative: o.initiative,
      });
    } else {
      const c = charById.get(o.id);
      if (!c) return;
      participants.push({
        id: c.id,
        kind: o.kind,
        name: c.name,
        ac: c.ac,
        currentHP: c.current_hp,
        maxHP: c.max_hp,
        conditions: (c.conditions ?? []) as Participant['conditions'],
        isCurrent: idx === encounter.current_turn_index,
        initiative: o.initiative,
      });
    }
  });

  return {
    combatId: encounter.id,
    round: encounter.round,
    currentTurnIndex: encounter.current_turn_index,
    participants,
    endedAt: encounter.ended_at ?? undefined,
  };
}

// ----------------------------------------------------------------------------
// Optimistic CAS write
// ----------------------------------------------------------------------------

async function casUpdate(
  combatId: string,
  patcher: (e: CombatEncounterRow) => Partial<CombatEncounterRow>,
): Promise<CombatEncounterRow> {
  const supabase = createSupabaseServiceClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: readErr } = await supabase
      .from('combat_encounters')
      .select('*')
      .eq('id', combatId)
      .single();
    if (readErr || !current) throw new Error(readErr?.message ?? 'Combat introuvable');
    const enc = current as CombatEncounterRow;
    const patch = patcher(enc);
    const { data, error } = await supabase
      .from('combat_encounters')
      .update({ ...patch, version: enc.version + 1 })
      .eq('id', combatId)
      .eq('version', enc.version)
      .select('*')
      .maybeSingle();
    if (data) return data as CombatEncounterRow;
    if (error) throw new Error(error.message);
    // version mismatch → another writer raced us, retry
  }
  throw new Error('CAS conflict on combat_encounters after 3 retries');
}

// ----------------------------------------------------------------------------
// Turn advancement (server-authoritative)
// ----------------------------------------------------------------------------

export function checkAllNpcsDown(state: CombatState): boolean {
  const npcs = state.participants.filter((p) => p.kind === 'npc');
  if (npcs.length === 0) return false;
  return npcs.every((n) => n.currentHP <= 0);
}

const allNpcsDown = checkAllNpcsDown;

/**
 * Pure walk through participants_order starting from `currentTurnIndex` to
 * find the next non-KO actor. Returns the new index, the new round number,
 * and whether a round-wrap happened (caller uses this to schedule a tick).
 * Exposed so tests can assert behavior without an active database.
 */
export function findNextActor(
  participants: CombatState['participants'],
  currentTurnIndex: number,
  round: number,
): { nextTurnIndex: number; nextRound: number; wrapped: boolean } {
  const orderLen = participants.length;
  if (orderLen === 0) {
    return { nextTurnIndex: currentTurnIndex, nextRound: round, wrapped: false };
  }
  let nextIdx = currentTurnIndex;
  let nextRound = round;
  let wrapped = false;
  for (let step = 0; step < orderLen; step++) {
    nextIdx += 1;
    if (nextIdx >= orderLen) {
      nextIdx = 0;
      nextRound += 1;
      wrapped = true;
    }
    const candidate = participants[nextIdx];
    if (!candidate) break;
    if (candidate.currentHP > 0) break;
  }
  return { nextTurnIndex: nextIdx, nextRound, wrapped };
}

/**
 * Walk the cursor forward until a living participant is reached. Skips KO'd
 * combatants. When the cursor wraps past index 0, increments the round and
 * ticks every participant's conditions (PCs in characters, NPCs in npcs).
 * Auto-ends the encounter if all NPCs are down.
 */
export async function advanceUntilNextActor(
  sessionId: string,
): Promise<{ ended: boolean; state: CombatState | null }> {
  const enc = await getActiveEncounter(sessionId);
  if (!enc) return { ended: true, state: null };

  const preState = await buildCombatState(enc);
  if (allNpcsDown(preState)) {
    await endEncounter(enc.id);
    return { ended: true, state: { ...preState, endedAt: new Date().toISOString() } };
  }

  const orderLen = enc.participants_order.length;
  if (orderLen === 0) return { ended: false, state: preState };

  const {
    nextTurnIndex: nextIdx,
    nextRound,
    wrapped: needsTick,
  } = findNextActor(preState.participants, enc.current_turn_index, enc.round);

  const updated = await casUpdate(enc.id, (e) => {
    let npcs = e.npcs;
    if (needsTick) {
      npcs = e.npcs.map((n) => ({
        ...n,
        conditions: tickConditions((n.conditions ?? []) as Condition[]),
      }));
    }
    return {
      current_turn_index: nextIdx,
      round: nextRound,
      npcs,
    };
  });

  if (needsTick) {
    const supabase = createSupabaseServiceClient();
    const charEntries = enc.participants_order.filter((o) => o.kind !== 'npc');
    for (const e of charEntries) {
      const { data } = await supabase
        .from('characters')
        .select('conditions')
        .eq('id', e.id)
        .maybeSingle();
      if (!data) continue;
      const next = tickConditions((data.conditions ?? []) as Condition[]);
      await supabase.from('characters').update({ conditions: next }).eq('id', e.id);
    }
  }

  const state = await buildCombatState(updated);
  if (allNpcsDown(state)) {
    await endEncounter(updated.id);
    return { ended: true, state: { ...state, endedAt: new Date().toISOString() } };
  }
  return { ended: false, state };
}

// ----------------------------------------------------------------------------
// Damage / healing (no PC/NPC mirror — characters table is source of truth for PCs)
// ----------------------------------------------------------------------------

export type DamageResult =
  | { ok: true; currentHP: number; maxHP: number; state: CombatState | null }
  | { ok: false; error: string };

export async function applyDamageToParticipant(
  sessionId: string,
  participantId: string,
  amount: number,
): Promise<DamageResult> {
  const enc = await getActiveEncounter(sessionId);
  // No active encounter — only PC/companion damage makes sense (write to characters directly).
  if (!enc) {
    if (participantId.startsWith('npc-')) {
      return { ok: false, error: 'PNJ ciblé sans rencontre active' };
    }
    const r = await applyDamageToCharacterRow(participantId, amount);
    return r.ok ? { ...r, state: null } : r;
  }
  const entry = enc.participants_order.find((o) => o.id === participantId);
  // Character outside the encounter (out-of-combat heal/damage on PC) — direct character update.
  if (!entry) {
    if (participantId.startsWith('npc-')) {
      return { ok: false, error: 'PNJ inconnu de la rencontre' };
    }
    const r = await applyDamageToCharacterRow(participantId, amount);
    return r.ok ? { ...r, state: await buildCombatState(enc) } : r;
  }
  if (entry.kind === 'npc') {
    const updated = await casUpdate(enc.id, (e) => {
      const npcs = e.npcs.map((n) => {
        if (n.id !== participantId) return n;
        const hp = { current: n.currentHP, max: n.maxHP, temp: 0 };
        if (amount >= 0) {
          const r = applyDamage(hp, amount);
          return { ...n, currentHP: r.state.current };
        }
        const r = applyHealing(hp, -amount);
        return { ...n, currentHP: r.current };
      });
      return { npcs };
    });
    const state = await buildCombatState(updated);
    const updatedNpc = updated.npcs.find((n) => n.id === participantId);
    return {
      ok: true,
      currentHP: updatedNpc?.currentHP ?? 0,
      maxHP: updatedNpc?.maxHP ?? 0,
      state,
    };
  }
  // PC / companion → write characters row only. No mirror.
  const r = await applyDamageToCharacterRow(participantId, amount);
  return r.ok ? { ...r, state: await buildCombatState(enc) } : r;
}

async function applyDamageToCharacterRow(
  characterId: string,
  amount: number,
): Promise<{ ok: true; currentHP: number; maxHP: number } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, current_hp, max_hp, temp_hp')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  if (amount >= 0) {
    let remaining = amount;
    let temp = character.temp_hp;
    if (temp > 0) {
      const absorbed = Math.min(temp, remaining);
      temp -= absorbed;
      remaining -= absorbed;
    }
    const newCurrent = Math.max(0, character.current_hp - remaining);
    await supabase
      .from('characters')
      .update({ current_hp: newCurrent, temp_hp: temp })
      .eq('id', characterId);
    return { ok: true, currentHP: newCurrent, maxHP: character.max_hp };
  }
  const newCurrent = Math.min(character.max_hp, character.current_hp + -amount);
  await supabase.from('characters').update({ current_hp: newCurrent }).eq('id', characterId);
  return { ok: true, currentHP: newCurrent, maxHP: character.max_hp };
}

// ----------------------------------------------------------------------------
// Conditions
// ----------------------------------------------------------------------------

export type ConditionResult =
  | { ok: true; state: CombatState | null }
  | { ok: false; error: string };

export async function applyConditionToParticipant(
  sessionId: string,
  participantId: string,
  condition: ConditionType,
  add: boolean,
  durationRounds?: number,
): Promise<ConditionResult> {
  const enc = await getActiveEncounter(sessionId);
  if (!enc) {
    if (participantId.startsWith('npc-')) {
      return { ok: false, error: 'PNJ ciblé sans rencontre active' };
    }
    const r = await applyConditionToCharacterRow(participantId, condition, add, durationRounds);
    return r.ok ? { ok: true, state: null } : r;
  }
  const entry = enc.participants_order.find((o) => o.id === participantId);
  if (!entry) {
    if (participantId.startsWith('npc-')) {
      return { ok: false, error: 'PNJ inconnu de la rencontre' };
    }
    const r = await applyConditionToCharacterRow(participantId, condition, add, durationRounds);
    return r.ok ? { ok: true, state: await buildCombatState(enc) } : r;
  }
  if (entry.kind === 'npc') {
    const updated = await casUpdate(enc.id, (e) => {
      const npcs = e.npcs.map((n) => {
        if (n.id !== participantId) return n;
        const list = (n.conditions ?? []) as Condition[];
        const next = add
          ? addCondition(list, { type: condition, durationRounds })
          : removeCondition(list, condition);
        return { ...n, conditions: next };
      });
      return { npcs };
    });
    return { ok: true, state: await buildCombatState(updated) };
  }
  const r = await applyConditionToCharacterRow(participantId, condition, add, durationRounds);
  return r.ok ? { ok: true, state: await buildCombatState(enc) } : r;
}

async function applyConditionToCharacterRow(
  characterId: string,
  condition: ConditionType,
  add: boolean,
  durationRounds?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, conditions')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const list = ((character.conditions ?? []) as Condition[]).map((c) => ({
    type: c.type as ConditionType,
    durationRounds: c.durationRounds,
  }));
  const next = add
    ? addCondition(list, { type: condition, durationRounds })
    : removeCondition(list, condition);
  await supabase.from('characters').update({ conditions: next }).eq('id', characterId);
  return { ok: true };
}
