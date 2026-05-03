import type { ReactNode } from 'react';

export interface MessageProps {
  author: {
    kind: 'gm' | 'user' | 'companion' | 'npc' | 'system';
    name: string;
    color?: string;
    glyph?: string;
  };
  text: ReactNode;
  time?: string;
  /** Flavor: plain narration, emoted action (italic), out-of-character aside. */
  mode?: 'narration' | 'action' | 'speech' | 'aside' | 'prompt';
}

/** Ported from session.html Msg. */
export function Message({ author, text, time, mode = 'narration' }: MessageProps) {
  const isUser = author.kind === 'user';
  const accent = author.color ?? 'var(--color-gold)';

  const textClasses =
    mode === 'action'
      ? 'italic'
      : mode === 'aside'
        ? 'italic text-text-mute'
        : mode === 'prompt'
          ? 'font-display text-gold-bright'
          : '';

  return (
    <article className="msg-enter mb-6 flex gap-3">
      {!isUser && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] font-display text-sm text-bg-deep"
          style={{
            background: `radial-gradient(circle, ${accent}, ${accent}88)`,
            borderColor: accent,
          }}
          aria-hidden
        >
          {author.glyph ?? '◆'}
        </div>
      )}
      <div className="flex-1">
        {!isUser && (
          <header className="mb-0.5 flex items-baseline gap-2">
            <span className="font-display text-[13px] text-text-mid">{author.name}</span>
            {time && <span className="font-mono text-[10px] text-text-faint">{time}</span>}
          </header>
        )}
        <p className={`whitespace-pre-wrap font-narr text-base leading-relaxed ${textClasses}`}>
          {text}
        </p>
      </div>
      {isUser && (
        <time className="shrink-0 pt-1 font-mono text-[10px] text-text-faint">{time}</time>
      )}
    </article>
  );
}

export function TypingIndicator({ who }: { who: string }) {
  return (
    <div className="msg-enter flex items-center gap-2 pb-4 font-ui text-[11px] tracking-wide text-text-mute">
      <span>{who} écrit</span>
      <span className="typing-dot">·</span>
      <span className="typing-dot">·</span>
      <span className="typing-dot">·</span>
    </div>
  );
}
