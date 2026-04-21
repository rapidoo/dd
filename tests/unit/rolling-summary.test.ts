import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRow } from '../../lib/db/types';

// Mock Supabase service client — tracked state per test.
type SessionState = { summary: string | null; summary_cursor: string | null };
const state: {
  session: SessionState;
  lastUpdate: Partial<SessionState> | null;
} = {
  session: { summary: null, summary_cursor: null },
  lastUpdate: null,
};

vi.mock('../../lib/db/server', () => {
  const supabase = {
    from: (_t: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { ...state.session } }),
        update: (patch: Partial<SessionState>) => {
          state.lastUpdate = patch;
          state.session = { ...state.session, ...patch };
          return chain;
        },
      };
      return chain;
    },
  };
  return { createSupabaseServiceClient: () => supabase };
});

// LLM mock — returns a predictable string.
let haikuCalls = 0;
vi.mock('../../lib/ai/llm', () => ({
  llm: () => ({
    chat: async () => {
      haikuCalls++;
      return { text: `résumé ${haikuCalls}`, toolCalls: [], stopReason: 'end_turn' };
    },
  }),
  modelFor: () => 'mock',
}));

import { compactHistory } from '../../lib/ai/rolling-summary';

function msg(id: string, role: 'user' | 'gm', content: string): MessageRow {
  return {
    id,
    session_id: 's1',
    author_kind: role,
    author_id: null,
    content,
    created_at: new Date().toISOString(),
  } as MessageRow;
}

function history(n: number): MessageRow[] {
  return Array.from({ length: n }, (_, i) =>
    msg(`m${i + 1}`, i % 2 === 0 ? 'user' : 'gm', `content ${i + 1}`),
  );
}

describe('compactHistory', () => {
  beforeEach(() => {
    state.session = { summary: null, summary_cursor: null };
    state.lastUpdate = null;
    haikuCalls = 0;
  });

  it('returns history as-is under the threshold', async () => {
    const h = history(8);
    const result = await compactHistory('s1', h);
    expect(result.summary).toBeNull();
    expect(result.tail).toHaveLength(8);
    expect(haikuCalls).toBe(0);
  });

  it('summarizes when history exceeds threshold, keeps last 6', async () => {
    const h = history(20);
    const result = await compactHistory('s1', h);
    expect(result.summary).toBe('résumé 1');
    expect(result.tail).toHaveLength(6);
    expect(result.tail[0]?.id).toBe('m15');
    expect(result.tail[5]?.id).toBe('m20');
    expect(haikuCalls).toBe(1);
    expect(state.lastUpdate?.summary_cursor).toBe('m14');
  });

  it('reuses existing summary when few new messages', async () => {
    // Tail (6) = m10-m15. Compactable = m1-m9. Cursor m8, cursorIdx=7.
    // newSinceSummary = 9 - 1 - 7 = 1 → reuse.
    state.session = { summary: 'old', summary_cursor: 'm8' };
    const h = history(15);
    const result = await compactHistory('s1', h);
    expect(result.summary).toBe('old');
    expect(haikuCalls).toBe(0);
    expect(state.lastUpdate).toBeNull();
  });

  it('regenerates summary when enough new messages fell past the tail', async () => {
    // history=30, tail=m25-m30, compactable=m1-m24, cursor m5, idx=4
    // newSinceSummary = 24 - 1 - 4 = 19 → regen
    state.session = { summary: 'old', summary_cursor: 'm5' };
    const h = history(30);
    const result = await compactHistory('s1', h);
    expect(result.summary).toBe('résumé 1');
    expect(haikuCalls).toBe(1);
    expect(state.lastUpdate?.summary_cursor).toBe('m24');
  });

  // Summary regeneration always returns something here (mock never throws).
  // Failure path (llm() throws) is covered by the try/catch in
  // haikuSummarize — validated by inspection, not per-test re-mock (vi.doMock
  // after module import doesn't take effect).
});
