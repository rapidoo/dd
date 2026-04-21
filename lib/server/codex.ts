'use server';

import { createSupabaseServerClient } from '../db/server';
import { type EntityListItem, listEntitiesForCampaign } from '../neo4j/queries';
import { requireUser } from './auth';

export interface CodexResult {
  ok: boolean;
  entities: EntityListItem[];
  error?: string;
}

/**
 * Reads the campaign memory graph from Neo4j. Ownership is enforced by a
 * Postgres round-trip on `campaigns` (RLS-scoped): if the row comes back, the
 * caller owns the campaign and we can safely query Neo4j filtered by id.
 *
 * Neo4j errors are logged in dev and surfaced via `ok:false` so the codex page
 * can show a hint instead of hanging.
 */
export async function getCampaignCodex(campaignId: string): Promise<CodexResult> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('campaigns').select('id').eq('id', campaignId).maybeSingle();
  if (!data) return { ok: false, entities: [], error: 'Campagne introuvable' };
  try {
    const entities = await listEntitiesForCampaign(campaignId);
    return { ok: true, entities };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[codex]', err instanceof Error ? err.message : err);
    }
    return {
      ok: false,
      entities: [],
      error: err instanceof Error ? err.message : 'Mémoire indisponible',
    };
  }
}
