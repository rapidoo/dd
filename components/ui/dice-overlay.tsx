'use client';

import { useEffect, useState } from 'react';

export type DiceFaces = 4 | 6 | 8 | 10 | 12 | 20;

export type RollKind = 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration';

export interface DiceOverlayState {
  dice: Array<{ faces: DiceFaces; value: number }>;
  modifier: number;
  label: string;
  kind: RollKind;
  /** Primary d20 roll that was kept (post advantage/disadvantage). */
  keptD20?: number;
  /** All d20 rolls (1 or 2). */
  allD20?: number[];
  advantage?: 'normal' | 'advantage' | 'disadvantage';
  total: number;
  critical: boolean;
  fumble: boolean;
  dc?: number;
  targetAC?: number;
  outcome?: string | null;
}

const SHAPES: Record<DiceFaces, { clip: string; rounded: boolean }> = {
  4: { clip: 'polygon(50% 0%, 0% 100%, 100% 100%)', rounded: false },
  6: { clip: 'none', rounded: true },
  8: { clip: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', rounded: false },
  10: { clip: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', rounded: false },
  12: {
    clip: 'polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)',
    rounded: false,
  },
  20: { clip: 'polygon(50% 0%, 95% 25%, 100% 75%, 50% 100%, 0% 75%, 5% 25%)', rounded: false },
};

interface DieProps {
  faces: DiceFaces;
  value: number;
  rolling: boolean;
  critical?: boolean;
  fumble?: boolean;
}

function Die({ faces, value, rolling, critical, fumble }: DieProps) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setDisplay(value);
      return;
    }
    const id = setInterval(() => {
      setDisplay(1 + Math.floor(Math.random() * faces));
    }, 50);
    const stop = setTimeout(() => {
      clearInterval(id);
      setDisplay(value);
    }, 900);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [rolling, value, faces]);

  const shape = SHAPES[faces];
  const size = faces === 6 ? 80 : 88;
  const isCrit = !rolling && critical;
  const isFail = !rolling && fumble;

  const bg = isCrit
    ? 'radial-gradient(circle at 30% 30%, #ffd788, var(--color-candle) 60%, var(--color-gold-dim))'
    : isFail
      ? 'radial-gradient(circle at 30% 30%, #c45040, var(--color-blood) 60%, var(--color-blood-deep))'
      : 'radial-gradient(circle at 30% 30%, #f0d89a, var(--color-gold) 55%, var(--color-gold-dim))';

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        filter: rolling ? 'blur(1px)' : 'none',
        transition: 'filter 200ms',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: shape.clip === 'none' ? undefined : shape.clip,
          borderRadius: shape.rounded ? 8 : 0,
          background: bg,
          boxShadow:
            isCrit || isFail
              ? undefined
              : 'inset 0 -10px 20px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.6)',
          animation: isCrit
            ? 'critGlow 1.2s infinite'
            : isFail
              ? 'critFailGlow 1.2s infinite'
              : undefined,
          transform: rolling ? `rotate(${display * 30}deg)` : 'rotate(0deg)',
          transition: rolling ? 'none' : 'transform 400ms',
        }}
      />
      <span
        className="relative z-10 font-display font-bold"
        style={{
          fontSize: faces === 4 ? 24 : faces === 20 ? 30 : 32,
          color: isCrit ? '#3a1800' : isFail ? '#f8d8d0' : 'var(--color-bg-deep)',
          textShadow: '0 1px 0 rgba(255,255,255,0.3)',
          marginTop: faces === 4 ? 12 : 0,
        }}
      >
        {display}
      </span>
    </div>
  );
}

interface OverlayProps {
  state: DiceOverlayState | null;
  rolling: boolean;
  onDismiss: () => void;
}

export function DiceOverlay({ state, rolling, onDismiss }: OverlayProps) {
  if (!state) return null;
  const {
    dice,
    modifier,
    label,
    kind,
    keptD20,
    total,
    critical,
    fumble,
    advantage,
    allD20,
    dc,
    targetAC,
    outcome,
  } = state;

  const kindLabel =
    kind === 'attack'
      ? "JET D'ATTAQUE"
      : kind === 'save'
        ? 'SAUVEGARDE'
        : kind === 'damage'
          ? 'DÉGÂTS'
          : kind === 'initiative'
            ? 'INITIATIVE'
            : kind === 'concentration'
              ? 'CONCENTRATION'
              : 'TEST DE CARACTÉRISTIQUE';

  const advLabel =
    advantage === 'advantage' ? 'Avantage' : advantage === 'disadvantage' ? 'Désavantage' : null;

  // The "raw" value that gets the modifier added to it
  const rawD20 = keptD20 !== undefined ? keptD20 : null;
  const rawSum =
    rawD20 !== null ? rawD20 : dice.filter((d) => d.faces !== 20).reduce((a, d) => a + d.value, 0);

  const outcomeBanner =
    outcome === 'hit'
      ? { text: 'TOUCHÉ', color: 'var(--color-gold-bright)' }
      : outcome === 'miss'
        ? { text: 'MANQUÉ', color: 'var(--color-text-mute)' }
        : outcome === 'success'
          ? { text: 'RÉUSSI', color: 'var(--color-gold-bright)' }
          : outcome === 'failure'
            ? { text: 'ÉCHOUÉ', color: 'var(--color-text-mute)' }
            : null;

  return (
    <button
      type="button"
      onClick={() => {
        if (!rolling) onDismiss();
      }}
      disabled={rolling}
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center border-0 p-10 text-left backdrop-blur-md disabled:cursor-wait"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(10,5,2,0.85), rgba(0,0,0,0.95))',
        cursor: rolling ? 'wait' : 'pointer',
      }}
    >
      <p className="mb-1 text-center font-display text-[11px] tracking-[0.35em] text-gold">
        {kindLabel}
      </p>
      <p className="text-center font-display text-[28px] text-gold-bright">{label}</p>
      {(advLabel || dc !== undefined || targetAC !== undefined) && (
        <p className="mt-1 mb-8 text-center font-ui text-[11px] uppercase tracking-widest text-text-mute">
          {advLabel && <span>{advLabel}</span>}
          {advLabel && (dc !== undefined || targetAC !== undefined) && (
            <span className="mx-2">·</span>
          )}
          {dc !== undefined && <span>DD {dc}</span>}
          {targetAC !== undefined && <span>CA {targetAC}</span>}
        </p>
      )}
      {!advLabel && dc === undefined && targetAC === undefined && <div className="mb-8" />}

      <div className="mb-10 flex max-w-xl flex-wrap items-center justify-center gap-6">
        {dice.map((d, i) => {
          const isKept = keptD20 !== undefined && d.faces === 20 && d.value === keptD20 && !rolling;
          const dropped =
            allD20 !== undefined && d.faces === 20 && !isKept && allD20.length > 1 && !rolling;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length roll array, identity stable across renders
              key={`${d.faces}-${i}`}
              className="relative"
              style={{
                animation: rolling
                  ? 'diceTumble 900ms cubic-bezier(.2,.8,.4,1)'
                  : 'diceSettle 300ms',
                opacity: dropped ? 0.3 : 1,
                filter: dropped ? 'grayscale(0.7)' : 'none',
                transition: 'opacity 300ms, filter 300ms',
              }}
            >
              <Die
                faces={d.faces}
                value={d.value}
                rolling={rolling}
                critical={isKept && d.value === 20 && kind !== 'damage'}
                fumble={isKept && d.value === 1 && kind !== 'damage'}
              />
              {isKept && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-ui text-[9px] tracking-widest text-candle">
                  GARDÉ
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!rolling && (
        <div className="text-center" style={{ animation: 'fadeInUp 500ms' }}>
          {modifier !== 0 && (
            <p className="font-mono text-[13px] tracking-wider text-text-mute">
              {rawSum} <span className="text-text-faint">{modifier >= 0 ? '+' : '−'}</span>{' '}
              {Math.abs(modifier)}
            </p>
          )}
          <p
            className="font-display leading-none"
            style={{
              fontSize: 96,
              color: critical
                ? 'var(--color-candle-glow)'
                : fumble
                  ? '#e08070'
                  : 'var(--color-gold-bright)',
              textShadow: critical
                ? '0 0 30px var(--color-candle), 0 0 60px var(--color-candle)'
                : fumble
                  ? '0 0 30px var(--color-blood)'
                  : '0 0 20px rgba(212,166,76,0.5)',
            }}
          >
            {total}
          </p>
          {critical && (
            <p className="mt-2 font-display text-[14px] tracking-[0.3em] text-candle">
              ✦ CRITIQUE ✦
            </p>
          )}
          {fumble && (
            <p className="mt-2 font-display text-[14px] tracking-[0.3em] text-blood">
              ✦ ÉCHEC CRITIQUE ✦
            </p>
          )}
          {!critical && !fumble && outcomeBanner && (
            <p
              className="mt-2 font-display text-[14px] tracking-[0.3em]"
              style={{ color: outcomeBanner.color }}
            >
              {outcomeBanner.text}
            </p>
          )}
          <p className="mt-8 font-ui text-[11px] tracking-widest text-text-faint">
            Clique ou appuie sur Échap pour fermer
          </p>
        </div>
      )}
    </button>
  );
}
