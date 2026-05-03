'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { CombatTracker } from '../../../../components/session/combat-tracker';
import { DiceCard, type DiceCardProps } from '../../../../components/session/dice-card';
import { Message, TypingIndicator } from '../../../../components/session/message';
import { SessionSidebar } from '../../../../components/session/sidebar';
import { BtnPrimary } from '../../../../components/ui/button';
import { SlotRow, Stat } from '../../../../components/ui/stat';
import type { CharacterRow, MessageRow } from '../../../../lib/db/types';
import { CLASSES, SPECIES, WITCHER_CLASSES, WITCHER_SPECIES } from '../../../../lib/rules/srd';
import { getActiveCombat } from '../../../../lib/server/combat-actions';
import type { CombatState } from '../../../../lib/server/combat-loop';
import { promptCompanion } from '../../../../lib/server/companion-actions';
import type { InventoryItem } from '../../../../lib/server/inventory-actions';
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
  const [combatState, setCombatState] = useState<CombatState | null>(null);

  async function refreshParty() {
    try {
      const next = await getParty(campaignId);
      setPlayer(next.player);
      setCompanions(next.companions);
    } catch {
      // silent — next turn will retry
    }
  }

  // Hydrate combat state on mount — there may already be an active encounter
  // from a previous tab/session; the tracker should appear immediately.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is stable
  useEffect(() => {
    void getActiveCombat({ sessionId }).then((s) => {
      if (s) setCombatState(s);
    });
  }, []);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [partyOpen, setPartyOpen] = useState(false);
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
          } else if (ev.event === 'combat') {
            const data = ev.data as
              | { phase: 'started'; combatId: string }
              | { phase: 'ended' }
              | { phase: 'state'; state: CombatState };
            if (data.phase === 'started') {
              // The accompanying `state` payload arrives on the very next event.
              // Optimistically clear any stale state so the tracker shows fresh.
              setCombatState(null);
            } else if (data.phase === 'state') {
              setCombatState(data.state);
            } else if (data.phase === 'ended') {
              setCombatState(null);
            }
            void refreshParty();
          } else if (ev.event === 'party') {
            // Inventory / currency / slots / rest changed mid-turn.
            void refreshParty();
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
        m.flatMap((x) => {
          if (x.kind !== 'msg' || x.id !== gmId) return [x];
          if (!x.content.trim()) return [];
          return [{ ...x, streaming: false }];
        }),
      );
      void refreshParty();
    }
  }

  return (
    <div className="relative flex h-screen">
      <SessionSidebar campaignId={campaignId} current="session" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line bg-gradient-to-br from-[rgba(212,166,76,0.1)] to-transparent px-4 py-4 md:px-8">
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
          {(player || companions.length > 0) && (
            <button
              type="button"
              onClick={() => setPartyOpen(true)}
              aria-label="Voir l'équipe"
              className="flex h-10 items-center gap-2 rounded-md border border-line px-3 font-display text-[11px] uppercase tracking-[0.2em] text-gold hover:border-gold lg:hidden"
            >
              <span aria-hidden>⚔</span>
              Équipe
            </button>
          )}
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto px-4 pt-6 pb-4 md:px-10"
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

            <div className="flex items-end gap-2 border-t border-line px-4 py-4 md:px-8">
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
              <BtnPrimary
                icon="▸"
                onClick={send}
                disabled={isPending || typing !== null}
                aria-label="Envoyer"
              >
                <span className="hidden md:inline">Envoyer</span>
              </BtnPrimary>
            </div>
          </div>

          {(player || companions.length > 0) && (
            <>
              <div className="hidden lg:flex">
                <PlayerPanel
                  campaignId={campaignId}
                  player={player}
                  companions={companions}
                  onPromptCompanion={handlePromptCompanion}
                  combatState={combatState}
                />
              </div>
              {partyOpen && (
                <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
                  <button
                    type="button"
                    aria-label="Fermer le panneau équipe"
                    className="flex-1 bg-black/70"
                    onClick={() => setPartyOpen(false)}
                  />
                  <div className="relative flex w-[min(85vw,340px)] flex-col border-l border-line bg-bg-deep shadow-2xl">
                    <button
                      type="button"
                      onClick={() => setPartyOpen(false)}
                      aria-label="Fermer"
                      className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line text-text-mute hover:border-gold hover:text-gold"
                    >
                      ✕
                    </button>
                    <PlayerPanel
                      campaignId={campaignId}
                      player={player}
                      companions={companions}
                      combatState={combatState}
                      onPromptCompanion={(characterId) => {
                        setPartyOpen(false);
                        handlePromptCompanion(characterId);
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  function handlePromptCompanion(characterId: string) {
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
  }
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
  combatState,
}: {
  campaignId: string;
  player: CharacterRow | null;
  companions: CharacterRow[];
  onPromptCompanion: (characterId: string) => void;
  combatState: CombatState | null;
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
      {combatState && (
        <section className="border-b border-line px-3 py-3">
          <CombatTracker state={combatState} />
        </section>
      )}
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

      {player && <CharacterStats character={player} campaignId={campaignId} />}
      {companions.map((c) => (
        <CharacterStats key={c.id} character={c} campaignId={campaignId} />
      ))}
    </aside>
  );
}

function CharacterStats({
  character,
  campaignId,
}: {
  character: CharacterRow;
  campaignId: string;
}) {
  const pct = Math.round((character.current_hp / Math.max(1, character.max_hp)) * 100);
  const slots = character.spell_slots ?? {};
  const badge = character.is_ai ? '◉' : '✧';
  return (
    <section className="border-t border-line px-5 py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-gold">
          {badge} {character.name}
          {character.is_ai && <span className="ml-2 text-text-mute">· allié</span>}
        </p>
        <Link
          href={`/campaigns/${campaignId}/sheet?character=${character.id}`}
          className="font-ui text-[10px] uppercase tracking-widest text-text-mute transition-colors hover:text-gold"
        >
          Fiche →
        </Link>
      </div>
      <Stat
        label="Points de vie"
        value={`${character.current_hp} / ${character.max_hp}`}
        pct={pct}
        barColor="linear-gradient(90deg, #5a1810, #9a3028)"
      />
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
      <PurseInline currency={character.currency} />
      <InventoryInline
        inventory={character.inventory as InventoryItem[] | null}
        characterId={character.id}
        campaignId={campaignId}
      />
    </section>
  );
}

type Currency = CharacterRow['currency'];

const COIN_ORDER: Array<{ key: keyof Currency; symbol: string; color: string }> = [
  { key: 'pp', symbol: 'pp', color: '#d6e2eb' },
  { key: 'gp', symbol: 'po', color: '#ecc87a' },
  { key: 'ep', symbol: 'el', color: '#c4b26a' },
  { key: 'sp', symbol: 'pa', color: '#c9c9c9' },
  { key: 'cp', symbol: 'pc', color: '#c47a3a' },
];

function PurseInline({ currency }: { currency: Currency | null }) {
  const c = currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const nonZero = COIN_ORDER.filter(({ key }) => (c[key] ?? 0) > 0);
  return (
    <div className="mt-4">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-text-mute">Bourse</p>
      {nonZero.length === 0 ? (
        <p className="font-narr text-[12px] italic text-text-faint">Vide.</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
          {nonZero.map(({ key, symbol, color }) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span className="font-narr text-[14px] text-gold-bright">{c[key]}</span>
              <span style={{ color }}>{symbol}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryInline({
  inventory,
  characterId,
  campaignId,
}: {
  inventory: InventoryItem[] | null;
  characterId: string;
  campaignId: string;
}) {
  const items = inventory ?? [];
  const visible = items.slice(0, 4);
  const hidden = items.length - visible.length;
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-mute">
          Équipement {items.length > 0 && <span className="text-text-faint">· {items.length}</span>}
        </p>
        <Link
          href={`/campaigns/${campaignId}/sheet?character=${characterId}#inventaire`}
          className="font-ui text-[9px] uppercase tracking-widest text-text-mute hover:text-gold"
        >
          Gérer →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="font-narr text-[12px] italic text-text-faint">Sac vide.</p>
      ) : (
        <ul className="space-y-0.5">
          {visible.map((item) => (
            <li key={item.id} className="flex justify-between font-narr text-[12px] text-text">
              <span className="truncate pr-2">{item.name}</span>
              <span className="shrink-0 font-mono text-text-mute">×{item.qty}</span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="font-narr text-[11px] italic text-text-faint">
              … et {hidden} autre{hidden > 1 ? 's' : ''}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function roleLabel(c: CharacterRow): string {
  const klass =
    CLASSES[c.class]?.name ??
    WITCHER_CLASSES[c.class]?.name ??
    c.class.charAt(0).toUpperCase() + c.class.slice(1);
  const species =
    SPECIES[c.species]?.name ??
    WITCHER_SPECIES[c.species]?.name ??
    c.species.charAt(0).toUpperCase() + c.species.slice(1);
  return c.is_ai ? `${species} · ${klass} · Allié` : `${species} · ${klass} ${c.level}`;
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
