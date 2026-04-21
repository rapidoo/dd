'use server';

import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { requireUser } from './auth';

export interface PartyState {
  player: CharacterRow | null;
  companions: CharacterRow[];
}

export async function getParty(campaignId: string): Promise<PartyState> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  const all = (data ?? []) as CharacterRow[];
  return {
    player: all.find((c) => !c.is_ai) ?? null,
    companions: all.filter((c) => c.is_ai),
  };
}
