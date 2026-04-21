import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, CombatEncounterRow } from '../db/types';
import { rollInitiative, sortInitiative } from '../rules/combat';
import { addCondition, removeCondition } from '../rules/conditions';
import { applyDamage, applyHealing } from '../rules/hitPoints';
import type { ConditionType } from '../rules/types';

export interface Combatant {
  id: string;
  kind: 'pc' | 'companion' | 'npc';
  name: string;
  ac: number;
  maxHP: number;
  currentHP: number;
  initiative: number;
  dexMod: number;
  conditions: Array<{ type: string; durationRounds?: number }>;
  characterId?: string; // set for pc / companion rows
}

export const startCombatSchema = z.object({
  sessionId: z.string().uuid(),
  npcs: z.array(
    z.object({
      name: z.string().min(1).max(60),
      ac: z.number().int().min(5).max(30),
      hp: z.number().int().min(1),
      dexMod: z.number().int().min(-5).max(10).default(0),
    }),
  ),
});

export async function startCombat(input: {
  sessionId: string;
  npcs: Array<{ name: string; ac: number; hp: number; dexMod?: number }>;
  characters: CharacterRow[];
}): Promise<CombatEncounterRow> {
  const supabase = createSupabaseServiceClient();
  const combatants: Combatant[] = [];

  for (const c of input.characters) {
    const dexMod = Math.floor((c.dex - 10) / 2);
    const init = rollInitiative({ dexMod }).total;
    combatants.push({
      id: c.id,
      kind: c.is_ai ? 'companion' : 'pc',
      name: c.name,
      ac: c.ac,
      maxHP: c.max_hp,
      currentHP: c.current_hp,
      initiative: init,
      dexMod,
      conditions: c.conditions ?? [],
      characterId: c.id,
    });
  }
  let npcIdx = 0;
  for (const n of input.npcs) {
    const dexMod = n.dexMod ?? 0;
    const init = rollInitiative({ dexMod }).total;
    combatants.push({
      id: `npc-${Date.now()}-${npcIdx++}`,
      kind: 'npc',
      name: n.name,
      ac: n.ac,
      maxHP: n.hp,
      currentHP: n.hp,
      initiative: init,
      dexMod,
      conditions: [],
    });
  }

  const order = sortInitiative(
    combatants.map((c) => ({ id: c.id, total: c.initiative, dexMod: c.dexMod })),
  );

  const { data, error } = await supabase
    .from('combat_encounters')
    .insert({
      session_id: input.sessionId,
      status: 'active',
      round: 1,
      current_turn_index: 0,
      initiative_order: order,
      combatants,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'start_combat failed');
  return data;
}

export async function endCombat(combatId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from('combat_encounters')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', combatId);
}

export async function activeEncounter(sessionId: string): Promise<CombatEncounterRow | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function mutateEncounter(
  combatId: string,
  mutate: (e: CombatEncounterRow) => CombatEncounterRow,
): Promise<CombatEncounterRow> {
  const supabase = createSupabaseServiceClient();
  const { data: current } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('id', combatId)
    .single();
  if (!current) throw new Error('Combat introuvable');
  const next = mutate(current as CombatEncounterRow);
  const { data, error } = await supabase
    .from('combat_encounters')
    .update({
      round: next.round,
      current_turn_index: next.current_turn_index,
      initiative_order: next.initiative_order,
      combatants: next.combatants,
    })
    .eq('id', combatId)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'mutate failed');
  return data;
}

export function applyDamageToCombatant(
  encounter: CombatEncounterRow,
  combatantId: string,
  amount: number,
): CombatEncounterRow {
  const combatants = (encounter.combatants as Combatant[]).map((c) => {
    if (c.id !== combatantId) return c;
    const hpState = { current: c.currentHP, max: c.maxHP, temp: 0 };
    const result = applyDamage(hpState, amount);
    return { ...c, currentHP: result.state.current };
  });
  return { ...encounter, combatants } as CombatEncounterRow;
}

export function healCombatant(
  encounter: CombatEncounterRow,
  combatantId: string,
  amount: number,
): CombatEncounterRow {
  const combatants = (encounter.combatants as Combatant[]).map((c) => {
    if (c.id !== combatantId) return c;
    const hpState = { current: c.currentHP, max: c.maxHP, temp: 0 };
    const next = applyHealing(hpState, amount);
    return { ...c, currentHP: next.current };
  });
  return { ...encounter, combatants } as CombatEncounterRow;
}

export function advanceTurnEncounter(encounter: CombatEncounterRow): CombatEncounterRow {
  const orderLen = (encounter.initiative_order as Array<unknown>).length;
  if (orderLen === 0) return encounter;
  const next = encounter.current_turn_index + 1;
  if (next >= orderLen) {
    return { ...encounter, current_turn_index: 0, round: encounter.round + 1 };
  }
  return { ...encounter, current_turn_index: next };
}

export function toggleCondition(
  encounter: CombatEncounterRow,
  combatantId: string,
  condition: ConditionType,
  add: boolean,
  durationRounds?: number,
): CombatEncounterRow {
  const combatants = (encounter.combatants as Combatant[]).map((c) => {
    if (c.id !== combatantId) return c;
    const list = c.conditions.map((x) => ({
      type: x.type as ConditionType,
      durationRounds: x.durationRounds,
    }));
    const next = add
      ? addCondition(list, { type: condition, durationRounds })
      : removeCondition(list, condition);
    return { ...c, conditions: next };
  });
  return { ...encounter, combatants } as CombatEncounterRow;
}
