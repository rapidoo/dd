'use client';

import Link from 'next/link';

export interface SidebarItem {
  id: string;
  icon: string;
  label: string;
  href: string;
}

export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'session', icon: '✦', label: 'Veillée', href: '#session' },
  { id: 'sheet', icon: '⚜', label: 'Fiche', href: '#sheet' },
  { id: 'spells', icon: '❋', label: 'Sorts', href: '#spells' },
  { id: 'inventory', icon: '◈', label: 'Sac', href: '#inventory' },
  { id: 'team', icon: '◉', label: 'Équipe', href: '#team' },
  { id: 'journal', icon: '✧', label: 'Journal', href: '#journal' },
];

interface Props {
  current: string;
  items?: SidebarItem[];
  onNavigate?: (id: string) => void;
  homeHref?: string;
}

/** Left-side rail navigation — ported from session.html Sidebar. */
export function SessionSidebar({
  current,
  items = DEFAULT_SIDEBAR_ITEMS,
  onNavigate,
  homeHref = '/dashboard',
}: Props) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-[rgba(0,0,0,0.5)] py-5">
      <div
        className="campaign-fire mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-candle-glow to-gold font-display text-xl text-bg-deep"
        style={{ boxShadow: '0 0 24px rgba(240,176,80,0.56)' }}
      >
        ⚜
      </div>
      <div className="mb-2 h-px w-7 bg-line" />
      {items.map((item) => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate?.(item.id)}
            className={`flex w-14 flex-col items-center gap-0.5 rounded-lg border px-0 py-2.5 transition-colors ${
              active
                ? 'border-gold bg-gradient-to-br from-[rgba(212,166,76,0.19)] to-transparent text-gold-bright'
                : 'border-transparent text-text-mute hover:text-gold-bright'
            }`}
          >
            <span className="text-[19px] leading-none">{item.icon}</span>
            <span className="font-ui text-[9px] uppercase tracking-widest">{item.label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
      <Link
        href={homeHref}
        title="Retour à l'accueil"
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gold bg-gradient-to-br from-gold-bright to-gold-dim font-display text-base text-bg-deep"
      >
        E
      </Link>
    </nav>
  );
}
