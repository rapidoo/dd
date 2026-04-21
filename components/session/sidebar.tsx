import Link from 'next/link';

export interface SidebarItem {
  id: string;
  icon: string;
  label: string;
  path: string;
}

export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'session', icon: '✦', label: 'Veillée', path: '/play' },
  { id: 'sheet', icon: '⚜', label: 'Fiche', path: '/sheet' },
  { id: 'team', icon: '◉', label: 'Équipe', path: '/team' },
  { id: 'journal', icon: '✧', label: 'Journal', path: '/journal' },
];

interface Props {
  campaignId: string;
  current: string;
  items?: SidebarItem[];
}

/** Left-side rail navigation — ported from session.html Sidebar. */
export function SessionSidebar({ campaignId, current, items = DEFAULT_SIDEBAR_ITEMS }: Props) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-[rgba(0,0,0,0.5)] py-5">
      <Link
        href={`/campaigns/${campaignId}`}
        title="Retour au foyer de la campagne"
        className="campaign-fire mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-candle-glow to-gold font-display text-xl text-bg-deep"
        style={{ boxShadow: '0 0 24px rgba(240,176,80,0.56)' }}
      >
        ⚜
      </Link>
      <div className="mb-2 h-px w-7 bg-line" />
      {items.map((item) => {
        const active = current === item.id;
        const href = `/campaigns/${campaignId}${item.path}`;
        return (
          <Link
            key={item.id}
            href={href}
            className={`flex w-14 flex-col items-center gap-0.5 rounded-lg border px-0 py-2.5 transition-colors ${
              active
                ? 'border-gold bg-gradient-to-br from-[rgba(212,166,76,0.19)] to-transparent text-gold-bright'
                : 'border-transparent text-text-mute hover:border-line hover:text-gold-bright'
            }`}
          >
            <span className="text-[19px] leading-none">{item.icon}</span>
            <span className="font-ui text-[9px] uppercase tracking-widest">{item.label}</span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link
        href="/dashboard"
        title="Quitter la veillée — retour au foyer"
        className="flex w-14 flex-col items-center gap-0.5 rounded-lg border border-transparent px-0 py-2.5 text-text-mute transition-colors hover:border-line hover:text-gold-bright"
      >
        <span className="text-[19px] leading-none">⌂</span>
        <span className="font-ui text-[9px] uppercase tracking-widest">Sortir</span>
      </Link>
    </nav>
  );
}
