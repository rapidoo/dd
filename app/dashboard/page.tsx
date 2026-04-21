import Link from 'next/link';
import { BtnPrimary } from '../../components/ui/button';
import { createSupabaseServerClient } from '../../lib/db/server';
import type { ProfileRow } from '../../lib/db/types';
import { requireUser, signOut } from '../../lib/server/auth';
import { listCampaigns } from '../../lib/server/campaigns';

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle<Pick<ProfileRow, 'display_name' | 'avatar_url'>>();

  const campaignsResult = await listCampaigns();
  const campaigns = campaignsResult.ok ? campaignsResult.data : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12 text-text">
      <header className="flex items-end justify-between">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">
            Au coin du feu
          </p>
          <h1 className="font-narr text-4xl text-gold-bright">
            Bonjour {profile?.display_name ?? user.email}
          </h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-none border border-line px-3 py-2 text-xs uppercase tracking-[0.15em] text-text-mute hover:text-gold-bright"
          >
            Quitter la veillée
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-[0.3em] text-gold">
            ✧ Tes campagnes
          </h2>
          <Link href="/campaigns/new">
            <BtnPrimary icon="✦">Nouvelle campagne</BtnPrimary>
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-line bg-card p-8 text-center">
            <p className="font-narr text-lg italic text-text-mute">
              Aucun feu n'est encore allumé.
            </p>
            <p className="mt-2 text-sm text-text-faint">
              Crée ta première campagne pour convoquer un MJ et des compagnons.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/campaigns/${c.id}`}
                  className="block border border-line bg-card p-5 transition-colors hover:border-gold"
                >
                  <p className="font-display text-[10px] uppercase tracking-[0.3em] text-gold">
                    {modeLabel(c.setting_mode)}
                  </p>
                  <h3 className="mt-1 font-narr text-2xl text-gold-bright">{c.name}</h3>
                  {c.setting_pitch && (
                    <p className="mt-2 line-clamp-2 font-narr text-sm text-text-mid">
                      {c.setting_pitch}
                    </p>
                  )}
                  <p className="mt-3 text-[10px] uppercase tracking-widest text-text-faint">
                    {c.status}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function modeLabel(mode: 'homebrew' | 'module' | 'generated'): string {
  return mode === 'homebrew'
    ? 'Monde libre'
    : mode === 'module'
      ? 'Module pré-écrit'
      : 'Monde généré';
}
