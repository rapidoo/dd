import { describe, expect, it, vi } from 'vitest';

// gm-agent imports llm() at module load → mock it before importing renderCombatBlock.
vi.mock('../../lib/ai/llm', () => ({
  llm: () => ({ chat: () => Promise.reject(new Error('not used in pure tests')) }),
  modelFor: () => 'mock',
}));

import { renderCombatBlock } from '../../lib/ai/gm-agent';
import { checkAllNpcsDown, findNextActor, type Participant } from '../../lib/server/combat-loop';

function p(overrides: Partial<Participant>): Participant {
  return {
    id: 'x',
    kind: 'pc',
    name: 'X',
    ac: 10,
    currentHP: 10,
    maxHP: 10,
    conditions: [],
    isCurrent: false,
    initiative: 10,
    ...overrides,
  };
}

describe('findNextActor', () => {
  it('advances to the next slot when nobody is KO', () => {
    const ps = [p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' })];
    const out = findNextActor(ps, 0, 1);
    expect(out).toEqual({ nextTurnIndex: 1, nextRound: 1, wrapped: false });
  });

  it('skips KO participants', () => {
    const ps = [p({ id: 'a' }), p({ id: 'b', currentHP: 0 }), p({ id: 'c' })];
    const out = findNextActor(ps, 0, 1);
    expect(out.nextTurnIndex).toBe(2);
    expect(out.wrapped).toBe(false);
  });

  it('wraps and bumps round when the cursor passes the end', () => {
    const ps = [p({ id: 'a' }), p({ id: 'b' })];
    const out = findNextActor(ps, 1, 1);
    expect(out).toEqual({ nextTurnIndex: 0, nextRound: 2, wrapped: true });
  });

  it('skips multiple consecutive KO entries across a wrap', () => {
    const ps = [
      p({ id: 'pc', currentHP: 5 }),
      p({ id: 'n1', kind: 'npc', currentHP: 0 }),
      p({ id: 'n2', kind: 'npc', currentHP: 0 }),
    ];
    // Cursor at PC → next live combatant is back at PC (after wrapping past dead NPCs).
    const out = findNextActor(ps, 0, 1);
    expect(out.nextTurnIndex).toBe(0);
    expect(out.wrapped).toBe(true);
    expect(out.nextRound).toBe(2);
  });

  it('handles empty order', () => {
    const out = findNextActor([], 0, 1);
    expect(out).toEqual({ nextTurnIndex: 0, nextRound: 1, wrapped: false });
  });
});

describe('checkAllNpcsDown', () => {
  it('returns true when every NPC is at 0', () => {
    const state = {
      combatId: 'c',
      round: 1,
      currentTurnIndex: 0,
      participants: [
        p({ id: 'pc', currentHP: 8 }),
        p({ id: 'n1', kind: 'npc', currentHP: 0 }),
        p({ id: 'n2', kind: 'npc', currentHP: 0 }),
      ],
    };
    expect(checkAllNpcsDown(state)).toBe(true);
  });

  it('returns false when at least one NPC still standing', () => {
    const state = {
      combatId: 'c',
      round: 1,
      currentTurnIndex: 0,
      participants: [
        p({ id: 'n1', kind: 'npc', currentHP: 0 }),
        p({ id: 'n2', kind: 'npc', currentHP: 5 }),
      ],
    };
    expect(checkAllNpcsDown(state)).toBe(false);
  });

  it('returns false when there are no NPCs at all (PCs-only is not "won")', () => {
    const state = {
      combatId: 'c',
      round: 1,
      currentTurnIndex: 0,
      participants: [p({ id: 'pc', currentHP: 8 })],
    };
    expect(checkAllNpcsDown(state)).toBe(false);
  });
});

describe('renderCombatBlock', () => {
  it('returns empty string when there is no encounter', () => {
    expect(renderCombatBlock(null)).toBe('');
  });

  it('returns empty string when the encounter has been ended', () => {
    expect(
      renderCombatBlock({
        combatId: 'c',
        round: 1,
        currentTurnIndex: 0,
        participants: [p({ id: 'a', isCurrent: true })],
        endedAt: '2026-05-03T00:00:00Z',
      }),
    ).toBe('');
  });

  it('renders a header with the current actor and a cursor on their row', () => {
    const block = renderCombatBlock({
      combatId: 'c',
      round: 2,
      currentTurnIndex: 1,
      participants: [
        p({
          id: 'pc',
          kind: 'pc',
          name: 'Fred',
          isCurrent: false,
          currentHP: 9,
          maxHP: 12,
          ac: 14,
        }),
        p({
          id: 'npc-1',
          kind: 'npc',
          name: 'Gobelin',
          isCurrent: true,
          currentHP: 6,
          maxHP: 7,
          ac: 13,
        }),
      ],
    });
    expect(block).toContain('round 2');
    expect(block).toContain('tour de Gobelin');
    expect(block).toContain('▶ 2. Gobelin');
    expect(block).toContain('id="npc-1"');
    expect(block).toMatch(/Fred.*9\/12 PV.*CA 14/);
  });

  it('marks downed combatants as "abattu"', () => {
    const block = renderCombatBlock({
      combatId: 'c',
      round: 1,
      currentTurnIndex: 0,
      participants: [
        p({ id: 'pc', isCurrent: true }),
        p({ id: 'npc-1', kind: 'npc', name: 'Mort', currentHP: 0, maxHP: 5 }),
      ],
    });
    expect(block).toContain('0/5 — abattu');
  });
});
