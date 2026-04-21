'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { DiceCard, type DiceCardProps } from '../../../../components/session/dice-card';
import { Message, TypingIndicator } from '../../../../components/session/message';
import { SessionSidebar } from '../../../../components/session/sidebar';
import { BtnPrimary } from '../../../../components/ui/button';
import { SlotRow, Stat } from '../../../../components/ui/stat';
import type { CharacterRow, MessageRow } from '../../../../lib/db/types';
import { adjustHP } from '../../../../lib/server/character-actions';
import { promptCompanion } from '../../../../lib/server/companion-actions';
import { getParty } from '../../../../lib/server/party';
import { postUserMessage } from '../../../../lib/server/sessions';

interface Props {
  campaignId: string;
  campaignName: string;
  sessionId: string;
  sessionNumber: number;
  initialMessages: MessageRow[];
  player: CharacterRow | null;
  companions: CharacterRow[];
}

type DisplayMessage =
  | {
      kind: 'msg';
      id: string;
      authorKind: 'user' | 'gm' | 'companion';
      authorName: string;
      content: string;
      time: string;
      streaming?: boolean;
      color?: string;
    }
  | {
      kind: 'dice';
      id: string;
      time: string;
      card: DiceCardProps;
    };

export function PlayClient({
  campaignId,
  campaignName,
  sessionId,
  sessionNumber,
  initialMessages,
  player: initialPlayer,
  companions: initialCompanions,
}: Props) {
  const [player, setPlayer] = useState(initialPlayer);
  const [companions, setCompanions] = useState(initialCompanions);
  const companionMap = new Map(companions.map((c) => [c.id, c]));
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map((m) => toDisplay(m, companionMap)),
  );

  async function refreshParty() {
    try {
      const next = await getParty(campaignId);
      setPlayer(next.player);
      setCompanions(next.companions);
    } catch {
      // silent — next turn will retry
    }
  }
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
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
      { kind: 'msg', id: tempId, authorKind: 'user', authorName: playerName(), content, time: now },
    ]);

    startTransition(async () => {
      const result = await postUserMessage({ sessionId, content });
      if (!result.ok) {
        setMessages((m) => [
          ...m,
          {
            kind: 'msg',
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

  async function streamGmFollowUp(time: string) {
    return runGmStream(time, `/api/sessions/${sessionId}/stream?trigger=companion_spoke`);
  }

  async function streamGm(userMessage: string, time: string) {
    return runGmStream(
      time,
      `/api/sessions/${sessionId}/stream?message=${encodeURIComponent(userMessage)}`,
    );
  }

  async function runGmStream(time: string, url: string) {
    setTyping('Le Conteur');
    const gmId = `gm-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        kind: 'msg',
        id: gmId,
        authorKind: 'gm',
        authorName: 'Le Conteur',
        content: '',
        time,
        streaming: true,
      },
    ]);
    try {
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
            setMessages((m) => appendToMsg(m, gmId, text));
          } else if (ev.event === 'companion') {
            const comp = ev.data as { characterId: string; name: string; content: string };
            const now = new Date().toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            setMessages((m) => [
              ...m,
              {
                kind: 'msg',
                id: `c-${Date.now()}-${comp.characterId}`,
                authorKind: 'companion',
                authorName: comp.name,
                content: comp.content,
                time: now,
                color: '#c47a3a',
              },
            ]);
          } else if (ev.event === 'dice') {
            const roll = ev.data as {
              dice: number[];
              modifier: number;
              total: number;
              kind: string;
              label?: string;
              outcome: string | null;
              advantage: 'normal' | 'advantage' | 'disadvantage';
              expression: string;
              dc?: number;
              targetAC?: number;
            };
            setMessages((m) => [...m, diceMsg(roll)]);
          } else if (ev.event === 'error') {
            const errText = (ev.data as { message: string }).message;
            setMessages((m) => appendToMsg(m, gmId, `\n⚠ ${errText}`));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de streaming';
      setMessages((m) =>
        m.map((x) =>
          x.kind === 'msg' && x.id === gmId
            ? { ...x, content: `⚠ ${message}`, streaming: false }
            : x,
        ),
      );
    } finally {
      setTyping(null);
      setMessages((m) =>
        m.map((x) => (x.kind === 'msg' && x.id === gmId ? { ...x, streaming: false } : x)),
      );
      void refreshParty();
    }
  }

  return (
    <div className="relative flex h-screen">
      <SessionSidebar campaignId={campaignId} current="session" />
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
              {messages.map((m) =>
                m.kind === 'dice' ? (
                  <DiceCard key={m.id} {...m.card} />
                ) : (
                  <Message
                    key={m.id}
                    author={{
                      kind:
                        m.authorKind === 'gm'
                          ? 'gm'
                          : m.authorKind === 'companion'
                            ? 'companion'
                            : 'user',
                      name: m.authorName,
                      glyph:
                        m.authorKind === 'gm'
                          ? '⚜'
                          : m.authorKind === 'companion'
                            ? '◉'
                            : undefined,
                      color: m.color,
                    }}
                    text={renderNarration(m.content)}
                    time={m.time}
                    mode={m.authorKind === 'user' ? 'action' : 'narration'}
                  />
                ),
              )}
              {typing && <TypingIndicator who={typing} />}
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
                disabled={isPending || typing !== null}
                placeholder="Décris ce que tu fais…"
                className="flex-1 resize-none rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold disabled:opacity-60"
              />
              <BtnPrimary icon="▸" onClick={send} disabled={isPending || typing !== null}>
                Envoyer
              </BtnPrimary>
            </div>
          </div>

          {(player || companions.length > 0) && (
            <PlayerPanel
              campaignId={campaignId}
              player={player}
              companions={companions}
              onRefresh={refreshParty}
              onPromptCompanion={(characterId) => {
                const comp = companions.find((c) => c.id === characterId);
                if (!comp) return;
                setTyping(comp.name);
                promptCompanion({ sessionId, characterId }).then(async (res) => {
                  setTyping(null);
                  const content = res.ok ? res.content : undefined;
                  if (!content) return;
                  const now = new Date().toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  setMessages((m) => [
                    ...m,
                    {
                      kind: 'msg',
                      id: `c-${Date.now()}-${characterId}`,
                      authorKind: 'companion',
                      authorName: res.characterName ?? comp.name,
                      content,
                      time: now,
                      color: '#c47a3a',
                    },
                  ]);
                  await streamGmFollowUp(now);
                  void refreshParty();
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function appendToMsg(messages: DisplayMessage[], id: string, text: string): DisplayMessage[] {
  return messages.map((m) =>
    m.kind === 'msg' && m.id === id ? { ...m, content: m.content + text } : m,
  );
}

function diceMsg(roll: {
  dice: number[];
  modifier: number;
  total: number;
  kind: string;
  label?: string;
  outcome: string | null;
  advantage: 'normal' | 'advantage' | 'disadvantage';
  expression: string;
  dc?: number;
  targetAC?: number;
}): Extract<DisplayMessage, { kind: 'dice' }> {
  const faces = inferFaces(roll.expression);
  const diceArray = roll.dice.map((value) => ({ faces, value }));
  const primaryD20 = faces === 20 ? roll.dice[0] : undefined;
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return {
    kind: 'dice',
    id: `d-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time,
    card: {
      label: roll.label?.trim() || defaultLabel(roll.kind),
      kind: normalizeKind(roll.kind),
      dice: diceArray,
      modifier: roll.modifier,
      total: roll.total,
      keptD20: primaryD20,
      allD20: faces === 20 ? roll.dice : undefined,
      advantage: roll.advantage,
      outcome: roll.outcome,
      dc: roll.dc,
      targetAC: roll.targetAC,
      critical: roll.outcome === 'crit',
      fumble: roll.outcome === 'fumble',
      time,
    },
  };
}

const COMPANION_COLORS = ['#c47a3a', '#a86a9a', '#4a6a8a', '#6a7a3a', '#6a5a8a'];
const COMPANION_GLYPHS = ['⚔', '♪', '❋', '✦', '◈'];

function PlayerPanel({
  campaignId,
  player,
  companions,
  onPromptCompanion,
  onRefresh,
}: {
  campaignId: string;
  player: CharacterRow | null;
  companions: CharacterRow[];
  onPromptCompanion: (characterId: string) => void;
  onRefresh: () => void;
}) {
  const party: Array<{ row: CharacterRow; isMj: false; color: string; glyph: string }> = [];
  if (player) party.push({ row: player, isMj: false, color: 'var(--color-gold)', glyph: '⚜' });
  companions.forEach((c, i) => {
    party.push({
      row: c,
      isMj: false,
      color: COMPANION_COLORS[i % COMPANION_COLORS.length] ?? '#c47a3a',
      glyph: COMPANION_GLYPHS[i % COMPANION_GLYPHS.length] ?? '◉',
    });
  });

  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-auto border-l border-line bg-[rgba(0,0,0,0.3)]">
      <section className="border-b border-line px-5 py-5">
        <p className="mb-3 font-display text-[10px] uppercase tracking-[0.3em] text-gold">
          ✧ Autour du feu
        </p>
        <ul className="space-y-0">
          {party.map((m) => {
            const isAi = m.row.is_ai;
            const row = (
              <div className="flex items-center gap-3 py-2">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm text-bg-deep"
                  style={{
                    background: `radial-gradient(circle, ${m.color}, ${m.color}88)`,
                    border: `1.5px solid ${m.color}`,
                  }}
                  aria-hidden
                >
                  {m.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[13px] text-text">{m.row.name}</p>
                  <p className="truncate text-[10px] text-text-mute">{roleLabel(m.row)}</p>
                </div>
                {!isAi && (
                  <span className="font-ui text-[9px] uppercase tracking-widest text-moss">
                    ● {statusLabel(m.row)}
                  </span>
                )}
              </div>
            );
            return (
              <li
                key={m.row.id}
                className="flex flex-col gap-2 border-b border-line py-2 last:border-b-0"
              >
                <Link
                  href={`/campaigns/${campaignId}/sheet?character=${m.row.id}`}
                  className="group -mx-1 rounded-sm px-1 transition-colors hover:bg-[rgba(212,166,76,0.06)]"
                  title="Voir la fiche"
                >
                  {row}
                </Link>
                {isAi && (
                  <button
                    type="button"
                    onClick={() => onPromptCompanion(m.row.id)}
                    title="Lui passer la parole"
                    className="inline-flex w-full items-center justify-center gap-2 border border-gold/60 bg-gradient-to-b from-gold-bright/15 to-gold/10 px-3 py-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-bright transition-colors hover:border-gold hover:bg-[rgba(212,166,76,0.15)]"
                  >
                    ▸ Parler
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {player && <CharacterStats character={player} onChanged={onRefresh} />}
      {companions.map((c) => (
        <CharacterStats key={c.id} character={c} onChanged={onRefresh} />
      ))}
    </aside>
  );
}

function CharacterStats({
  character,
  onChanged,
}: {
  character: CharacterRow;
  onChanged: () => void;
}) {
  const pct = Math.round((character.current_hp / Math.max(1, character.max_hp)) * 100);
  const slots = character.spell_slots ?? {};
  const badge = character.is_ai ? '◉' : '✧';
  return (
    <section className="border-t border-line px-5 py-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.3em] text-gold">
        {badge} {character.name}
        {character.is_ai && <span className="ml-2 text-text-mute">· allié</span>}
      </p>
      <Stat
        label="Points de vie"
        value={`${character.current_hp} / ${character.max_hp}`}
        pct={pct}
        barColor="linear-gradient(90deg, #5a1810, #9a3028)"
      />
      <HpQuickControls characterId={character.id} onChanged={onChanged} />
      <Stat label="Classe d'armure" value={character.ac} />
      <Stat label="Vitesse" value={`${character.speed} m`} />
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
    </section>
  );
}

function HpQuickControls({
  characterId,
  onChanged,
}: {
  characterId: string;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState(5);
  const [pending, startTransition] = useTransition();
  const run = (delta: number) => {
    startTransition(async () => {
      await adjustHP({ characterId, delta });
      onChanged();
    });
  };
  return (
    <div className="-mt-1 mb-3 flex items-center gap-1">
      <label className="flex items-center gap-1">
        <span className="sr-only">Montant</span>
        <input
          type="number"
          value={amount}
          min={1}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
          title="Montant à appliquer"
          className="w-12 rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-1 py-1 text-center font-mono text-[11px] text-text outline-none focus:border-gold"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(-amount)}
        title={`Retirer ${amount} PV`}
        className="flex-1 border border-line bg-transparent py-1 font-ui text-[10px] uppercase tracking-widest text-text-mute transition-colors hover:border-blood hover:text-blood disabled:opacity-50"
      >
        − {amount} PV
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(amount)}
        title={`Soigner de ${amount} PV`}
        className="flex-1 border border-line bg-transparent py-1 font-ui text-[10px] uppercase tracking-widest text-text-mute transition-colors hover:border-moss hover:text-moss disabled:opacity-50"
      >
        + {amount} PV
      </button>
    </div>
  );
}

function roleLabel(c: CharacterRow): string {
  const klass = c.class.charAt(0).toUpperCase() + c.class.slice(1);
  return c.is_ai ? `${klass} · Allié` : `${klass} ${c.level}`;
}

function statusLabel(c: CharacterRow): string {
  if (c.current_hp <= 0) return 'À TERRE';
  if (c.current_hp < c.max_hp / 2) return 'BLESSÉ';
  return 'PRÊT';
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

function toDisplay(m: MessageRow, companions: Map<string, CharacterRow>): DisplayMessage {
  const time = new Date(m.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (m.author_kind === 'character' && m.author_id) {
    const comp = companions.get(m.author_id);
    return {
      kind: 'msg',
      id: m.id,
      authorKind: 'companion',
      authorName: comp?.name ?? 'Compagnon',
      content: m.content,
      time,
      color: '#c47a3a',
    };
  }
  return {
    kind: 'msg',
    id: m.id,
    authorKind: m.author_kind === 'user' ? 'user' : 'gm',
    authorName: m.author_kind === 'user' ? 'Toi' : 'Le Conteur',
    content: m.content,
    time,
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

function defaultLabel(kind: string): string {
  switch (kind) {
    case 'attack':
      return 'Attaque';
    case 'damage':
      return 'Dégâts';
    case 'save':
      return 'Sauvegarde';
    case 'check':
      return 'Test';
    case 'initiative':
      return 'Initiative';
    case 'concentration':
      return 'Concentration';
    default:
      return kind;
  }
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
