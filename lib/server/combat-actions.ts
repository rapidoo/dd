'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import { requireUser } from './auth';
import { type CombatState, getActiveCombatState } from './combat-loop';

const schema = z.object({ sessionId: z.string().uuid() });

/**
 * Returns the active combat state for a session, or null if no encounter is
 * active. Validates ownership via RLS — the anon client checks the session
 * exists for the current user before we go fetch via service role.
 */
export async function getActiveCombat(input: { sessionId: string }): Promise<CombatState | null> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', parsed.data.sessionId)
    .maybeSingle();
  if (!session) return null;
  return await getActiveCombatState(parsed.data.sessionId);
}
