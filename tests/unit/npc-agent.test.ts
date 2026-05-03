import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ai/llm', () => ({
  llm: () => ({
    chat: vi.fn().mockResolvedValue({ text: '', toolCalls: [], stopReason: 'end_turn' }),
  }),
  modelFor: () => 'mock',
}));

const passTurnSpy = vi.fn();
vi.mock('../../lib/ai/tool-executors', async () => {
  const actual = await vi.importActual<typeof import('../../lib/ai/tool-executors')>(
    '../../lib/ai/tool-executors',
  );
  return {
    ...actual,
    executePassTurn: (sessionId: string) => {
      passTurnSpy(sessionId);
      return Promise.resolve({
        result: { ok: true, ended: false, next_actor: null },
        events: [
          {
            type: 'combat_state' as const,
            state: { combatId: 'c', round: 1, currentTurnIndex: 1, participants: [] },
          },
        ],
      });
    },
  };
});

import { runNpcTurn } from '../../lib/ai/npc-agent';
import type { Participant } from '../../lib/server/combat-loop';

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'npc-1',
    kind: 'npc',
    name: 'Gobelin',
    ac: 13,
    currentHP: 7,
    maxHP: 7,
    conditions: [],
    isCurrent: true,
    initiative: 10,
    ...overrides,
  };
}

describe('runNpcTurn — no enemies fast path', () => {
  beforeEach(() => {
    passTurnSpy.mockClear();
  });

  it('passes turn immediately when no living enemies remain', async () => {
    const npc = makeParticipant({ id: 'npc-1', isCurrent: true });
    const allyDown = makeParticipant({ id: 'npc-2', isCurrent: false, currentHP: 0 });
    const events: unknown[] = [];
    for await (const ev of runNpcTurn({
      sessionId: 'sess',
      npc,
      combatState: {
        combatId: 'c',
        round: 1,
        currentTurnIndex: 0,
        participants: [npc, allyDown],
      },
      history: [],
      universe: 'dnd5e',
    })) {
      events.push(ev);
    }
    expect(passTurnSpy).toHaveBeenCalledWith('sess');
    expect(passTurnSpy).toHaveBeenCalledTimes(1);
    expect(events.some((e) => (e as { type?: string }).type === 'combat_state')).toBe(true);
    expect(events.some((e) => (e as { type?: string }).type === 'done')).toBe(true);
  });

  it('does not call pass_turn when a living PC enemy exists (LLM stops without tool call)', async () => {
    const npc = makeParticipant({ id: 'npc-1', isCurrent: true });
    const pc: Participant = {
      id: 'pc-1',
      kind: 'pc',
      name: 'Hero',
      ac: 16,
      currentHP: 20,
      maxHP: 20,
      conditions: [],
      isCurrent: false,
      initiative: 14,
    };
    for await (const _ev of runNpcTurn({
      sessionId: 'sess',
      npc,
      combatState: {
        combatId: 'c',
        round: 1,
        currentTurnIndex: 0,
        participants: [npc, pc],
      },
      history: [],
      universe: 'dnd5e',
    })) {
      // consume
    }
    // The LLM mock returns no tool calls and ends → npc-agent finishes without
    // forcing a pass_turn. Server-side `executeRoll` would have been the only
    // path advancing the cursor, and the mock doesn't trigger it.
    expect(passTurnSpy).not.toHaveBeenCalled();
  });
});
