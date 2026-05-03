import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BtnPrimary } from '../../../components/ui/button';
import { Stat } from '../../../components/ui/stat';
import { createSupabaseServerClient } from '../../../lib/db/server';
import type { CharacterRow, SessionRow, Universe } from '../../../lib/db/types';
import { getModuleTemplate } from '../../../lib/modules/templates';
import {
  CLASSES,
  getClassesForUniverse,
  getSpeciesForUniverse,
  SPECIES,
} from '../../../lib/rules/srd';
import { requireUser } from '../../../lib/server/auth';
import { getCampaign } from '../../../lib/server/campaigns';

type Params = { id: string };

export default async function CampaignPage({ params }: { params: Promise<Params> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const supabase = await createSupabaseServerClient();
  const [charactersResult, sessionsResult] = await Promise.all([
    supabase
      .from('characters')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', id)
      .order('session_number', { ascending: false })
      .limit(5),
  ]);
  const characters = (charactersResult.data ?? []) as CharacterRow[];
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const players = characters.filter((c) => !c.is_ai);
  const companions = characters.filter((c) => c.is_ai);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-12 text-text">
      <Link
        href="/dashboard"
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour au foyer
      </Link>

      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Campagne</p>
        <h1 className="font-narr text-4xl text-gold-bright">{campaign.name}</h1>
        {campaign.setting_pitch && (
          <p className="mt-3 max-w-2xl font-narr text-base italic text-text-mid">
            {campaign.setting_pitch}
          </p>
        )}
        {campaign.module_id &&
          (() => {
            const module_ = getModuleTemplate(campaign.module_id);
            if (!module_) return null;
            return (
              <div className="mt-4 inline-flex flex-wrap items-center gap-2 border border-line bg-card px-3 py-2 text-[11px] uppercase tracking-widest text-text-mute">
                <span className="font-display text-gold">Module · {module_.title}</span>
                <span className="text-text-faint">·</span>
                <span>niv. {module_.levelRange}</span>
                <span className="text-text-faint">·</span>
                <span>{module_.difficulty}</span>
                <span className="text-text-faint">·</span>
                <span>{module_.sessionsEstimate}</span>
              </div>
            );
          })()}
      </header>

      <section className="flex flex-wrap gap-3">
        <Link href={`/campaigns/${campaign.id}/play`}>
          <BtnPrimary icon="✦">Veiller au coin du feu</BtnPrimary>
        </Link>
        <Link href={`/campaigns/${campaign.id}/characters/new`}>
          <BtnPrimary icon="⚜">Créer un personnage</BtnPrimary>
        </Link>
        <Link href={`/campaigns/${campaign.id}/team`}>
          <BtnPrimary icon="◉">Équipe</BtnPrimary>
        </Link>
        <Link href={`/campaigns/${campaign.id}/sheet`}>
          <BtnPrimary icon="⚜">Fiche</BtnPrimary>
        </Link>
        <Link href={`/campaigns/${campaign.id}/journal`}>
          <BtnPrimary icon="✧">Journal</BtnPrimary>
        </Link>
      </section>

      <CharactersSection
        title="✧ Tes personnages"
        empty="Aucun joueur pour l'instant."
        list={players}
        universe={campaign.universe ?? 'dnd5e'}
      />
      <CharactersSection
        title="◉ Compagnons"
        empty="Pas encore de compagnon autour du feu."
        list={companions}
        universe={campaign.universe ?? 'dnd5e'}
      />

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">
          ✦ Dernières sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="font-narr italic text-text-mute">Aucune session commencée.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-baseline justify-between border border-line bg-card px-4 py-3"
              >
                <div>
                  <span className="font-display text-[10px] uppercase tracking-widest text-gold">
                    Session {s.session_number}
                  </span>
                  <p className="font-narr text-base text-gold-bright">
                    {s.title ?? (s.ended_at ? 'Session terminée' : 'Session en cours')}
                  </p>
                </div>
                <time className="font-mono text-[10px] text-text-faint">
                  {new Date(s.started_at).toLocaleDateString('fr-FR')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CharactersSection({
  title,
  empty,
  list,
  universe,
}: {
  title: string;
  empty: string;
  list: CharacterRow[];
  universe: Universe;
}) {
  const classes = getClassesForUniverse(universe);
  const species = getSpeciesForUniverse(universe);

  return (
    <section>
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">{title}</h2>
      {list.length === 0 ? (
        <p className="font-narr italic text-text-mute">{empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => (
            <article key={c.id} className="border border-line bg-card p-4">
              <p className="font-display text-[10px] uppercase tracking-[0.25em] text-gold">
                {species[c.species]?.name ?? c.species} · {classes[c.class]?.name ?? c.class}{' '}
                {c.level}
              </p>
              <h3 className="mt-1 font-narr text-2xl text-gold-bright">{c.name}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat
                  label="PV"
                  value={`${c.current_hp} / ${c.max_hp}`}
                  pct={Math.round((c.current_hp / Math.max(1, c.max_hp)) * 100)}
                  barColor="linear-gradient(90deg, #5a1810, #9a3028)"
                />
                <Stat label="CA" value={c.ac} />
                <Stat label="Vitesse" value={`${c.speed} m`} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
