import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getActiveCombatStateMock,
  runGmTurnMock,
  runNpcTurnMock,
  respondAsCompanionMock,
  executePassTurnMock,
} = vi.hoisted(() => ({
  getActiveCombatStateMock: vi.fn(),
  runGmTurnMock: vi.fn(),
  runNpcTurnMock: vi.fn(),
  respondAsCompanionMock: vi.fn(),
  executePassTurnMock: vi.fn(),
}));

vi.mock('../../lib/server/combat-loop', async () => {
  const actual = await vi.importActual<typeof import('../../lib/server/combat-loop')>(
    '../../lib/server/combat-loop',
  );
  return {
    ...actual,
    getActiveCombatState: getActiveCombatStateMock,
  };
});

vi.mock('../../lib/ai/gm-agent', () => ({
  runGmTurn: runGmTurnMock,
  renderCombatBlock: () => '',
}));

vi.mock('../../lib/ai/npc-agent', () => ({
  runNpcTurn: runNpcTurnMock,
}));

vi.mock('../../lib/ai/companion-agent', () => ({
  respondAsCompanion: respondAsCompanionMock,
}));

vi.mock('../../lib/ai/tool-executors', () => ({
  executeRoll: vi.fn(),
  executePassTurn: executePassTurnMock,
}));

vi.mock('../../lib/db/server', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  }),
}));

import { runTurnLoop } from '../../lib/server/turn-orchestrator';

async function* gmTurnFixture(text: string) {
  yield { type: 'text_delta' as const, delta: text };
  yield { type: 'done' as const };
}

async function* npcTurnFixture(text: string) {
  yield { type: 'text_delta' as const, delta: text };
}

const baseInput = {
  sessionId: 'sess',
  campaignId: 'camp',
  userMessage: 'go',
  trigger: 'user_input' as const,
  history: [],
  player: null,
  companions: [],
  worldSummary: null,
  universe: 'dnd5e' as const,
};

describe('runTurnLoop', () => {
  beforeEach(() => {
    getActiveCombatStateMock.mockReset();
    runGmTurnMock.mockReset();
    runNpcTurnMock.mockReset();
    respondAsCompanionMock.mockReset();
    executePassTurnMock.mockReset();
  });

  it('NARRATIVE mode: dispatches to narrator and emits turn_start/turn_end', async () => {
    getActiveCombatStateMock.mockResolvedValue(null);
    runGmTurnMock.mockReturnValue(gmTurnFixture('Le forgeron lève les yeux.'));

    const events: unknown[] = [];
    for await (const ev of runTurnLoop(baseInput)) events.push(ev);

    expect(runGmTurnMock).toHaveBeenCalledTimes(1);
    expect(events[0]).toEqual({ type: 'turn_start', actor: { kind: 'narrator' } });
    expect(events.at(-1)).toEqual({ type: 'turn_end', actor: { kind: 'narrator' } });
    // The inner `done` event must be filtered out — only the final SSE-level
    // done is emitted by the route handler.
    expect(events.find((e) => (e as { type?: string }).type === 'done')).toBeUndefined();
  });

  it('COMBAT mode + cursor on PC + no userMessage: returns immediately', async () => {
    getActiveCombatStateMock.mockResolvedValue({
      combatId: 'c',
      round: 1,
      currentTurnIndex: 0,
      participants: [
        {
          id: 'pc-1',
          kind: 'pc',
          name: 'Hero',
          ac: 16,
          currentHP: 20,
          maxHP: 20,
          conditions: [],
          isCurrent: true,
          initiative: 14,
        },
      ],
    });

    const events: unknown[] = [];
    for await (const ev of runTurnLoop({ ...baseInput, userMessage: '' })) events.push(ev);

    expect(events).toEqual([]);
    expect(runGmTurnMock).not.toHaveBeenCalled();
    expect(runNpcTurnMock).not.toHaveBeenCalled();
  });

  it('COMBAT mode + cursor on NPC: dispatches to npc-agent', async () => {
    const npcParticipant = {
      id: 'npc-1',
      kind: 'npc' as const,
      name: 'Gobelin',
      ac: 13,
      currentHP: 7,
      maxHP: 7,
      conditions: [],
      isCurrent: true,
      initiative: 10,
    };
    // First call: NPC's turn → npc-agent runs.
    // Second call (after npc-agent yields): cursor moved to PC → loop returns.
    getActiveCombatStateMock
      .mockResolvedValueOnce({
        combatId: 'c',
        round: 1,
        currentTurnIndex: 0,
        participants: [npcParticipant],
      })
      .mockResolvedValueOnce({
        combatId: 'c',
        round: 1,
        currentTurnIndex: 1,
        participants: [
          { ...npcParticipant, isCurrent: false },
          {
            id: 'pc-1',
            kind: 'pc' as const,
            name: 'Hero',
            ac: 16,
            currentHP: 20,
            maxHP: 20,
            conditions: [],
            isCurrent: true,
            initiative: 14,
          },
        ],
      });
    runNpcTurnMock.mockReturnValue(npcTurnFixture('Le gobelin attaque.'));

    const events: unknown[] = [];
    for await (const ev of runTurnLoop({ ...baseInput, userMessage: '' })) events.push(ev);

    expect(runNpcTurnMock).toHaveBeenCalledTimes(1);
    const start = events.find(
      (e) =>
        (e as { type?: string; actor?: { kind?: string } }).type === 'turn_start' &&
        (e as { actor?: { kind?: string } }).actor?.kind === 'npc',
    );
    expect(start).toBeDefined();
    const end = events.find(
      (e) =>
        (e as { type?: string; actor?: { kind?: string } }).type === 'turn_end' &&
        (e as { actor?: { kind?: string } }).actor?.kind === 'npc',
    );
    expect(end).toBeDefined();
  });

  it('COMBAT mode ended (endedAt set): runs narrator epilog and exits', async () => {
    getActiveCombatStateMock.mockResolvedValue({
      combatId: 'c',
      round: 3,
      currentTurnIndex: 0,
      participants: [],
      endedAt: '2026-05-03T19:00:00Z',
    });
    runGmTurnMock.mockReturnValue(gmTurnFixture('Le silence retombe sur la cage.'));

    const events: unknown[] = [];
    for await (const ev of runTurnLoop(baseInput)) events.push(ev);

    expect(runGmTurnMock).toHaveBeenCalledTimes(1);
    expect(events[0]).toEqual({ type: 'turn_start', actor: { kind: 'narrator' } });
  });
});
