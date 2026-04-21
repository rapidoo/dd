'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { MessageRow, SessionRow } from '../db/types';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';

const postMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export async function ensureSession(campaignId: string): Promise<SessionRow> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('session_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && !existing.ended_at) return existing;
  const nextNumber = (existing?.session_number ?? 0) + 1;
  const { data, error } = await supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, session_number: nextNumber })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Impossible de créer la session');
  }
  return data;
}

export async function loadSession(sessionId: string): Promise<{
  session: SessionRow | null;
  messages: MessageRow[];
}> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { session: null, messages: [] };
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return { session, messages: messages ?? [] };
}

export async function postUserMessage(input: {
  sessionId: string;
  content: string;
}): Promise<ServerResult<MessageRow>> {
  const parsed = postMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Message invalide',
      fieldErrors: z.treeifyError(parsed.error).properties as Record<string, string[]>,
    };
  }
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      session_id: parsed.data.sessionId,
      author_kind: 'user',
      author_id: user.id,
      content: parsed.data.content,
    })
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Envoi impossible' };
  return { ok: true, data };
}
