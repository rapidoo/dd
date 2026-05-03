import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/db/server';
import type { CharacterRow } from '../../../../lib/db/types';
import { getClassesForUniverse, getSpeciesForUniverse } from '../../../../lib/rules/srd';
import { requireUser } from '../../../../lib/server/auth';
import { getCampaign } from '../../../../lib/server/campaigns';
import { TeamForm } from './team-form';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', id)
    .eq('is_ai', true)
    .order('created_at', { ascending: true });
  const companions = (data ?? []) as CharacterRow[];

  const universe = campaign.universe ?? 'dnd5e';
  const speciesData = getSpeciesForUniverse(universe);
  const classesData = getClassesForUniverse(universe);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-text">
      <Link
        href={`/campaigns/${id}`}
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour à la campagne
      </Link>
      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Autour du feu</p>
        <h1 className="font-narr text-4xl text-gold-bright">Ton équipe</h1>
        <p className="mt-2 max-w-xl text-sm text-text-mute">
          Les compagnons IA parlent avec leur propre voix et réagissent à la scène via Claude
          Sonnet. Donne-leur une personnalité forte ; le MJ les convoquera quand il le juge bon.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {companions.length === 0 && (
          <p className="col-span-full font-narr italic text-text-mute">
            Aucun compagnon pour l'instant.
          </p>
        )}
        {companions.map((c) => (
          <article key={c.id} className="border border-line bg-card p-5">
            <p className="font-display text-xs uppercase tracking-[0.25em] text-gold">
              {speciesData[c.species]?.name ?? c.species} · {classesData[c.class]?.name ?? c.class}{' '}
              {c.level}
            </p>
            <h2 className="mt-1 font-narr text-2xl text-gold-bright">{c.name}</h2>
            {typeof c.persona === 'object' && c.persona && 'notes' in c.persona ? (
              <p className="mt-2 font-narr text-sm italic text-text-mid">
                {String((c.persona as { notes?: unknown }).notes ?? '')}
              </p>
            ) : null}
            <p className="mt-3 text-[10px] uppercase tracking-widest text-text-faint">
              PV {c.current_hp}/{c.max_hp} · CA {c.ac}
            </p>
          </article>
        ))}
      </section>

      <section className="border border-line bg-card p-6">
        <h2 className="mb-4 font-display text-sm uppercase tracking-[0.3em] text-gold">
          ✦ Recruter un compagnon
        </h2>
        <TeamForm campaignId={id} universe={campaign.universe ?? 'dnd5e'} />
      </section>
    </main>
  );
}
