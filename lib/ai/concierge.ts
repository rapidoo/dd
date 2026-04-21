import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { type EntityKind, upsertEntity } from '../neo4j/queries';
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

  // Entities → Neo4j
  await Promise.all(
    payload.entities.map((e) =>
      upsertEntity({
        id: makeEntityId(e.kind, e.name),
        campaign_id: input.campaignId,
        kind: e.kind as EntityKind,
        name: e.name,
        short_description: e.short_description,
      }).catch(() => undefined),
    ),
  );

  // Loot → Postgres (items + currency)
  const validIds = new Set(party.map((c) => c.id));
  for (const op of payload.loot) {
    if (!validIds.has(op.character_id)) continue;
    if (op.items.length > 0) await applyItems(op.character_id, op.items);
    if (hasNonZeroCurrency(op.currency)) await applyCurrency(op.character_id, op.currency);
  }
}

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
      messages: [
        {
          role: 'user',
          content: `Tu es le concierge mécanique d'une partie de D&D 5e. Lis la narration finale du Conteur et extrais UNIQUEMENT deux choses au format JSON :

1) "entities" : entités nommées notables (PNJ, lieux, factions, objets, quêtes, événements) pour la mémoire de campagne.
2) "loot" : opérations d'inventaire et de bourse explicitement narrées — objets ramassés/donnés/perdus, pièces gagnées/dépensées.

Réponds STRICTEMENT en JSON (pas de markdown, pas de commentaires) :
{
  "entities": [{"kind":"npc|location|faction|item|quest|event","name":"...","short_description":"..."}],
  "loot": [
    {
      "character_id": "<uuid du bénéficiaire ou du perdant>",
      "items": [
        {
          "name":"...",
          "qty": 1,            // >0 = reçoit, <0 = perd
          "type":"weapon|armor|tool|consumable|treasure|misc",
          "description":"courte, optionnelle",
          "weapon": {            // UNIQUEMENT si type=weapon ET stats connues
            "damage_dice":"1d8",
            "damage_type":"contondant",
            "ability":"str|dex|finesse",
            "ranged": false
          }
        }
      ],
      "currency": { "gp": 47, "sp": 12, "pp": 3 }  // positif = gagne, négatif = dépense
    }
  ]
}

Personnages disponibles (n'invente pas d'UUID, ignore ceux hors liste) :
${partyLines}

Règles :
- N'inclure que ce qui est EXPLICITEMENT narré comme un transfert (ramassé, donné, volé, acheté, dépensé). Pas les objets simplement décrits ou rêvés.
- Si la narration dit "le partage", répartis selon ce que dit le texte. Sinon, attribue au joueur principal par défaut.
- Pour une arme, remplis weapon avec les stats standard D&D si le nom est clair (ex: poignard=1d4 perforant finesse, marteau de guerre=1d8 contondant str, arc court=1d6 perforant ranged=true). Si inconnu, omets weapon.
- Nombres écrits en lettres ("quarante-sept", "douze") → convertis en chiffres.
- Max 12 entités, max 12 opérations de butin, chacune avec au plus 12 items.
- Si rien à persister, renvoie {"entities":[],"loot":[]}.

Narration :
${input.narration.slice(0, 3000)}

JSON :`,
        },
      ],
    });
    const text = response.text.trim();
    const json = stripCodeFence(text);
    if (!json) return null;
    const parsed = lootSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
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

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced?.[1]?.trim() ?? text;
}

function makeEntityId(kind: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return `${kind}:${slug}`;
}
