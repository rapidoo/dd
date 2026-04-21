import { withSession } from './driver';

export type EntityKind = 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';

export interface GraphEntity {
  id: string;
  campaign_id: string;
  kind: EntityKind;
  name: string;
  short_description?: string;
}

/**
 * Idempotent upsert. MERGE on (id, campaign_id) keeps re-imports safe.
 */
export async function upsertEntity(entity: GraphEntity): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (n:Entity {id: $id, campaign_id: $campaign_id})
       SET n.kind = $kind,
           n.name = $name,
           n.short_description = coalesce($short_description, n.short_description),
           n.updated_at = datetime()`,
      entity,
    );
  });
}

/**
 * Simple substring search on entity name, scoped by campaign. Returns the top
 * 8 matches with their outgoing relationships (if any).
 */
export async function recallEntities(
  campaignId: string,
  query: string,
): Promise<Array<{ name: string; kind: string; short_description: string | null }>> {
  if (!query.trim()) return [];
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity {campaign_id: $campaign_id})
       WHERE toLower(n.name) CONTAINS toLower($query)
          OR (n.short_description IS NOT NULL AND toLower(n.short_description) CONTAINS toLower($query))
       RETURN n.name AS name, n.kind AS kind, n.short_description AS short_description
       LIMIT 8`,
      { campaign_id: campaignId, query },
    );
    return result.records.map((r) => ({
      name: r.get('name') as string,
      kind: r.get('kind') as string,
      short_description: (r.get('short_description') as string | null) ?? null,
    }));
  });
}

export async function listEntities(
  campaignId: string,
): Promise<Array<{ name: string; kind: string; short_description: string | null }>> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity {campaign_id: $campaign_id})
       RETURN n.name AS name, n.kind AS kind, n.short_description AS short_description
       ORDER BY n.updated_at DESC
       LIMIT 60`,
      { campaign_id: campaignId },
    );
    return result.records.map((r) => ({
      name: r.get('name') as string,
      kind: r.get('kind') as string,
      short_description: (r.get('short_description') as string | null) ?? null,
    }));
  });
}
