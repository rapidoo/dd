import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import {
  type EntityKind,
  type FactKind,
  findEntityByName,
  linkEntityToSession,
  upsertEntityNode,
  upsertFactNode,
  upsertSessionNode,
} from '../neo4j/queries';
import type { InventoryItem } from '../server/inventory-actions';
import { llm } from './llm';

/**
 * Post-turn "janitor" pass. Opus is the storyteller; the concierge reads
 * its narration, extracts named entities, and applies mechanical bookkeeping
 * (items gained, coins moved) that Opus may have mentioned purely in prose.
 *
 * Runs fire-and-forget, never blocks the SSE stream, and swallows every
 * error — missing bookkeeping is annoying but a failed concierge must never
 * break the player-facing turn.
 */

const itemTypeEnum = z.enum(['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc']);
const abilityEnum = z.enum(['str', 'dex', 'finesse']);
const factKindEnum = z.enum([
  'behavior',
  'relation',
  'possession',
  'promise',
  'secret',
  'event',
  'rule',
]);

const lootSchema = z.object({
  entities: z
    .array(
      z.object({
        kind: z.enum(['npc', 'location', 'faction', 'item', 'quest', 'event']),
        name: z.string().trim().min(1).max(120),
        short_description: z.string().trim().max(400).optional(),
      }),
    )
    .max(12)
    .default([]),
  facts: z
    .array(
      z.object({
        about_entity_name: z.string().trim().min(1).max(120),
        kind: factKindEnum,
        text: z.string().trim().min(1).max(400),
      }),
    )
    .max(12)
    .default([]),
  loot: z
    .array(
      z.object({
        // Not z.uuid() — we filter via validIds below and want to tolerate
        // UUIDs that fail strict RFC version/variant nibble checks.
        character_id: z.string().min(1).max(128),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              qty: z.number().int().min(-999).max(999),
              type: itemTypeEnum.optional(),
              description: z.string().trim().max(400).optional(),
              weapon: z
                .object({
                  damage_dice: z
                    .string()
                    .regex(/^\s*\d*d(4|6|8|10|12|20|100)(\s*[+-]\s*\d+)?\s*$/i),
                  damage_type: z.string().trim().max(40).optional(),
                  ability: abilityEnum.optional(),
                  ranged: z.boolean().optional(),
                })
                .optional(),
            }),
          )
          .default([]),
        currency: z
          .object({
            cp: z.number().int().min(-99999).max(99999).optional(),
            sp: z.number().int().min(-99999).max(99999).optional(),
            ep: z.number().int().min(-99999).max(99999).optional(),
            gp: z.number().int().min(-99999).max(99999).optional(),
            pp: z.number().int().min(-99999).max(99999).optional(),
          })
          .default({}),
      }),
    )
    .max(12)
    .default([]),
});

export type ConciergePayload = z.infer<typeof lootSchema>;

export interface ConciergeInput {
  campaignId: string;
  sessionId: string;
  sessionNumber: number;
  narration: string;
  player: CharacterRow | null;
  companions: CharacterRow[];
}

export async function runConcierge(input: ConciergeInput): Promise<void> {
  if (!input.narration || input.narration.trim().length < 40) return;
  const party = [...(input.player ? [input.player] : []), ...input.companions];
  if (party.length === 0) return;

  const payload = await extract(input, party);
  if (!payload) return;
  if (process.env.NODE_ENV !== 'production') {
    console.debug(
      `[concierge] payload entities=${payload.entities.length} facts=${payload.facts.length} loot=${payload.loot.length}`,
    );
  }

  // Entities + facts → Neo4j (source of truth for campaign memory)
  if (payload.entities.length > 0 || payload.facts.length > 0) {
    await persistMemoryToGraph(input, payload).catch((err) => {
      logConciergeFailure('neo4j_error', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // Loot → Postgres (items + currency, transactional game state)
  const validIds = new Set(party.map((c) => c.id));
  for (const op of payload.loot) {
    if (!validIds.has(op.character_id)) continue;
    if (op.items.length > 0) await applyItems(op.character_id, op.items);
    if (hasNonZeroCurrency(op.currency)) await applyCurrency(op.character_id, op.currency);
  }
}

async function persistMemoryToGraph(
  input: ConciergeInput,
  payload: ConciergePayload,
): Promise<void> {
  // Session node once — every Entity / Fact edge anchors on it.
  await upsertSessionNode({
    id: input.sessionId,
    campaign_id: input.campaignId,
    session_number: input.sessionNumber,
  });
  const entityIdByName = new Map<string, string>();
  for (const e of payload.entities) {
    const existing = await findEntityByName(input.campaignId, e.kind as EntityKind, e.name);
    const id = existing?.id ?? crypto.randomUUID();
    await upsertEntityNode({
      id,
      campaign_id: input.campaignId,
      kind: e.kind as EntityKind,
      name: e.name,
      short_description: e.short_description,
    });
    await linkEntityToSession(id, input.sessionId);
    entityIdByName.set(e.name.toLowerCase(), id);
  }

  // Facts attach to an Entity — resolve by name among the entities we just
  // persisted OR any pre-existing entity in the campaign. Unresolved names
  // are skipped (we never invent anchors).
  for (const f of payload.facts) {
    const key = f.about_entity_name.toLowerCase();
    let entityId = entityIdByName.get(key);
    if (!entityId) {
      // Try every kind until we find one; campaign isolation is still enforced
      // by findEntityByName.
      for (const kind of ENTITY_KINDS_FOR_FACT_LOOKUP) {
        const hit = await findEntityByName(input.campaignId, kind, f.about_entity_name);
        if (hit) {
          entityId = hit.id;
          break;
        }
      }
    }
    if (!entityId) continue;
    await upsertFactNode({
      id: crypto.randomUUID(),
      campaign_id: input.campaignId,
      entity_id: entityId,
      session_id: input.sessionId,
      kind: f.kind as FactKind,
      text: f.text,
    });
  }
}

const ENTITY_KINDS_FOR_FACT_LOOKUP: EntityKind[] = [
  'npc',
  'location',
  'faction',
  'item',
  'quest',
  'event',
];

async function extract(
  input: ConciergeInput,
  party: CharacterRow[],
): Promise<ConciergePayload | null> {
  const partyLines = party
    .map((c) => `  - character_id="${c.id}" → ${c.name}${c.is_ai ? ' (allié IA)' : ' (joueur)'}`)
    .join('\n');

  try {
    const response = await llm().chat({
      role: 'util',
      maxTokens: 800,
      jsonMode: true,
      messages: [
        {
          role: 'user',
          content: `Tu es le concierge mécanique d'une partie de D&D 5e. Lis la narration finale du Conteur et extrais TROIS choses au format JSON :

1) "entities" — chaque fois qu'un PNJ, lieu, faction, objet NOMMÉ, quête ou événement notable est mentionné, cite-le. Tu DOIS lister même les entités déjà connues (le système dédoublonne côté graphe). Ignore seulement les foules anonymes ("des gardes", "une taverne sans nom").
2) "facts" — propositions narratives apprises ou confirmées pendant ce tour. Attache chaque fait à une entité (about_entity_name doit matcher un name de "entities" ou d'une entité déjà en mémoire). Exemples : "Vaeloria se méfie des humains" (behavior) ; "Razmoo a juré de protéger Aldric" (promise) ; "Le Maître Gris est en réalité Malkron" (secret).
3) "loot" — objets et pièces EXPLICITEMENT ramassés / donnés / dépensés par un PJ ou compagnon.

Réponds STRICTEMENT en JSON :
{
  "entities": [{"kind":"npc|location|faction|item|quest|event","name":"...","short_description":"..."}],
  "facts": [{"about_entity_name":"...","kind":"behavior|relation|possession|promise|secret|event|rule","text":"..."}],
  "loot": [
    {
      "character_id":"<uuid de la liste ci-dessous>",
      "items":[{"name":"...","qty":1,"type":"weapon|armor|tool|consumable|treasure|misc","description":"optionnelle","weapon":{"damage_dice":"1d8","damage_type":"contondant","ability":"str|dex|finesse","ranged":false}}],
      "currency":{"gp":47,"sp":12,"pp":3}
    }
  ]
}

Personnages disponibles (n'invente pas d'UUID) :
${partyLines}

Règles :
- entities : sois généreux sur les noms propres, avare sur les génériques. Si un PNJ n'a qu'un surnom ("le cultiste"), ne le cite que s'il est distinct et récurrent.
- facts : ne recopie pas la narration — résume en 1 phrase un fait durable (max 200 chars). Pas de "il a dit", "elle fait un geste" (événement d'un tour ≠ fait durable).
- loot : uniquement un VRAI transfert (ramassé, donné, volé, acheté, dépensé). Pas les objets simplement décrits. Nombres en lettres → chiffres.
- Pour une arme, weapon={damage_dice, damage_type, ability, ranged?} si les stats sont canoniques (dague 1d4/perforant/finesse, marteau 1d8/contondant/str, arc court 1d6/perforant/ranged).
- Max 12 entités, 12 faits, 12 loot ops.
- Rien à persister ? Renvoie {"entities":[],"facts":[],"loot":[]}.

Narration :
${input.narration.slice(0, 3000)}

JSON :`,
        },
      ],
    });
    const text = response.text.trim();
    const json = extractJson(text);
    if (!json) {
      logConciergeFailure('no_json', { textPreview: text.slice(0, 200) });
      return null;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (err) {
      logConciergeFailure('json_parse_error', {
        message: err instanceof Error ? err.message : String(err),
        jsonPreview: json.slice(0, 200),
      });
      return null;
    }
    const parsed = lootSchema.safeParse(raw);
    if (!parsed.success) {
      logConciergeFailure('schema_invalid', {
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return null;
    }
    return parsed.data;
  } catch (err) {
    logConciergeFailure('llm_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function logConciergeFailure(code: string, meta: Record<string, unknown>): void {
  // Visible en dev pour diagnostiquer gemma3:4b / prompt issues, silencieux
  // en production pour ne pas polluer Vercel logs.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[concierge] ${code}`, meta);
  }
}

async function applyItems(
  characterId: string,
  items: NonNullable<ConciergePayload['loot'][number]['items']>,
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('inventory')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return;
  let inventory = (character.inventory as InventoryItem[] | null) ?? [];
  for (const it of items) {
    const type = it.type ?? 'misc';
    const existing = inventory.find(
      (i) => i.name.toLowerCase() === it.name.toLowerCase() && (i.type ?? 'misc') === type,
    );
    if (existing) {
      inventory = inventory
        .map((i) =>
          i === existing
            ? { ...i, qty: i.qty + it.qty, weapon: mapWeapon(it.weapon) ?? i.weapon }
            : i,
        )
        .filter((i) => i.qty > 0);
    } else if (it.qty > 0) {
      inventory.push({
        id: `i-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: it.name,
        qty: it.qty,
        type,
        description: it.description,
        weapon: mapWeapon(it.weapon),
      });
    }
  }
  await supabase.from('characters').update({ inventory }).eq('id', characterId);
}

async function applyCurrency(
  characterId: string,
  delta: NonNullable<ConciergePayload['loot'][number]['currency']>,
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('currency')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return;
  const current = (character.currency as Record<string, number> | null) ?? {
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0,
  };
  const next = {
    cp: Math.max(0, (current.cp ?? 0) + (delta.cp ?? 0)),
    sp: Math.max(0, (current.sp ?? 0) + (delta.sp ?? 0)),
    ep: Math.max(0, (current.ep ?? 0) + (delta.ep ?? 0)),
    gp: Math.max(0, (current.gp ?? 0) + (delta.gp ?? 0)),
    pp: Math.max(0, (current.pp ?? 0) + (delta.pp ?? 0)),
  };
  await supabase.from('characters').update({ currency: next }).eq('id', characterId);
}

function mapWeapon(
  w: ConciergePayload['loot'][number]['items'][number]['weapon'],
): InventoryItem['weapon'] {
  if (!w) return undefined;
  return {
    damageDice: w.damage_dice,
    damageType: w.damage_type,
    ability: w.ability,
    ranged: w.ranged,
  };
}

function hasNonZeroCurrency(c: {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}): boolean {
  return [c.cp, c.sp, c.ep, c.gp, c.pp].some((v) => typeof v === 'number' && v !== 0);
}

/**
 * Pull the first balanced JSON object out of a mixed response. Handles:
 *   - Raw JSON (Ollama with `format:'json'` path)
 *   - Markdown code fence wrappers
 *   - Prose preamble/postamble ("Here is the JSON: {…} hope this helps")
 * Returns "" if no plausible object is found.
 */
export function extractJson(text: string): string {
  if (!text) return '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf('{');
  if (start === -1) return '';
  let depth = 0;
  let inString = false;
  let isEscaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === '\\') {
      isEscaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return '';
}
