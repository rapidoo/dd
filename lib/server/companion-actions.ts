'use server';

import { z } from 'zod';
import { respondAsCompanion } from '../ai/companion-agent';
import { executeRoll, renderCombatBlock } from '../ai/gm-agent';
import { createSupabaseServerClient, createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow } from '../db/types';
import { activeEncounter } from './combat';
import { requireUser } from './auth';

const schema = z.object({
  sessionId: z.string().uuid(),
  characterId: z.string().uuid(),
  hint: z.string().max(400).optional(),
});

export interface PromptCompanionResult {
  ok: boolean;
  error?: string;
  characterName?: string;
  content?: string;
}

export async function promptCompanion(input: {
  sessionId: string;
  characterId: string;
  hint?: string;
}): Promise<PromptCompanionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Requête invalide' };
  await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS verifies the current user owns the session's campaign.
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', parsed.data.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'Session introuvable' };

  // Companion data + full history fetched with service role to keep the
  // companion agent self-contained (bypasses RLS for read-only lookup).
  const admin = createSupabaseServiceClient();
  const { data: character } = await admin
    .from('characters')
    .select('*')
    .eq('id', parsed.data.characterId)
    .maybeSingle();
  if (!character || !character.is_ai) {
    return { ok: false, error: 'Compagnon introuvable' };
  }
  const { data: history } = await admin
    .from('messages')
    .select('*')
    .eq('session_id', parsed.data.sessionId)
    .order('created_at', { ascending: true });

  try {
    const encounter = await activeEncounter(parsed.data.sessionId).catch(() => null);
    const turn = await respondAsCompanion({
      sessionId: parsed.data.sessionId,
      character: character as CharacterRow,
      history: (history ?? []) as MessageRow[],
      hint: parsed.data.hint,
      encounter,
      combatBlock: renderCombatBlock(encounter),
      executeRoll,
    });
    return { ok: true, characterName: character.name, content: turn.text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'LLM error' };
  }
}
