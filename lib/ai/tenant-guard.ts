import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow } from '../db/types';

/**
 * Tenant-guarded lookups for GM tool execution.
 *
 * The orchestrator runs with the service-role client (needed to write
 * dice_rolls, combat_encounters, and any tool-authored mutation that
 * RLS would otherwise block). That means every tool handler must
 * verify that the resource it is about to touch actually belongs to
 * the campaign whose session the stream is running for. Without this
 * check, prompt injection in `?message=` could trick the LLM into
 * emitting tool calls against another user's UUIDs.
 */

/** Returns the campaign id for the session, or null if the session does not exist. */
export async function campaignIdOfSession(sessionId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .maybeSingle();
  return data?.campaign_id ?? null;
}

/**
 * Returns the character only if it belongs to the session's campaign.
 * Returns null in every other case (missing, wrong campaign).
 */
export async function characterInSession(
  sessionId: string,
  characterId: string,
): Promise<CharacterRow | null> {
  const campaignId = await campaignIdOfSession(sessionId);
  if (!campaignId) return null;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return (data as CharacterRow | null) ?? null;
}

/**
 * Asserts a combatant_id from the LLM matches a real character in the
 * current session's campaign. NPC ids (e.g. "npc-<timestamp>-<n>") are
 * allowed through since they live inside the combat_encounter row and
 * can only come from start_combat we already authorised.
 */
export async function combatantBelongsToSession(
  sessionId: string,
  combatantId: string,
): Promise<boolean> {
  if (combatantId.startsWith('npc-')) return true;
  const character = await characterInSession(sessionId, combatantId);
  return character !== null;
}
