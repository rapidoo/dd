import { z } from 'zod';
import { type EntityKind, upsertEntity } from '../neo4j/queries';
import { anthropic, MODELS } from './claude';

/**
 * Extracts named entities (NPCs, locations, factions, items, quests, events)
 * from a chunk of GM narration and upserts them to Neo4j. Meant to be called
 * fire-and-forget after each GM turn so the campaign graph fills itself up
 * even when Opus forgets to call record_entity.
 *
 * Failures are swallowed — this is best-effort enrichment, never blocking.
 */
const extractSchema = z.object({
  entities: z
    .array(
      z.object({
        kind: z.enum(['npc', 'location', 'faction', 'item', 'quest', 'event']),
        name: z.string().trim().min(1).max(120),
        short_description: z.string().trim().max(400).optional(),
      }),
    )
    .max(12),
});

export async function extractAndUpsertEntities(
  campaignId: string,
  narration: string,
): Promise<void> {
  if (!narration || narration.trim().length < 40) return;
  try {
    const response = await anthropic().messages.create({
      model: MODELS.UTIL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Tu extrais les entités nommées d'un texte de jeu de rôle D&D 5e. Renvoie UNIQUEMENT un JSON valide de la forme {"entities":[{"kind":"npc","name":"...","short_description":"..."}]} (pas de markdown, pas de commentaires).

Types autorisés :
- npc : personnage non-joueur nommé (éviter les foules anonymes, les titres génériques)
- location : lieu concret (ville, bâtiment, salle, région)
- faction : organisation, clan, ordre, guilde
- item : objet notable mentionné (arme nommée, relique, document)
- quest : objectif explicite, promesse, mission
- event : événement passé ou futur daté / identifié

Règles :
- Inclure SEULEMENT les entités vraiment nommées ou spécifiques (pas "un garde", "une taverne")
- short_description : 1 phrase courte, un trait ou un fait marquant
- Max 12 entités, prioriser les plus importantes si le texte est dense
- Si aucune entité claire, renvoie {"entities":[]}

Texte :
${narration.slice(0, 4000)}

JSON :`,
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const json = stripCodeFence(text);
    if (!json) return;
    const parsed = extractSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return;
    await Promise.all(
      parsed.data.entities.map((e) =>
        upsertEntity({
          id: makeEntityId(e.kind, e.name),
          campaign_id: campaignId,
          kind: e.kind as EntityKind,
          name: e.name,
          short_description: e.short_description,
        }).catch(() => undefined),
      ),
    );
  } catch {
    // swallow — extraction is best-effort
  }
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
