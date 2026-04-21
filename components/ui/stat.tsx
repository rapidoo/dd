interface StatProps {
  label: string;
  value: string | number;
  pct?: number;
  barColor?: string;
}

/** Mini stat row with optional progress bar. Ported from session.html Stat. */
export function Stat({ label, value, pct, barColor }: StatProps) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between">
        <span className="font-ui text-[10px] uppercase tracking-[0.15em] text-text-mute">
          {label}
        </span>
        <span className="font-display text-[15px] text-gold-bright">{value}</span>
      </div>
      {pct !== undefined && (
        <div className="mt-1 h-[6px] w-full bg-[rgba(0,0,0,0.5)]">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              background:
                barColor ??
                'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold-bright))',
            }}
          />
        </div>
      )}
    </div>
  );
}

interface SlotRowProps {
  level: number | string;
  have: number;
  total: number;
}

/** Spell slot row — filled pips for remaining, empty for used. */
export function SlotRow({ level, have, total }: SlotRowProps) {
  const cells = Array.from({ length: total }, (_, i) => i < have);
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="font-display w-4 text-[11px] text-text-mute">{level}</span>
      <div className="flex gap-1">
        {cells.map((filled, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length deterministic pip row
            key={`${level}-${i}`}
            className={`block h-[10px] w-[10px] border border-gold ${
              filled ? 'bg-gold-bright' : 'bg-transparent'
            }`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
