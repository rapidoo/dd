import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterRow } from '../../lib/db/types';

const PLAYER_ID = '00000000-0000-0000-0000-000000000001';
const COMPANION_ID = '00000000-0000-0000-0000-000000000002';

// Neo4j mock
const entityUpserts: Array<Record<string, unknown>> = [];
vi.mock('../../lib/neo4j/queries', () => ({
  upsertEntity: async (e: Record<string, unknown>) => {
    entityUpserts.push(e);
  },
}));

// LLM mock — returns whatever we set
let haikuResponse: string = '{"entities":[],"loot":[]}';
let haikuThrow = false;
vi.mock('../../lib/ai/llm', () => ({
  llm: () => ({
    chat: async () => {
      if (haikuThrow) throw new Error('haiku down');
      return { text: haikuResponse, toolCalls: [], stopReason: 'end_turn' };
    },
  }),
  modelFor: () => 'mock',
}));

// Supabase service client mock — tracks inventory + currency state per char
const charState: Record<string, { inventory: unknown[]; currency: Record<string, number> }> = {};
const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

vi.mock('../../lib/db/server', () => {
  const supabase = {
    from: (_table: string) => {
      let column: 'inventory' | 'currency' = 'inventory';
      let id: string | null = null;
      const chain: Record<string, unknown> = {
        select: (col: string) => {
          column = col === 'currency' ? 'currency' : 'inventory';
          return chain;
        },
        eq: (_c: string, v: string) => {
          id = v;
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: id && charState[id] ? { [column]: charState[id]?.[column] } : null,
          }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_c: string, v: string) => {
            if (!charState[v]) charState[v] = { inventory: [], currency: {} };
            if (patch.inventory) charState[v].inventory = patch.inventory as unknown[];
            if (patch.currency) charState[v].currency = patch.currency as Record<string, number>;
            updates.push({ id: v, patch });
            return Promise.resolve({ data: null });
          },
        }),
      };
      return chain;
    },
  };
  return {
    createSupabaseServiceClient: () => supabase,
    createSupabaseServerClient: async () => supabase,
  };
});

import { runConcierge } from '../../lib/ai/concierge';

function mkCharacter(
  id: string,
  is_ai: boolean,
  overrides: Partial<CharacterRow> = {},
): CharacterRow {
  return {
    id,
    campaign_id: 'c1',
    owner_id: 'u1',
    name: is_ai ? 'Vaeloria' : 'Razmoo',
    species: 'dwarf',
    class: 'fighter',
    level: 1,
    str: 16,
    dex: 12,
    con: 14,
    int_score: 8,
    wis: 10,
    cha: 10,
    max_hp: 12,
    current_hp: 12,
    temp_hp: 0,
    ac: 16,
    speed: 7,
    is_ai,
    conditions: [],
    spell_slots: {},
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    exhaustion: 0,
    persona: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as CharacterRow;
}

describe('runConcierge', () => {
  beforeEach(() => {
    entityUpserts.length = 0;
    updates.length = 0;
    for (const k of Object.keys(charState)) delete charState[k];
    charState[PLAYER_ID] = { inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
    charState[COMPANION_ID] = { inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
    haikuThrow = false;
  });

  it('does nothing on empty narration', async () => {
    await runConcierge({
      campaignId: 'c1',
      narration: '',
      player: mkCharacter(PLAYER_ID, false),
      companions: [],
    });
    expect(entityUpserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('upserts entities and applies loot to the player (user bug case)', async () => {
    haikuResponse = JSON.stringify({
      entities: [{ kind: 'npc', name: 'Maître Gris', short_description: 'Cultiste démasqué' }],
      loot: [
        {
          character_id: PLAYER_ID,
          items: [
            { name: 'Poignard à lame noircie', qty: 1, type: 'weapon' },
            { name: 'Anneau de fer noir', qty: 1, type: 'misc' },
            { name: 'Lettre scellée', qty: 1, type: 'misc' },
          ],
          currency: { gp: 47, sp: 12, pp: 3 },
        },
      ],
    });
    await runConcierge({
      campaignId: 'c1',
      narration:
        "Voici ce que vous trouvez sur le maître gris. La bourse contient quarante-sept pièces d'or, douze d'argent, et trois pièces de platine.",
      player: mkCharacter(PLAYER_ID, false),
      companions: [mkCharacter(COMPANION_ID, true)],
    });
    // Entity was upserted
    expect(entityUpserts).toHaveLength(1);
    expect(entityUpserts[0]).toMatchObject({ kind: 'npc', name: 'Maître Gris' });
    // 3 items appeared on the player
    expect((charState[PLAYER_ID]?.inventory as unknown[]).length).toBe(3);
    // Currency applied: 0 → 47 gp, 0 → 12 sp, 0 → 3 pp
    expect(charState[PLAYER_ID]?.currency).toMatchObject({ gp: 47, sp: 12, pp: 3 });
  });

  it('ignores loot targeting unknown characters (prompt-injection safety)', async () => {
    haikuResponse = JSON.stringify({
      entities: [],
      loot: [
        {
          character_id: '99999999-9999-9999-9999-999999999999',
          items: [{ name: 'Couronne volée', qty: 1 }],
          currency: { gp: 9999 },
        },
      ],
    });
    await runConcierge({
      campaignId: 'c1',
      narration: 'Un long texte décrivant une mystérieuse couronne trouvée dans un tombeau.',
      player: mkCharacter(PLAYER_ID, false),
      companions: [],
    });
    expect(updates).toHaveLength(0);
    expect(charState[PLAYER_ID]?.currency?.gp).toBe(0);
  });

  it('splits loot across player and companion when the narration dictates it', async () => {
    haikuResponse = JSON.stringify({
      entities: [],
      loot: [
        {
          character_id: PLAYER_ID,
          items: [{ name: 'Épée courte', qty: 1, type: 'weapon' }],
          currency: { gp: 20 },
        },
        {
          character_id: COMPANION_ID,
          items: [{ name: 'Potion', qty: 2, type: 'consumable' }],
          currency: { gp: 10 },
        },
      ],
    });
    await runConcierge({
      campaignId: 'c1',
      narration:
        "Razmoo prend l'épée et 20 po. Vaeloria garde les potions et 10 po. Un partage propre.",
      player: mkCharacter(PLAYER_ID, false),
      companions: [mkCharacter(COMPANION_ID, true)],
    });
    expect((charState[PLAYER_ID]?.inventory as unknown[]).length).toBe(1);
    expect(charState[PLAYER_ID]?.currency?.gp).toBe(20);
    expect((charState[COMPANION_ID]?.inventory as unknown[]).length).toBe(1);
    expect(charState[COMPANION_ID]?.currency?.gp).toBe(10);
  });

  it('persists weapon metadata for attack computation', async () => {
    haikuResponse = JSON.stringify({
      entities: [],
      loot: [
        {
          character_id: PLAYER_ID,
          items: [
            {
              name: 'Marteau de guerre',
              qty: 1,
              type: 'weapon',
              weapon: {
                damage_dice: '1d8',
                damage_type: 'contondant',
                ability: 'str',
              },
            },
          ],
          currency: {},
        },
      ],
    });
    await runConcierge({
      campaignId: 'c1',
      narration: 'Tu ramasses un marteau de guerre massif et le glisses à ta ceinture.',
      player: mkCharacter(PLAYER_ID, false),
      companions: [],
    });
    const inv = charState[PLAYER_ID]?.inventory as Array<{
      name: string;
      weapon?: { damageDice: string };
    }>;
    expect(inv).toHaveLength(1);
    expect(inv[0]?.weapon?.damageDice).toBe('1d8');
  });

  it("clamps negative currency at zero (can't go in debt)", async () => {
    charState[PLAYER_ID] = { inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 } };
    haikuResponse = JSON.stringify({
      entities: [],
      loot: [{ character_id: PLAYER_ID, items: [], currency: { gp: -20 } }],
    });
    await runConcierge({
      campaignId: 'c1',
      narration: "Tu dépenses 20 po chez l'aubergiste pour une chambre à l'année.",
      player: mkCharacter(PLAYER_ID, false),
      companions: [],
    });
    expect(charState[PLAYER_ID]?.currency?.gp).toBe(0);
  });

  it('swallows Haiku errors without touching state', async () => {
    haikuThrow = true;
    await runConcierge({
      campaignId: 'c1',
      narration: 'Une narration assez longue pour déclencher le concierge au-delà du seuil.',
      player: mkCharacter(PLAYER_ID, false),
      companions: [],
    });
    expect(updates).toHaveLength(0);
  });
});
