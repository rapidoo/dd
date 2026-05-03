import type { CombatState, Participant } from '../../lib/server/combat-loop';

/**
 * Live combat tracker — round counter, initiative order, HP bars, conditions,
 * and a ▶ cursor on whoever's turn it is. Fed by `combat_state` SSE events
 * pushed from the server-authoritative loop, so the client never has to refetch
 * party rows mid-encounter.
 */
export function CombatTracker({ state }: { state: CombatState }) {
  const current = state.participants.find((p) => p.isCurrent);
  return (
    <section className="border border-line bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-gold">
          ⚔ Combat — round {state.round}
        </p>
        {current && (
          <p className="font-narr text-xs text-text-mute">
            Tour de <span className="text-gold-bright">{current.name}</span>
          </p>
        )}
      </header>
      <ul className="flex flex-col gap-2">
        {state.participants.map((p) => (
          <ParticipantRow key={p.id} participant={p} />
        ))}
      </ul>
    </section>
  );
}

const KIND_LABEL: Record<Participant['kind'], string> = {
  pc: 'PJ',
  companion: 'Compagnon',
  npc: 'PNJ',
};

function ParticipantRow({ participant }: { participant: Participant }) {
  const down = participant.currentHP <= 0;
  const pct = participant.maxHP > 0 ? (participant.currentHP / participant.maxHP) * 100 : 0;
  const barColor = down
    ? 'rgba(120, 30, 30, 0.6)'
    : pct < 30
      ? 'linear-gradient(90deg, #6b1f1f, #a83232)'
      : pct < 60
        ? 'linear-gradient(90deg, #8a6e2e, #d4a64c)'
        : 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold-bright))';
  return (
    <li
      className={`flex flex-col gap-1 border-l-2 px-2 py-1 transition-colors ${
        participant.isCurrent ? 'border-gold-bright bg-[rgba(212,166,76,0.06)]' : 'border-line'
      } ${down ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-narr text-sm">
          <span className="w-3 text-gold-bright">{participant.isCurrent ? '▶' : ''}</span>
          <span className={down ? 'line-through' : 'text-text'}>{participant.name}</span>
          <span className="text-[10px] uppercase tracking-[0.15em] text-text-mute">
            {KIND_LABEL[participant.kind]}
          </span>
        </span>
        <span className="font-display text-xs text-gold-bright">
          {down ? 'Abattu' : `${participant.currentHP}/${participant.maxHP}`}
        </span>
      </div>
      <div className="h-[5px] w-full bg-[rgba(0,0,0,0.5)]">
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: barColor,
          }}
        />
      </div>
      {participant.conditions.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {participant.conditions.map((c) => (
            <li
              key={c.type}
              className="rounded bg-[rgba(0,0,0,0.4)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-text-mute"
            >
              {c.type}
              {c.durationRounds !== undefined ? ` ·${c.durationRounds}r` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
