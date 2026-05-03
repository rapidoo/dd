import { respondAsCompanion } from '../ai/companion-agent';
import type { GmEvent } from '../ai/events';
import { renderCombatBlock, runGmTurn } from '../ai/gm-agent';
import { runNpcTurn } from '../ai/npc-agent';
import { executePassTurn, executeRoll } from '../ai/tool-executors';
import type { CharacterRow, MessageRow, Universe } from '../db/types';
import { type CombatState, getActiveCombatState } from './combat-loop';
import { persistActorMessage, persistCompanionMessage } from './message-persistence';

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
  const history = [...input.history];

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const state = await getActiveCombatState(input.sessionId).catch(() => null);

    // ─── NARRATIVE mode ────────────────────────────────────────────────
    if (!state || state.endedAt) {
      const actor = { kind: 'narrator' } as const;
      yield { type: 'turn_start', actor };
      yield* forwardAndPersist({
        sessionId: input.sessionId,
        actor,
        history,
        events: runGmTurn({
          sessionId: input.sessionId,
          userMessage:
            trigger === 'companion_spoke'
              ? "(Un compagnon vient de parler ci-dessus. Réagis brièvement en tant que MJ : décris la réaction des autres autour du feu, ou enchaîne la scène, sans répéter ce qu'il a dit.)"
              : trigger === 'session_intro'
                ? "(Début de session. Ouvre l'aventure en tant que MJ : pose le décor en 4-6 phrases (lieu, ambiance, ce que les sens captent), présente brièvement le PJ et les compagnons présents en t'appuyant sur leur fiche, puis lance un hook narratif (rumeur, croisement, événement) et termine par « Que fais-tu ? ». Ne décris pas un combat, ne lance pas de dés, ne demande pas l'intention pour des objets — c'est une ouverture narrative.)"
                : userMsg,
          history,
          player: input.player,
          companions: input.companions,
          worldSummary: input.worldSummary,
          universe: input.universe,
        }),
      });
      yield { type: 'turn_end', actor };
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
        const actor = { kind: 'narrator' } as const;
        yield { type: 'turn_start', actor };
        yield* forwardAndPersist({
          sessionId: input.sessionId,
          actor,
          history,
          events: runGmTurn({
            sessionId: input.sessionId,
            userMessage: userMsg,
            history,
            player: input.player,
            companions: input.companions,
            worldSummary: input.worldSummary,
            universe: input.universe,
          }),
        });
        yield { type: 'turn_end', actor };
        userMsg = '';
        continue;
      }
      return; // wait for player input
    }

    if (cur.kind === 'npc') {
      const actor = { kind: 'npc', id: cur.id, name: cur.name } as const;
      yield { type: 'turn_start', actor };
      try {
        yield* forwardAndPersist({
          sessionId: input.sessionId,
          actor,
          history,
          events: runNpcTurn({
            sessionId: input.sessionId,
            npc: cur,
            combatState: state,
            history,
            universe: input.universe ?? 'dnd5e',
          }),
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[orchestrator.npc]', err);
        // Fallback: pass turn so the loop progresses even if the agent failed.
        const result = await executePassTurn(input.sessionId);
        for (const ev of result.events) yield ev;
      }
      yield { type: 'turn_end', actor };
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
          history,
          combatState: state,
          combatBlock: renderCombatBlock(state),
          universe: input.universe,
          executeRoll,
        });
        if (turn.text) {
          const row = await persistCompanionMessage({
            sessionId: input.sessionId,
            characterId: cur.id,
            characterName: cur.name,
            content: turn.text,
          });
          if (row) history.push(row);
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

async function* forwardAndPersist(input: {
  sessionId: string;
  actor: ActorRef;
  history: MessageRow[];
  events: AsyncGenerator<GmEvent>;
}): AsyncGenerator<GmEvent> {
  let text = '';
  const flushActorText = async () => {
    const row = await persistActorMessage({
      sessionId: input.sessionId,
      actor: input.actor,
      content: text,
    });
    if (row) input.history.push(row);
    text = '';
  };

  for await (const ev of input.events) {
    if (ev.type === 'done') continue;
    if (ev.type === 'text_delta') {
      text += ev.delta;
    } else if (ev.type === 'companion') {
      await flushActorText();
      const row = await persistCompanionMessage({
        sessionId: input.sessionId,
        characterId: ev.characterId,
        characterName: ev.characterName,
        content: ev.content,
      });
      if (row) input.history.push(row);
    }
    yield ev;
  }

  await flushActorText();
}

// Re-export CombatState for ergonomic imports from consumers (route handler).
export type { CombatState };
