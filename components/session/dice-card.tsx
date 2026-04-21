'use client';

import { useEffect, useState } from 'react';

export type DiceFaces = 4 | 6 | 8 | 10 | 12 | 20;
export type RollKind = 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration';

export interface DiceCardProps {
  label: string;
  kind: RollKind;
  dice: Array<{ faces: DiceFaces; value: number }>;
  modifier: number;
  total: number;
  keptD20?: number;
  allD20?: number[];
  advantage?: 'normal' | 'advantage' | 'disadvantage';
  outcome?: string | null;
  dc?: number;
  targetAC?: number;
  critical?: boolean;
  fumble?: boolean;
  time?: string;
}

const KIND_LABEL: Record<RollKind, string> = {
  attack: "Jet d'attaque",
  damage: 'Dégâts',
  save: 'Sauvegarde',
  check: 'Test',
  initiative: 'Initiative',
  concentration: 'Concentration',
};

const KIND_GLYPH: Record<RollKind, string> = {
  attack: '⚔',
  damage: '✦',
  save: '◈',
  check: '⚶',
  initiative: '⚡',
  concentration: '❋',
};

export function DiceCard(props: DiceCardProps) {
  const {
    label,
    kind,
    dice,
    modifier,
    total,
    keptD20,
    allD20,
    advantage,
    outcome,
    dc,
    targetAC,
    critical,
    fumble,
    time,
  } = props;

  // Brief tumble animation on mount, then settles on the real value.
  const [animating, setAnimating] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimating(false), 700);
    return () => clearTimeout(t);
  }, []);

  const rawSum =
    keptD20 !== undefined
      ? keptD20
      : dice.filter((d) => d.faces !== 20).reduce((a, d) => a + d.value, 0);

  const advLabel = advantage === 'advantage' ? 'Av.' : advantage === 'disadvantage' ? 'Dés.' : null;

  const totalColor = critical
    ? 'var(--color-candle-glow)'
    : fumble
      ? '#e08070'
      : 'var(--color-gold-bright)';

  const outcomeText =
    critical === true
      ? 'CRITIQUE'
      : fumble === true
        ? 'ÉCHEC CRITIQUE'
        : outcome === 'hit'
          ? 'TOUCHÉ'
          : outcome === 'miss'
            ? 'MANQUÉ'
            : outcome === 'success'
              ? 'RÉUSSI'
              : outcome === 'failure'
                ? 'ÉCHOUÉ'
                : null;

  const outcomeColor = critical
    ? 'var(--color-candle)'
    : fumble || outcome === 'miss' || outcome === 'failure'
      ? 'var(--color-blood)'
      : 'var(--color-gold)';

  return (
    <article
      className="msg-enter my-3 flex items-center gap-4 border border-line bg-[rgba(0,0,0,0.4)] px-4 py-3"
      style={{
        borderColor: critical
          ? 'rgba(240,176,80,0.4)'
          : fumble
            ? 'rgba(154,48,40,0.4)'
            : 'var(--color-line)',
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span aria-hidden className="font-display text-lg" style={{ color: totalColor }}>
          {KIND_GLYPH[kind]}
        </span>
        <DiePip
          faces={dice[0]?.faces ?? 20}
          value={dice[0]?.value ?? total}
          animating={animating}
          critical={critical}
          fumble={fumble}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate font-display text-[11px] uppercase tracking-[0.25em] text-gold">
          {KIND_LABEL[kind]}
          {advLabel && <span className="ml-2 text-text-mute">· {advLabel}</span>}
          {dc !== undefined && <span className="ml-2 text-text-mute">· DD {dc}</span>}
          {targetAC !== undefined && <span className="ml-2 text-text-mute">· CA {targetAC}</span>}
        </p>
        <p className="truncate font-narr text-base text-text">{label}</p>
        <p className="mt-1 font-mono text-[11px] text-text-mute">
          {allD20 && allD20.length > 1 && <span>[{allD20.join(', ')}] → </span>}
          {rawSum}
          {modifier !== 0 && (
            <span>
              {' '}
              {modifier >= 0 ? '+' : '−'} {Math.abs(modifier)}
            </span>
          )}
          {' = '}
          <span className="font-semibold" style={{ color: totalColor }}>
            {total}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="font-display leading-none"
          style={{
            fontSize: 40,
            color: totalColor,
            textShadow: critical
              ? '0 0 12px var(--color-candle)'
              : fumble
                ? '0 0 12px var(--color-blood)'
                : 'none',
          }}
        >
          {total}
        </span>
        {outcomeText && (
          <span
            className="font-display text-[10px] uppercase tracking-[0.3em]"
            style={{ color: outcomeColor }}
          >
            {outcomeText}
          </span>
        )}
        {time && !outcomeText && (
          <span className="font-mono text-[10px] text-text-faint">{time}</span>
        )}
      </div>
    </article>
  );
}

function DiePip({
  faces,
  value,
  animating,
  critical,
  fumble,
}: {
  faces: DiceFaces;
  value: number;
  animating: boolean;
  critical?: boolean;
  fumble?: boolean;
}) {
  const [display, setDisplay] = useState(animating ? 1 : value);
  useEffect(() => {
    if (!animating) {
      setDisplay(value);
      return;
    }
    const id = setInterval(() => {
      setDisplay(1 + Math.floor(Math.random() * faces));
    }, 60);
    const stop = setTimeout(() => {
      clearInterval(id);
      setDisplay(value);
    }, 700);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [animating, value, faces]);

  const bg = critical
    ? 'radial-gradient(circle at 30% 30%, #ffd788, var(--color-candle) 60%, var(--color-gold-dim))'
    : fumble
      ? 'radial-gradient(circle at 30% 30%, #c45040, var(--color-blood) 60%, var(--color-blood-deep))'
      : 'radial-gradient(circle at 30% 30%, #f0d89a, var(--color-gold) 55%, var(--color-gold-dim))';

  return (
    <div
      aria-hidden
      className="flex h-10 w-10 items-center justify-center font-display font-bold text-[16px]"
      style={{
        clipPath:
          faces === 20
            ? 'polygon(50% 0%, 95% 25%, 100% 75%, 50% 100%, 0% 75%, 5% 25%)'
            : faces === 6
              ? undefined
              : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        borderRadius: faces === 6 ? 6 : 0,
        background: bg,
        color: critical ? '#3a1800' : fumble ? '#f8d8d0' : 'var(--color-bg-deep)',
        textShadow: '0 1px 0 rgba(255,255,255,0.3)',
        boxShadow:
          critical || fumble
            ? undefined
            : 'inset 0 -6px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.5)',
        filter: animating ? 'blur(0.5px)' : 'none',
      }}
    >
      {display}
    </div>
  );
}
