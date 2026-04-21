import { runGmTurn } from '../../../../../lib/ai/gm-agent';
import { createSupabaseServerClient } from '../../../../../lib/db/server';
import type { CharacterRow, MessageRow } from '../../../../../lib/db/types';

export const runtime = 'nodejs';

/**
 * GET /api/sessions/:id/stream?message=... — SSE stream of the GM turn.
 * The user message has already been persisted by postUserMessage.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const url = new URL(req.url);
  const userMessage = url.searchParams.get('message') ?? '';
  const trigger = url.searchParams.get('trigger') ?? '';
  if (!userMessage && trigger !== 'companion_spoke') {
    return new Response('missing message', { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new Response('unauthorized', { status: 401 });

  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const { data: session } = await supabase
    .from('sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .maybeSingle();
  const { data: characters } = session
    ? await supabase
        .from('characters')
        .select('*')
        .eq('campaign_id', session.campaign_id)
        .order('created_at', { ascending: true })
    : { data: [] };
  const all = (characters ?? []) as CharacterRow[];
  const player = all.find((c) => !c.is_ai) ?? null;
  const companions = all.filter((c) => c.is_ai);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const fullText: string[] = [];
      try {
        const effectiveMessage =
          trigger === 'companion_spoke'
            ? "(Un compagnon vient de parler ci-dessus. Réagis brièvement en tant que MJ : décris la réaction des autres autour du feu, ou enchaîne la scène, sans répéter ce qu'il a dit.)"
            : userMessage;
        for await (const ev of runGmTurn({
          sessionId,
          userMessage: effectiveMessage,
          history: (history ?? []) as MessageRow[],
          player,
          companions,
        })) {
          if (ev.type === 'text_delta') {
            fullText.push(ev.delta);
            write('delta', { text: ev.delta });
          } else if (ev.type === 'dice_request') {
            write('dice', ev.roll);
          } else if (ev.type === 'entity_recorded') {
            write('entity', { kind: ev.kind, name: ev.name });
          } else if (ev.type === 'memory_recalled') {
            write('memory', { query: ev.query, result: ev.result });
          } else if (ev.type === 'companion') {
            write('companion', {
              characterId: ev.characterId,
              name: ev.characterName,
              content: ev.content,
            });
          } else if (ev.type === 'error') {
            write('error', { message: ev.message });
          } else if (ev.type === 'done') {
            // persist the assembled GM message
            const content = fullText.join('').trim();
            if (content) {
              await supabase
                .from('messages')
                .insert({ session_id: sessionId, author_kind: 'gm', content });
            }
            write('done', { length: content.length });
          }
        }
      } catch (err) {
        write('error', { message: err instanceof Error ? err.message : 'stream error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
