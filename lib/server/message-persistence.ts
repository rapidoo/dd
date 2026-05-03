import { createSupabaseServiceClient } from '../db/server';
import type { MessageRow } from '../db/types';

const MAX_MESSAGE_CHARS = 16_384;

export type PersistableActor =
  | { kind: 'narrator' }
  | { kind: 'npc'; id: string; name: string }
  | { kind: 'companion'; id: string; name: string };

export function normalizeMessageContent(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_MESSAGE_CHARS
    ? `${trimmed.slice(0, MAX_MESSAGE_CHARS - 4)}…`
    : trimmed;
}

export async function persistActorMessage(input: {
  sessionId: string;
  actor: PersistableActor;
  content: string;
}): Promise<MessageRow | null> {
  if (input.actor.kind === 'companion') {
    return persistCompanionMessage({
      sessionId: input.sessionId,
      characterId: input.actor.id,
      characterName: input.actor.name,
      content: input.content,
    });
  }

  const content = normalizeMessageContent(input.content);
  if (!content) return null;

  const supabase = createSupabaseServiceClient();
  const insert =
    input.actor.kind === 'narrator'
      ? { session_id: input.sessionId, author_kind: 'gm' as const, content }
      : {
          session_id: input.sessionId,
          author_kind: 'character' as const,
          author_id: null,
          content,
          metadata: { npc_id: input.actor.id, npc_name: input.actor.name },
        };

  const { data, error } = await supabase.from('messages').insert(insert).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Message persistence failed');
  return data;
}

export async function persistCompanionMessage(input: {
  sessionId: string;
  characterId: string;
  characterName: string;
  content: string;
}): Promise<MessageRow | null> {
  const content = normalizeMessageContent(input.content);
  if (!content) return null;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      session_id: input.sessionId,
      author_kind: 'character',
      author_id: input.characterId,
      content,
      metadata: { character_name: input.characterName },
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Companion message persistence failed');
  return data;
}
