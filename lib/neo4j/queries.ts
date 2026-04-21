import { withSession } from './driver';

export type EntityKind = 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';
export type FactKind =
  | 'behavior' // trait ou tendance du PNJ ("se méfie des étrangers")
  | 'relation' // rapport entre entités ("allié de X", "dette envers Y")
  | 'possession' // objet détenu ("porte l'anneau de fer noir")
  | 'promise' // engagement ("a juré de protéger le convoi")
  | 'secret' // information cachée ("est en réalité le cultiste Malkron")
  | 'event' // fait passé ("a tué le capitaine à la Porte Verte")
  | 'rule'; // règle d'un lieu ou d'une faction ("aucune lame dans le temple")

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

export interface FactUpsert {
  id: string;
  campaign_id: string;
  entity_id: string;
  session_id: string;
  kind: FactKind;
  text: string;
}

export interface EntityListItem {
  id: string;
  kind: EntityKind;
  name: string;
  short_description: string | null;
  updated_at: string | null;
  sessions: number[];
  facts: FactSummary[];
}

export interface FactSummary {
  id: string;
  kind: FactKind;
  text: string;
  session_number: number | null;
  created_at: string | null;
}

export interface EntitySearchHit {
  id: string;
  kind: EntityKind;
  name: string;
  short_description: string | null;
}

export interface CampaignCounts {
  campaign_id: string;
  entities: number;
  sessions: number;
  facts: number;
}

/**
 * Guarantees a Campaign root node exists. Every entity/session/fact hangs off
 * of it via explicit HAS_* edges — that's what makes the per-campaign graph
 * isolation structural (a query forgetting to traverse from Campaign can't
 * leak across tenants).
 */
export async function upsertCampaignNode(campaignId: string): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (c:Campaign { id: $campaignId })
       ON CREATE SET c.created_at = datetime()
       SET c.updated_at = datetime()`,
      { campaignId },
    );
  });
}

export async function upsertEntityNode(entity: EntityUpsert): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (c:Campaign { id: $campaign_id })
         ON CREATE SET c.created_at = datetime()
       MERGE (n:Entity { id: $id })
         ON CREATE SET n.first_seen_at = datetime()
       SET n.campaign_id = $campaign_id,
           n.kind = $kind,
           n.name = $name,
           n.short_description = coalesce($short_description, n.short_description),
           n.updated_at = datetime()
       MERGE (c)-[:HAS_ENTITY]->(n)`,
      entity,
    );
  });
}

export async function upsertSessionNode(sessionNode: SessionUpsert): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (c:Campaign { id: $campaign_id })
         ON CREATE SET c.created_at = datetime()
       MERGE (s:Session { id: $id })
         ON CREATE SET s.created_at = datetime()
       SET s.campaign_id = $campaign_id,
           s.session_number = $session_number
       MERGE (c)-[:HAS_SESSION]->(s)`,
      sessionNode,
    );
  });
}

/** MERGEs an APPEARS_IN edge between an existing Entity and Session. */
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

/**
 * Records a Fact — a narrative proposition attached to an Entity and the
 * Session where it was established. Facts are the unit of behavioral memory
 * (who does what, who owes what, what's hidden). The Campaign → HAS_FACT edge
 * keeps the isolation structural.
 */
export async function upsertFactNode(fact: FactUpsert): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `MERGE (c:Campaign { id: $campaign_id })
         ON CREATE SET c.created_at = datetime()
       WITH c
       MATCH (e:Entity { id: $entity_id })
       MATCH (s:Session { id: $session_id })
       MERGE (f:Fact { id: $id })
         ON CREATE SET f.created_at = datetime()
       SET f.campaign_id = $campaign_id,
           f.kind = $kind,
           f.text = $text
       MERGE (c)-[:HAS_FACT]->(f)
       MERGE (f)-[:ABOUT]->(e)
       MERGE (f)-[:ESTABLISHED_IN]->(s)`,
      fact,
    );
  });
}

/** Case-insensitive lookup scoped to the Campaign's HAS_ENTITY neighborhood. */
export async function findEntityByName(
  campaignId: string,
  kind: EntityKind,
  name: string,
): Promise<{ id: string } | null> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (:Campaign { id: $campaignId })-[:HAS_ENTITY]->(n:Entity { kind: $kind })
       WHERE toLower(n.name) = toLower($name)
       RETURN n.id AS id
       LIMIT 1`,
      { campaignId, kind, name },
    );
    const row = result.records[0];
    return row ? { id: row.get('id') as string } : null;
  });
}

/** Everything visible in the codex, campaign-scoped by construction. */
export async function listEntitiesForCampaign(
  campaignId: string,
  limit = 30,
): Promise<EntityListItem[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (:Campaign { id: $campaignId })-[:HAS_ENTITY]->(n:Entity)
       OPTIONAL MATCH (n)-[:APPEARS_IN]->(s:Session)
       WITH n, collect(DISTINCT s.session_number) AS session_numbers
       OPTIONAL MATCH (f:Fact)-[:ABOUT]->(n)
       OPTIONAL MATCH (f)-[:ESTABLISHED_IN]->(fs:Session)
       WITH n, session_numbers,
            collect(DISTINCT {
              id: f.id,
              kind: f.kind,
              text: f.text,
              session_number: fs.session_number,
              created_at: toString(f.created_at)
            }) AS raw_facts
       RETURN n.id AS id,
              n.kind AS kind,
              n.name AS name,
              n.short_description AS short_description,
              toString(n.updated_at) AS updated_at,
              session_numbers AS sessions,
              [x IN raw_facts WHERE x.id IS NOT NULL] AS facts
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
      facts: ((r.get('facts') as FactSummary[]) ?? []).map((f) => ({
        id: f.id,
        kind: f.kind,
        text: f.text,
        session_number: f.session_number ?? null,
        created_at: f.created_at ?? null,
      })),
    }));
  });
}

/** Used by the recall_memory GM tool — full-text contains on name + desc + fact text. */
export async function searchEntities(
  campaignId: string,
  query: string,
  limit = 8,
): Promise<EntitySearchHit[]> {
  if (!query.trim()) return [];
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (:Campaign { id: $campaignId })-[:HAS_ENTITY]->(n:Entity)
       OPTIONAL MATCH (f:Fact)-[:ABOUT]->(n)
       WITH n, collect(f.text) AS fact_texts
       WHERE toLower(n.name) CONTAINS toLower($query)
          OR (n.short_description IS NOT NULL AND toLower(n.short_description) CONTAINS toLower($query))
          OR any(t IN fact_texts WHERE toLower(t) CONTAINS toLower($query))
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

/** Total counts per campaign — used by scripts/neo4j-setup.mjs for diagnostics. */
export async function countByCampaign(): Promise<CampaignCounts[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (c:Campaign)
       OPTIONAL MATCH (c)-[:HAS_ENTITY]->(e:Entity)
       WITH c, count(DISTINCT e) AS entities
       OPTIONAL MATCH (c)-[:HAS_SESSION]->(s:Session)
       WITH c, entities, count(DISTINCT s) AS sessions
       OPTIONAL MATCH (c)-[:HAS_FACT]->(f:Fact)
       WITH c, entities, sessions, count(DISTINCT f) AS facts
       RETURN c.id AS campaign_id, entities, sessions, facts
       ORDER BY entities DESC`,
    );
    return result.records.map((r) => ({
      campaign_id: r.get('campaign_id') as string,
      entities: Number(r.get('entities') ?? 0),
      sessions: Number(r.get('sessions') ?? 0),
      facts: Number(r.get('facts') ?? 0),
    }));
  });
}
