import { respondAsCompanion } from '../ai/companion-agent';
import type { GmEvent } from '../ai/events';
import { renderCombatBlock, runGmTurn } from '../ai/gm-agent';
import { runNpcTurn } from '../ai/npc-agent';
import { executePassTurn, executeRoll } from '../ai/tool-executors';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow, Universe } from '../db/types';
import { type CombatState, getActiveCombatState } from './combat-loop';

/**
 * Server-authoritative turn orchestrator. Reads the combat state machine and
 * dispatches each turn to the correct agent (narrator, npc, companion). The
 * client receives a single SSE stream with `turn_start` / `turn_end`
 * boundaries between distinct authors — no client-side chaining.
 *
 * Loop terminates when:
 *   • cursor lands on a PC (waiting for player input), OR
 *   • narrator returns in NARRATIVE mode (story progressed, no combat), OR
 *   • MAX_DEPTH iterations reached (defensive cap).
 */

export type ActorRef =
  | { kind: 'narrator' }
  | { kind: 'npc'; id: string; name: string }
  | { kind: 'companion'; id: string; name: string };

export type OrchestratorEvent =
  | GmEvent
  | { type: 'turn_start'; actor: ActorRef }
  | { type: 'turn_end'; actor: ActorRef };

export interface TurnLoopInput {
  sessionId: string;
  campaignId: string;
  userMessage: string;
  trigger: 'user_input' | 'companion_spoke' | 'session_intro';
  history: MessageRow[];
  player: CharacterRow | null;
  companions: CharacterRow[];
  worldSummary: string | null;
  universe: Universe | null;
}

const MAX_DEPTH = 12;

export async function* runTurnLoop(input: TurnLoopInput): AsyncGenerator<OrchestratorEvent> {
  let userMsg = input.userMessage;
  let trigger = input.trigger;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const state = await getActiveCombatState(input.sessionId).catch(() => null);

    // ─── NARRATIVE mode ────────────────────────────────────────────────
    if (!state || state.endedAt) {
      yield { type: 'turn_start', actor: { kind: 'narrator' } };
      yield* forwardWithoutDone(
        runGmTurn({
          sessionId: input.sessionId,
          userMessage:
            trigger === 'companion_spoke'
              ? "(Un compagnon vient de parler ci-dessus. Réagis brièvement en tant que MJ : décris la réaction des autres autour du feu, ou enchaîne la scène, sans répéter ce qu'il a dit.)"
              : trigger === 'session_intro'
                ? "(Début de session. Ouvre l'aventure en tant que MJ : pose le décor en 4-6 phrases (lieu, ambiance, ce que les sens captent), présente brièvement le PJ et les compagnons présents en t'appuyant sur leur fiche, puis lance un hook narratif (rumeur, croisement, événement) et termine par « Que fais-tu ? ». Ne décris pas un combat, ne lance pas de dés, ne demande pas l'intention pour des objets — c'est une ouverture narrative.)"
                : userMsg,
          history: await refreshHistory(input.sessionId, input.history),
          player: input.player,
          companions: input.companions,
          worldSummary: input.worldSummary,
          universe: input.universe,
        }),
      );
      yield { type: 'turn_end', actor: { kind: 'narrator' } };
      // After narrator: combat may have started (start_combat tool). Loop and check.
      const newState = await getActiveCombatState(input.sessionId).catch(() => null);
      userMsg = '';
      trigger = 'user_input';
      if (!newState || newState.endedAt) return;
      continue;
    }

    // ─── COMBAT mode ───────────────────────────────────────────────────
    const cur = state.participants.find((p) => p.isCurrent);
    if (!cur) return;

    if (cur.kind === 'pc') {
      if (userMsg) {
        // Player spoke in combat → narrator resolves their action
        yield { type: 'turn_start', actor: { kind: 'narrator' } };
        yield* forwardWithoutDone(
          runGmTurn({
            sessionId: input.sessionId,
            userMessage: userMsg,
            history: await refreshHistory(input.sessionId, input.history),
            player: input.player,
            companions: input.companions,
            worldSummary: input.worldSummary,
            universe: input.universe,
          }),
        );
        yield { type: 'turn_end', actor: { kind: 'narrator' } };
        userMsg = '';
        continue;
      }
      return; // wait for player input
    }

    if (cur.kind === 'npc') {
      yield { type: 'turn_start', actor: { kind: 'npc', id: cur.id, name: cur.name } };
      try {
        yield* runNpcTurn({
          sessionId: input.sessionId,
          npc: cur,
          combatState: state,
          history: await refreshHistory(input.sessionId, input.history),
          universe: input.universe ?? 'dnd5e',
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[orchestrator.npc]', err);
        // Fallback: pass turn so the loop progresses even if the agent failed.
        const result = await executePassTurn(input.sessionId);
        for (const ev of result.events) yield ev;
      }
      yield { type: 'turn_end', actor: { kind: 'npc', id: cur.id, name: cur.name } };
      continue;
    }

    if (cur.kind === 'companion') {
      const companion = input.companions.find((c) => c.id === cur.id);
      if (!companion) {
        // Defensive: companion row missing → pass turn, don't stall
        const result = await executePassTurn(input.sessionId);
        for (const ev of result.events) yield ev;
        continue;
      }
      yield { type: 'turn_start', actor: { kind: 'companion', id: cur.id, name: cur.name } };
      try {
        const turn = await respondAsCompanion({
          sessionId: input.sessionId,
          character: companion,
          history: await refreshHistory(input.sessionId, input.history),
          combatState: state,
          combatBlock: renderCombatBlock(state),
          universe: input.universe,
          executeRoll,
        });
        if (turn.text) {
          yield {
            type: 'companion',
            characterId: cur.id,
            characterName: cur.name,
            content: turn.text,
          };
        }
        for (const ev of turn.events) yield ev;
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[orchestrator.companion]', err);
        const result = await executePassTurn(input.sessionId);
        for (const ev of result.events) yield ev;
      }
      yield { type: 'turn_end', actor: { kind: 'companion', id: cur.id, name: cur.name } };
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[orchestrator] MAX_DEPTH reached — closing turn loop defensively');
  }
}

/**
 * Forward an inner agent's events but suppress its `done` marker — the
 * orchestrator emits `turn_end` instead, and a single `done` at the end of
 * the entire stream from the SSE route.
 */
async function* forwardWithoutDone(iter: AsyncGenerator<GmEvent>): AsyncGenerator<GmEvent> {
  for await (const ev of iter) {
    if (ev.type === 'done') continue;
    yield ev;
  }
}

/**
 * Refetch the messages table so chained turns see the just-persisted output
 * of previous turns. Falls back to the snapshot we got at the start of the
 * orchestrator if the refetch fails.
 */
async function refreshHistory(sessionId: string, fallback: MessageRow[]): Promise<MessageRow[]> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    return (data ?? fallback) as MessageRow[];
  } catch {
    return fallback;
  }
}

// Re-export CombatState for ergonomic imports from consumers (route handler).
export type { CombatState };
