import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertCalls: Array<Record<string, unknown>> = [];

vi.mock('../../lib/neo4j/queries', () => ({
  upsertEntity: async (e: Record<string, unknown>) => {
    upsertCalls.push(e);
  },
}));

let haikuResponse: string = JSON.stringify({ entities: [] });
let haikuThrow = false;
vi.mock('../../lib/ai/claude', () => ({
  MODELS: { GM: 'opus', COMPANION: 'sonnet', UTIL: 'haiku' },
  anthropic: () => ({
    messages: {
      create: async () => {
        if (haikuThrow) throw new Error('haiku down');
        return { content: [{ type: 'text', text: haikuResponse }] };
      },
    },
  }),
}));

import { extractAndUpsertEntities } from '../../lib/ai/entity-extraction';

describe('extractAndUpsertEntities', () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    haikuThrow = false;
  });

  it('skips extraction for very short narration', async () => {
    await extractAndUpsertEntities('camp1', 'ok');
    expect(upsertCalls).toHaveLength(0);
  });

  it('upserts a list of entities from a Haiku JSON response', async () => {
    haikuResponse = JSON.stringify({
      entities: [
        { kind: 'npc', name: 'Vaeloria', short_description: 'Druidesse discrète' },
        { kind: 'location', name: 'Porte Verte', short_description: 'Portail ancien' },
      ],
    });
    await extractAndUpsertEntities(
      'camp1',
      "Vaeloria pousse la Porte Verte en retenant son souffle. Le vent de la plaine s'engouffre.",
    );
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0]).toMatchObject({
      campaign_id: 'camp1',
      kind: 'npc',
      name: 'Vaeloria',
    });
    expect(upsertCalls[0]?.id).toBe('npc:vaeloria');
    expect(upsertCalls[1]?.id).toBe('location:porte-verte');
  });

  it('strips markdown code fences around the JSON', async () => {
    haikuResponse = '```json\n{"entities":[{"kind":"quest","name":"Serment des Sept"}]}\n```';
    await extractAndUpsertEntities(
      'camp1',
      'Un long texte avec le Serment des Sept, promesse gravée.',
    );
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({ kind: 'quest', name: 'Serment des Sept' });
  });

  it('swallows invalid JSON silently', async () => {
    haikuResponse = 'not json at all { broken';
    await extractAndUpsertEntities(
      'camp1',
      'Un long texte sur quelque chose avec des noms propres.',
    );
    expect(upsertCalls).toHaveLength(0);
  });

  it('swallows Haiku errors silently', async () => {
    haikuThrow = true;
    await extractAndUpsertEntities(
      'camp1',
      'Un texte assez long pour déclencher une extraction au-delà du seuil.',
    );
    expect(upsertCalls).toHaveLength(0);
  });

  it('rejects schema-invalid payloads', async () => {
    haikuResponse = JSON.stringify({ entities: [{ kind: 'unknown-kind', name: 'X' }] });
    await extractAndUpsertEntities('camp1', 'Un texte assez long pour déclencher une extraction.');
    expect(upsertCalls).toHaveLength(0);
  });
});
