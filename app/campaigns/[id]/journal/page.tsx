import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/db/server';
import { requireUser } from '../../../../lib/server/auth';
import { getCampaign } from '../../../../lib/server/campaigns';
import { getCampaignCodex } from '../../../../lib/server/codex';

const KIND_LABEL: Record<string, string> = {
  npc: 'PNJ',
  location: 'Lieu',
  faction: 'Faction',
  item: 'Objet',
  quest: 'Quête',
  event: 'Événement',
};

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: sessions }, codex] = await Promise.all([
    supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', id)
      .order('session_number', { ascending: false }),
    getCampaignCodex(id),
  ]);
  const entities = codex.ok ? codex.entities : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-12 text-text">
      <Link
        href={`/campaigns/${id}`}
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour à la campagne
      </Link>

      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Chronique</p>
        <h1 className="font-narr text-4xl text-gold-bright">{campaign.name}</h1>
      </header>

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">
          ✦ Sessions
        </h2>
        {sessions && sessions.length > 0 ? (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="border border-line bg-card p-4">
                <p className="font-display text-xs uppercase tracking-widest text-gold">
                  Session {s.session_number}
                </p>
                <p className="font-narr text-lg text-gold-bright">{s.title ?? 'Sans titre'}</p>
                {s.summary && (
                  <p className="mt-1 font-narr text-sm italic text-text-mid">{s.summary}</p>
                )}
                <p className="mt-2 text-[10px] uppercase tracking-widest text-text-faint">
                  {new Date(s.started_at).toLocaleString('fr-FR')}
                  {s.ended_at && ` · terminée ${new Date(s.ended_at).toLocaleString('fr-FR')}`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-narr italic text-text-mute">Aucune session pour l'instant.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">✧ Codex</h2>
        {!codex.ok ? (
          <p className="font-narr italic text-red-400/80">
            Mémoire de campagne indisponible — {codex.error ?? 'erreur inconnue'}
          </p>
        ) : entities.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {entities.map((e) => (
              <article key={e.id} className="border border-line bg-card p-4">
                <p className="font-display text-[10px] uppercase tracking-widest text-gold">
                  {KIND_LABEL[e.kind] ?? e.kind}
                </p>
                <p className="font-narr text-lg text-gold-bright">{e.name}</p>
                {e.short_description && (
                  <p className="mt-1 font-narr text-sm italic text-text-mid">
                    {e.short_description}
                  </p>
                )}
                {e.sessions.length > 0 && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-faint">
                    Session{e.sessions.length > 1 ? 's' : ''}{' '}
                    {e.sessions
                      .slice()
                      .sort((a, b) => a - b)
                      .join(', ')}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="font-narr italic text-text-mute">
            Le MJ n'a encore rien inscrit dans la chronique.
          </p>
        )}
      </section>
    </main>
  );
}
