import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { ParticipantKind } from '../db/types';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
import { CONDITION_TYPES, type ConditionType } from '../rules/types';
import {
  advanceUntilNextActor,
  applyConditionToParticipant,
  applyDamageToParticipant,
  type CombatState,
} from '../server/combat-loop';
import type { DiceRollRecord, GmEvent } from './events';
import { combatantBelongsToSession } from './tenant-guard';
import type { RequestRollInput } from './tools';

/**
 * Shared tool executors used by every agent (narrator, npc, companion).
 * These are the pure server-side resolution paths — no prompt knowledge,
 * no role-specific behavior. Each agent decides which tools to expose; the
 * server resolves them identically.
 */

// --- Zod schemas -----------------------------------------------------------

const ROLL_KINDS = [
  'attack',
  'damage',
  'heal',
  'save',
  'check',
  'initiative',
  'concentration',
] as const;
const ADVANTAGE = ['normal', 'advantage', 'disadvantage'] as const;

const combatantIdSchema = z.string().min(1).max(128);

export const rollSchema = z.object({
  kind: z.enum(ROLL_KINDS),
  label: z.string().trim().min(1).max(80),
  dice: z.string().regex(/^\s*\d*d(4|6|8|10|12|20|100)(\s*[+-]\s*\d+)?\s*$/i),
  dc: z.number().int().min(1).max(40).optional(),
  target_ac: z.number().int().min(1).max(40).optional(),
  advantage: z.enum(ADVANTAGE).optional(),
  // When kind='damage' and target_combatant_id is provided, the server
  // applies the damage total automatically — no separate apply_damage call.
  // Positive total = damage, negative = heal.
  target_combatant_id: z.string().min(1).max(128).optional(),
});

export const applyConditionSchema = z.object({
  combatant_id: combatantIdSchema,
  condition: z.enum(CONDITION_TYPES as unknown as [string, ...string[]]),
  add: z.boolean(),
  duration_rounds: z.number().int().min(1).max(100).optional(),
});

export const passTurnSchema = z.object({
  reason: z.string().trim().max(160).optional(),
});

// --- Helpers ---------------------------------------------------------------

/**
 * Compact summary of the current actor for tool results — gives the calling
 * agent unambiguous "whose turn is it now" feedback after any
 * combat-advancing mutation.
 */
export function nextActorInfo(
  state: CombatState | null,
): { id: string; name: string; kind: ParticipantKind } | null {
  if (!state || state.endedAt) return null;
  const actor = state.participants.find((p) => p.isCurrent);
  if (!actor) return null;
  return { id: actor.id, name: actor.name, kind: actor.kind };
}

/**
 * Parse an LLM-provided tool input with Zod. Returns the parsed value or an
 * error payload that can be fed back to the LLM without crashing the turn.
 */
export function parseToolInput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; result: unknown } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    result: {
      error: 'Invalid tool input',
      details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    },
  };
}

// --- request_roll executor ------------------------------------------------

export async function executeRoll(
  input: RequestRollInput,
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const advantage = input.advantage ?? 'normal';
  const roll = resolveRoll(input, advantage);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('dice_rolls')
    .insert({
      session_id: sessionId,
      roll_kind: input.kind,
      expression: input.dice,
      raw_dice: roll.dice,
      modifier: roll.modifier,
      total: roll.total,
      advantage,
      dc: input.dc ?? null,
      target_ac: input.target_ac ?? null,
      outcome: roll.outcome,
      context: { label: input.label },
    })
    .select('*')
    .single();

  const record: DiceRollRecord = {
    id: data?.id,
    kind: input.kind,
    label: input.label,
    expression: input.dice,
    dice: roll.dice,
    modifier: roll.modifier,
    total: roll.total,
    outcome: roll.outcome,
    advantage,
    ...(input.dc !== undefined ? { dc: input.dc } : {}),
    ...(input.target_ac !== undefined ? { targetAC: input.target_ac } : {}),
  };
  const events: GmEvent[] = [
    { type: 'dice_request', rollId: data?.id ?? 'local', roll: record, label: input.label },
  ];

  // Auto-apply damage / heal when targeting a combatant. Tenant-guarded so a
  // hallucinated UUID can't touch another campaign.
  let applied: { target: string; newHp?: number; mode?: 'damage' | 'heal' } | null = null;
  const applyable =
    (input.kind === 'damage' || input.kind === 'heal') &&
    input.target_combatant_id &&
    roll.total !== 0;
  if (applyable) {
    const targetId = input.target_combatant_id as string;
    if (await combatantBelongsToSession(sessionId, targetId)) {
      try {
        const signed = input.kind === 'heal' ? -roll.total : roll.total;
        const res = await applyDamageToParticipant(sessionId, targetId, signed);
        if (res.ok) {
          applied = {
            target: targetId,
            newHp: res.currentHP,
            mode: input.kind as 'damage' | 'heal',
          };
          if (res.state) events.push({ type: 'combat_state', state: res.state });
        } else if (process.env.NODE_ENV !== 'production') {
          console.warn(`[roll.${input.kind}] auto-apply rejected`, res.error);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[roll.${input.kind}] auto-apply failed`, err);
        }
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn(`[roll.${input.kind}] target ${targetId} not in session — not applied`);
    }
  }

  // Server-authoritative turn advance. The active actor's turn ends after:
  //   • a damage or heal roll (the action's resolution roll), OR
  //   • an attack roll that misses (no follow-up damage will come).
  // Hits don't advance — a damage roll follows which then advances.
  const finishesTurn =
    input.kind === 'damage' ||
    input.kind === 'heal' ||
    (input.kind === 'attack' && roll.outcome === 'miss');
  let nextActor: ReturnType<typeof nextActorInfo> = null;
  if (finishesTurn) {
    try {
      const adv = await advanceUntilNextActor(sessionId);
      if (adv.state) {
        events.push({ type: 'combat_state', state: adv.state });
        nextActor = nextActorInfo(adv.state);
      }
      if (adv.ended) events.push({ type: 'combat_ended' });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[roll.advance] auto-advance failed', err);
      }
    }
  }

  return {
    result: {
      total: roll.total,
      dice: roll.dice,
      outcome: roll.outcome,
      label: input.label,
      ...(applied ? { applied } : {}),
      ...(nextActor ? { next_actor: nextActor } : {}),
    },
    events,
  };
}

function resolveRoll(
  input: RequestRollInput,
  advantage: 'normal' | 'advantage' | 'disadvantage',
): { dice: number[]; modifier: number; total: number; outcome: string | null } {
  const parsed = parseDiceExpression(input.dice);
  if (
    parsed.faces === 20 &&
    parsed.count === 1 &&
    input.kind !== 'damage' &&
    input.kind !== 'heal'
  ) {
    const d20 = rollD20(parsed.modifier, advantage);
    const nat = d20.roll;
    const outcome =
      input.kind === 'attack'
        ? nat === 20
          ? 'crit'
          : nat === 1
            ? 'fumble'
            : input.target_ac !== undefined && d20.total >= input.target_ac
              ? 'hit'
              : 'miss'
        : input.dc !== undefined
          ? d20.total >= input.dc
            ? 'success'
            : 'failure'
          : null;
    return { dice: d20.rawRolls, modifier: parsed.modifier, total: d20.total, outcome };
  }
  const r = rollExpression(input.dice);
  return { dice: r.dice, modifier: r.modifier, total: r.total, outcome: null };
}

// --- pass_turn executor ---------------------------------------------------

export async function executePassTurn(
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const events: GmEvent[] = [];
  try {
    const adv = await advanceUntilNextActor(sessionId);
    if (adv.state) events.push({ type: 'combat_state', state: adv.state });
    if (adv.ended) events.push({ type: 'combat_ended' });
    return {
      result: {
        ok: true,
        ended: adv.ended,
        next_actor: nextActorInfo(adv.state ?? null),
      },
      events,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[pass_turn] advance failed', err);
    }
    return { result: { error: 'Avance impossible (pas de combat actif ?)' }, events: [] };
  }
}

// --- apply_condition executor ---------------------------------------------

export async function executeApplyCondition(
  sessionId: string,
  input: { combatant_id: string; condition: ConditionType; add: boolean; duration_rounds?: number },
): Promise<{ result: unknown; events: GmEvent[] }> {
  if (!(await combatantBelongsToSession(sessionId, input.combatant_id))) {
    return { result: { error: 'Cible hors campagne' }, events: [] };
  }
  const cond = await applyConditionToParticipant(
    sessionId,
    input.combatant_id,
    input.condition,
    input.add,
    input.duration_rounds,
  );
  if (!cond.ok) return { result: { error: cond.error }, events: [] };
  const events: GmEvent[] = [];
  if (cond.state) events.push({ type: 'combat_state', state: cond.state });
  return { result: { ok: true }, events };
}
