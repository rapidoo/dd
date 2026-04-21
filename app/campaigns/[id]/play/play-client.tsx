'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Message, TypingIndicator } from '../../../../components/session/message';
import { SessionSidebar } from '../../../../components/session/sidebar';
import { BtnPrimary } from '../../../../components/ui/button';
import { DiceOverlay, type DiceOverlayState } from '../../../../components/ui/dice-overlay';
import { SlotRow, Stat } from '../../../../components/ui/stat';
import type { CharacterRow, MessageRow } from '../../../../lib/db/types';
import { postUserMessage } from '../../../../lib/server/sessions';

interface Props {
  campaignName: string;
  sessionId: string;
  sessionNumber: number;
  initialMessages: MessageRow[];
  player: CharacterRow | null;
}

interface DisplayMessage {
  id: string;
  authorKind: 'user' | 'gm';
  authorName: string;
  content: string;
  time: string;
  streaming?: boolean;
}

export function PlayClient({
  campaignName,
  sessionId,
  sessionNumber,
  initialMessages,
  player,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() => initialMessages.map(toDisplay));
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [dice, setDice] = useState<DiceOverlayState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll reacts to count changes, not contents
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, typing]);

  function playerName() {
    return player?.name ?? 'Toi';
  }

  async function send() {
    const content = input.trim();
    if (!content) return;
    setInput('');
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const tempId = `u-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tempId, authorKind: 'user', authorName: playerName(), content, time: now },
    ]);

    startTransition(async () => {
      const result = await postUserMessage({ sessionId, content });
      if (!result.ok) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            authorKind: 'gm',
            authorName: 'Système',
            content: `⚠ ${result.error}`,
            time: now,
          },
        ]);
        return;
      }
      await streamGm(content, now);
    });
  }

  async function streamGm(userMessage: string, time: string) {
    setTyping(true);
    const gmId = `gm-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: gmId, authorKind: 'gm', authorName: 'Le Conteur', content: '', time, streaming: true },
    ]);
    try {
      const url = `/api/sessions/${sessionId}/stream?message=${encodeURIComponent(userMessage)}`;
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error('Stream indisponible');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const chunk of lines) {
          const ev = parseSse(chunk);
          if (!ev) continue;
          if (ev.event === 'delta') {
            const text = (ev.data as { text: string }).text;
            setMessages((m) =>
              m.map((msg) => (msg.id === gmId ? { ...msg, content: msg.content + text } : msg)),
            );
          } else if (ev.event === 'dice') {
            const roll = ev.data as {
              dice: number[];
              modifier: number;
              total: number;
              kind: string;
              outcome: string | null;
              advantage: 'normal' | 'advantage' | 'disadvantage';
              expression: string;
            };
            showDice(roll);
          } else if (ev.event === 'error') {
            const msg = (ev.data as { message: string }).message;
            setMessages((m) =>
              m.map((x) => (x.id === gmId ? { ...x, content: `${x.content}\n⚠ ${msg}` } : x)),
            );
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de streaming';
      setMessages((m) =>
        m.map((x) => (x.id === gmId ? { ...x, content: `⚠ ${message}`, streaming: false } : x)),
      );
    } finally {
      setTyping(false);
      setMessages((m) => m.map((x) => (x.id === gmId ? { ...x, streaming: false } : x)));
    }
  }

  function showDice(roll: {
    dice: number[];
    modifier: number;
    total: number;
    kind: string;
    outcome: string | null;
    advantage: 'normal' | 'advantage' | 'disadvantage';
    expression: string;
  }) {
    const faces = inferFaces(roll.expression);
    const diceArray = roll.dice.map((value) => ({ faces, value }));
    const primaryD20 = faces === 20 ? roll.dice[0] : undefined;
    setDice({
      dice: diceArray,
      modifier: roll.modifier,
      label: roll.kind.toUpperCase(),
      kind: normalizeKind(roll.kind),
      keptD20: primaryD20,
      allD20: faces === 20 ? roll.dice : undefined,
      advantage: roll.advantage,
      total: roll.total,
      critical: roll.outcome === 'crit',
      fumble: roll.outcome === 'fumble',
    });
    setRolling(true);
    setTimeout(() => setRolling(false), 1000);
  }

  return (
    <div className="relative flex h-screen">
      <SessionSidebar current="session" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line bg-gradient-to-br from-[rgba(212,166,76,0.1)] to-transparent px-8 py-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-candle-glow to-gold text-lg text-bg-deep"
              style={{ boxShadow: '0 0 20px rgba(240,176,80,0.44)' }}
            >
              ⚜
            </div>
            <div>
              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-gold">
                Session {sessionNumber}
              </p>
              <h1 className="font-narr text-xl text-gold-bright">{campaignName}</h1>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto px-10 pt-6 pb-4"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 100%, rgba(240,176,80,0.05), transparent 60%)',
              }}
            >
              {messages.length === 0 && (
                <p className="font-narr italic text-text-mute">
                  Le feu crépite. Le Conteur te regarde. Que racontes-tu&nbsp;?
                </p>
              )}
              {messages.map((m) => (
                <Message
                  key={m.id}
                  author={{
                    kind: m.authorKind === 'gm' ? 'gm' : 'user',
                    name: m.authorName,
                    glyph: m.authorKind === 'gm' ? '⚜' : undefined,
                  }}
                  text={renderNarration(m.content)}
                  time={m.time}
                  mode={m.authorKind === 'user' ? 'action' : 'narration'}
                />
              ))}
              {typing && <TypingIndicator who="Le Conteur" />}
            </div>

            <div className="flex items-end gap-2 border-t border-line px-8 py-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                disabled={isPending || typing}
                placeholder="Décris ce que tu fais…"
                className="flex-1 resize-none rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold disabled:opacity-60"
              />
              <BtnPrimary icon="▸" onClick={send} disabled={isPending || typing}>
                Envoyer
              </BtnPrimary>
            </div>
          </div>

          {player && <PlayerPanel player={player} />}
        </div>
      </div>

      <DiceOverlay state={dice} rolling={rolling} onDismiss={() => setDice(null)} />
    </div>
  );
}

function PlayerPanel({ player }: { player: CharacterRow }) {
  const pct = Math.round((player.current_hp / Math.max(1, player.max_hp)) * 100);
  const slots = player.spell_slots ?? {};
  return (
    <aside className="w-[300px] shrink-0 overflow-auto border-l border-line bg-[rgba(0,0,0,0.3)] px-5 py-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.3em] text-gold">
        ✧ {player.name}
      </p>
      <Stat
        label="Points de vie"
        value={`${player.current_hp} / ${player.max_hp}`}
        pct={pct}
        barColor="linear-gradient(90deg, #5a1810, #9a3028)"
      />
      <Stat label="Classe d'armure" value={player.ac} />
      <Stat label="Vitesse" value={`${player.speed} m`} />
      {Object.keys(slots).length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-text-mute">Emplacements</p>
          {Object.entries(slots)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([lvl, s]) => (
              <SlotRow key={lvl} level={lvl} have={s.max - s.used} total={s.max} />
            ))}
        </div>
      )}
    </aside>
  );
}

/**
 * Safely render narration text that may contain <em>...</em> tags from the GM.
 * Strips every other tag — no innerHTML shortcut, no XSS risk.
 */
function renderNarration(raw: string) {
  const segments: Array<{ emph: boolean; text: string }> = [];
  const re = /<em>(.*?)<\/em>/gis;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match !== null) {
    if (match.index > last) segments.push({ emph: false, text: raw.slice(last, match.index) });
    segments.push({ emph: true, text: match[1] ?? '' });
    last = match.index + match[0].length;
    match = re.exec(raw);
  }
  if (last < raw.length) segments.push({ emph: false, text: raw.slice(last) });
  return (
    <>
      {segments.map((seg, i) =>
        seg.emph ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: order is stable after parsing, count small
          <em key={`e-${i}`}>{seg.text}</em>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: order is stable after parsing, count small
          <span key={`t-${i}`}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function toDisplay(m: MessageRow): DisplayMessage {
  return {
    id: m.id,
    authorKind: m.author_kind === 'user' ? 'user' : 'gm',
    authorName: m.author_kind === 'user' ? 'Toi' : 'Le Conteur',
    content: m.content,
    time: new Date(m.created_at).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function parseSse(chunk: string): { event: string; data: unknown } | null {
  const lines = chunk.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

function inferFaces(expr: string): 4 | 6 | 8 | 10 | 12 | 20 {
  const match = /d(\d+)/i.exec(expr);
  if (!match) return 20;
  const n = Number(match[1]);
  if (n === 4 || n === 6 || n === 8 || n === 10 || n === 12 || n === 20) return n;
  return 20;
}

function normalizeKind(
  kind: string,
): 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration' {
  if (
    kind === 'attack' ||
    kind === 'damage' ||
    kind === 'save' ||
    kind === 'check' ||
    kind === 'initiative' ||
    kind === 'concentration'
  )
    return kind;
  return 'check';
}
