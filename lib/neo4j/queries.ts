import { withSession } from './driver';

export type EntityKind = 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';

export interface EntityUpsert {
  id: string;
  campaign_id: string;
  kind: EntityKind;
  name: string;
  short_description?: string;
}

export interface SessionUpsert {
  id: string;
  campaign_id: string;
  session_number: number;
}

export interface EntityListItem {
  id: string;
  kind: EntityKind;
  name: string;
  short_description: string | null;
  updated_at: string | null;
  sessions: number[];
}

export interface EntitySearchHit {
  id: string;
  kind: EntityKind;
  name: string;
  short_description: string | null;
}

/**
 * Upserts an Entity node by unique id. Name / description are always refreshed,
 * `first_seen_at` is only set on creation so the value is stable.
 */
export async function upsertEntityNode(entity: EntityUpsert): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (n:Entity { id: $id })
       ON CREATE SET n.first_seen_at = datetime()
       SET n.campaign_id = $campaign_id,
           n.kind = $kind,
           n.name = $name,
           n.short_description = coalesce($short_description, n.short_description),
           n.updated_at = datetime()`,
      entity,
    );
  });
}

/**
 * Upserts a Session node. Used to keep an edge target for :APPEARS_IN without
 * duplicating Postgres session metadata beyond the bare essentials.
 */
export async function upsertSessionNode(sessionNode: SessionUpsert): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (s:Session { id: $id })
       ON CREATE SET s.created_at = datetime()
       SET s.campaign_id = $campaign_id,
           s.session_number = $session_number`,
      sessionNode,
    );
  });
}

/** MERGEs an :APPEARS_IN edge; stamps first_turn_at only on creation. */
export async function linkEntityToSession(entityId: string, sessionId: string): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MATCH (e:Entity { id: $entityId }), (s:Session { id: $sessionId })
       MERGE (e)-[r:APPEARS_IN]->(s)
       ON CREATE SET r.first_turn_at = datetime()`,
      { entityId, sessionId },
    );
  });
}

/** Case-insensitive lookup by (campaign_id, kind, name) for MERGE-by-name flow. */
export async function findEntityByName(
  campaignId: string,
  kind: EntityKind,
  name: string,
): Promise<{ id: string } | null> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity { campaign_id: $campaignId, kind: $kind })
       WHERE toLower(n.name) = toLower($name)
       RETURN n.id AS id
       LIMIT 1`,
      { campaignId, kind, name },
    );
    const row = result.records[0];
    return row ? { id: row.get('id') as string } : null;
  });
}

/**
 * Campaign-wide list enriched with the session_numbers where each entity was
 * mentioned. Ordered by most-recent-updated first — what the GM prompt and the
 * codex both want.
 */
export async function listEntitiesForCampaign(
  campaignId: string,
  limit = 30,
): Promise<EntityListItem[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity { campaign_id: $campaignId })
       OPTIONAL MATCH (n)-[:APPEARS_IN]->(s:Session)
       WITH n, collect(DISTINCT s.session_number) AS session_numbers
       RETURN n.id AS id,
              n.kind AS kind,
              n.name AS name,
              n.short_description AS short_description,
              toString(n.updated_at) AS updated_at,
              session_numbers AS sessions
       ORDER BY n.updated_at DESC
       LIMIT toInteger($limit)`,
      { campaignId, limit },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      kind: r.get('kind') as EntityKind,
      name: r.get('name') as string,
      short_description: (r.get('short_description') as string | null) ?? null,
      updated_at: (r.get('updated_at') as string | null) ?? null,
      sessions: ((r.get('sessions') as number[]) ?? []).filter((v) => typeof v === 'number'),
    }));
  });
}

/** Substring search — used by the `recall_memory` GM tool. */
export async function searchEntities(
  campaignId: string,
  query: string,
  limit = 8,
): Promise<EntitySearchHit[]> {
  if (!query.trim()) return [];
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity { campaign_id: $campaignId })
       WHERE toLower(n.name) CONTAINS toLower($query)
          OR (n.short_description IS NOT NULL AND toLower(n.short_description) CONTAINS toLower($query))
       RETURN n.id AS id, n.kind AS kind, n.name AS name, n.short_description AS short_description
       LIMIT toInteger($limit)`,
      { campaignId, query, limit },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      kind: r.get('kind') as EntityKind,
      name: r.get('name') as string,
      short_description: (r.get('short_description') as string | null) ?? null,
    }));
  });
}
