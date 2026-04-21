import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error('Missing Supabase env for e2e');

const admin = createClient(url, service, { auth: { persistSession: false } });

/**
 * Ensure a campaign + a PC character exist for the given owner. Returns the
 * campaign id + character id so tests can navigate directly to session pages.
 */
export async function ensureCampaignWithCharacter(
  ownerId: string,
  prefix = 'e2e',
): Promise<{
  campaignId: string;
  characterId: string;
}> {
  // Re-use the first campaign owned by this user so tests do not bloat the DB.
  const existing = await admin
    .from('campaigns')
    .select('id')
    .eq('owner_id', ownerId)
    .ilike('name', `${prefix}%`)
    .limit(1)
    .maybeSingle();

  let campaignId: string;
  if (existing.data) {
    campaignId = existing.data.id;
  } else {
    const { data, error } = await admin
      .from('campaigns')
      .insert({
        owner_id: ownerId,
        name: `${prefix} campagne`,
        setting_mode: 'homebrew',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'campaign insert failed');
    campaignId = data.id;
  }

  // Same for a PC — pick the first PC or create a minimal one.
  const character = await admin
    .from('characters')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_ai', false)
    .limit(1)
    .maybeSingle();
  let characterId: string;
  if (character.data) {
    characterId = character.data.id;
  } else {
    const { data, error } = await admin
      .from('characters')
      .insert({
        campaign_id: campaignId,
        owner_id: ownerId,
        is_ai: false,
        name: `${prefix} Elspeth`,
        species: 'human',
        class: 'cleric',
        level: 5,
        str: 12,
        dex: 12,
        con: 14,
        int_score: 10,
        wis: 16,
        cha: 12,
        max_hp: 38,
        current_hp: 28,
        ac: 18,
        speed: 9,
        spell_slots: { 1: { max: 4, used: 0 }, 2: { max: 3, used: 1 }, 3: { max: 2, used: 1 } },
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'character insert failed');
    characterId = data.id;
  }

  return { campaignId, characterId };
}
