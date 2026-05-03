import { runConcierge } from '../../../../../lib/ai/concierge';
import { isDebugCommand, runDebugCommand } from '../../../../../lib/ai/debug-mode';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../lib/db/server';
import type { CharacterRow, MessageRow, Universe } from '../../../../../lib/db/types';
import { rateLimit } from '../../../../../lib/server/rate-limit';
import { type ActorRef, runTurnLoop } from '../../../../../lib/server/turn-orchestrator';

export const runtime = 'nodejs';

/**
 * GET /api/sessions/:id/stream?message=... — SSE stream of one player input
 * cycle. The orchestrator may chain multiple turns (narrator + NPCs +
 * companions) inside a single connection until cursor lands on the PC or
 * combat ends. Boundaries between authors are surfaced as `turn_start` /
 * `turn_end` events so the client can render distinct chat bubbles.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const url = new URL(req.url);
  const userMessage = url.searchParams.get('message') ?? '';
  const trigger = url.searchParams.get('trigger') ?? '';
  if (!userMessage.trim() && trigger !== 'companion_spoke' && trigger !== 'session_intro') {
    return new Response('missing message', { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new Response('unauthorized', { status: 401 });

  const rl = rateLimit(`sse:${user.user.id}`, 20, 60_000);
  if (!rl.ok) {
    return new Response('Too many requests', {
      status: 429,
      headers: rl.retryAfterMs
        ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) }
        : undefined,
    });
  }

  if (userMessage.length > 4000) {
    return new Response('message too large', { status: 413 });
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('campaign_id, session_number')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return new Response('Not found', { status: 404 });

  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const { data: characters } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', session.campaign_id)
    .order('created_at', { ascending: true });
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('world_summary, universe')
    .eq('id', session.campaign_id)
    .maybeSingle<{ world_summary: string | null; universe: Universe | null }>();
  const all = (characters ?? []) as CharacterRow[];
  const player = all.find((c) => !c.is_ai) ?? null;
  const companions = all.filter((c) => c.is_ai);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Per-turn accumulators. Reset on every turn_start, persisted on turn_end.
      let currentActor: ActorRef | null = null;
      let currentText: string[] = [];
      // Aggregated text across the whole connection — used by the concierge so
      // it can read the full narration once everything settled.
      const totalText: string[] = [];

      const persistTurn = async (actor: ActorRef, text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const content = trimmed.length > 16384 ? `${trimmed.slice(0, 16380)}…` : trimmed;
        const serviceSupabase = createSupabaseServiceClient();
        if (actor.kind === 'narrator') {
          await serviceSupabase
            .from('messages')
            .insert({ session_id: sessionId, author_kind: 'gm', content });
        } else if (actor.kind === 'npc') {
          // NPCs are not in the characters table — store as 'character' with
          // a null author_id and the NPC name in metadata so the UI can label
          // the bubble. (The author_kind enum doesn't have 'npc'.)
          await serviceSupabase.from('messages').insert({
            session_id: sessionId,
            author_kind: 'character',
            author_id: null,
            content,
            metadata: { npc_id: actor.id, npc_name: actor.name },
          });
        }
        // Companion turns are persisted inside respondAsCompanion itself.
      };

      try {
        const debugAllowed = process.env.VERCEL_ENV
          ? process.env.VERCEL_ENV !== 'production'
          : process.env.NODE_ENV !== 'production';
        const debug = debugAllowed && isDebugCommand(userMessage);

        if (debug) {
          // Debug shortcut: pass through the existing single-turn iterator.
          const iter = runDebugCommand(sessionId, userMessage);
          for await (const ev of iter) {
            if (ev.type === 'text_delta') {
              totalText.push(ev.delta);
              write('delta', { text: ev.delta });
            } else if (ev.type === 'dice_request') {
              write('dice', ev.roll);
            } else if (ev.type === 'combat_started') {
              write('combat', { phase: 'started', combatId: ev.combatId });
            } else if (ev.type === 'combat_ended') {
              write('combat', { phase: 'ended' });
            } else if (ev.type === 'combat_state') {
              write('combat', { phase: 'state', state: ev.state });
            } else if (ev.type === 'party_update') {
              write('party', { phase: 'update' });
            } else if (ev.type === 'error') {
              write('error', { message: ev.message });
            } else if (ev.type === 'done') {
              const raw = totalText.join('').trim();
              const content = raw.length > 16384 ? `${raw.slice(0, 16380)}…` : raw;
              if (content) {
                await createSupabaseServiceClient()
                  .from('messages')
                  .insert({ session_id: sessionId, author_kind: 'gm', content });
              }
              write('done', { length: content.length });
            }
          }
          return;
        }

        const orchestrator = runTurnLoop({
          sessionId,
          campaignId: session.campaign_id,
          userMessage,
          trigger:
            trigger === 'companion_spoke'
              ? 'companion_spoke'
              : trigger === 'session_intro'
                ? 'session_intro'
                : 'user_input',
          history: (history ?? []) as MessageRow[],
          player,
          companions,
          worldSummary: campaign?.world_summary ?? null,
          universe: (campaign?.universe as Universe | null | undefined) ?? 'dnd5e',
        });

        for await (const ev of orchestrator) {
          if (ev.type === 'turn_start') {
            currentActor = ev.actor;
            currentText = [];
            write('turn_start', { actor: ev.actor });
          } else if (ev.type === 'turn_end') {
            if (currentActor) {
              const accumulated = currentText.join('');
              await persistTurn(currentActor, accumulated);
              totalText.push(accumulated);
            }
            write('turn_end', { actor: ev.actor });
            currentActor = null;
            currentText = [];
          } else if (ev.type === 'text_delta') {
            currentText.push(ev.delta);
            write('delta', { text: ev.delta });
          } else if (ev.type === 'dice_request') {
            write('dice', ev.roll);
          } else if (ev.type === 'entity_recorded') {
            write('entity', { kind: ev.kind, name: ev.name });
          } else if (ev.type === 'memory_recalled') {
            write('memory', { query: ev.query, result: ev.result });
          } else if (ev.type === 'companion') {
            // Companion text was generated by respondAsCompanion and already
            // persisted inside it. Just forward to the client.
            write('companion', {
              characterId: ev.characterId,
              name: ev.characterName,
              content: ev.content,
            });
          } else if (ev.type === 'combat_started') {
            write('combat', { phase: 'started', combatId: ev.combatId });
          } else if (ev.type === 'combat_ended') {
            write('combat', { phase: 'ended' });
          } else if (ev.type === 'combat_state') {
            write('combat', { phase: 'state', state: ev.state });
          } else if (ev.type === 'party_update') {
            write('party', { phase: 'update' });
          } else if (ev.type === 'error') {
            write('error', { message: ev.message });
          }
        }

        // Flush remaining buffered turn text in case the loop ended without
        // a closing turn_end (defensive — shouldn't happen).
        if (currentActor && currentText.length > 0) {
          await persistTurn(currentActor, currentText.join(''));
          totalText.push(currentText.join(''));
        }

        const aggregated = totalText.join('').trim();
        if (aggregated) {
          // Concierge reads the full narration to extract entities + inventory
          // deltas. Fire-and-forget; never blocks the stream.
          void runConcierge({
            campaignId: session.campaign_id,
            sessionId,
            sessionNumber: session.session_number,
            narration: aggregated,
            player,
            companions,
          });
        }
        write('done', { length: aggregated.length });
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
