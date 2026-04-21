import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SlotRow, Stat } from '../../../../components/ui/stat';
import { createSupabaseServerClient } from '../../../../lib/db/server';
import type { CharacterRow } from '../../../../lib/db/types';
import { getAbilityModifier } from '../../../../lib/rules/abilities';
import { proficiencyBonus } from '../../../../lib/rules/proficiency';
import { CLASSES, SPECIES } from '../../../../lib/rules/srd';
import { requireUser } from '../../../../lib/server/auth';
import { getCampaign } from '../../../../lib/server/campaigns';
import { HPControls } from './hp-controls';

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', id)
    .eq('is_ai', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<CharacterRow>();
  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-text">
        <p className="font-narr italic text-text-mute">
          Pas encore de personnage joueur dans cette campagne.
        </p>
        <Link href={`/campaigns/${id}/characters/new`} className="text-gold underline">
          Créer un personnage →
        </Link>
      </main>
    );
  }
  const character = data;
  const species = SPECIES[character.species]?.name ?? character.species;
  const className = CLASSES[character.class]?.name ?? character.class;
  const prof = proficiencyBonus(character.level);
  const abilities: Array<[string, number]> = [
    ['FOR', character.str],
    ['DEX', character.dex],
    ['CON', character.con],
    ['INT', character.int_score],
    ['SAG', character.wis],
    ['CHA', character.cha],
  ];
  const slots = character.spell_slots ?? {};

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-text">
      <Link
        href={`/campaigns/${id}`}
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour à la campagne
      </Link>
      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">
          {species} · {className} {character.level}
        </p>
        <h1 className="font-narr text-4xl text-gold-bright">{character.name}</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="border border-line bg-card p-5">
          <Stat
            label="Points de vie"
            value={`${character.current_hp} / ${character.max_hp}`}
            pct={Math.round((character.current_hp / Math.max(1, character.max_hp)) * 100)}
            barColor="linear-gradient(90deg, #5a1810, #9a3028)"
          />
          <HPControls characterId={character.id} />
        </div>
        <div className="border border-line bg-card p-5">
          <Stat label="Classe d'armure" value={character.ac} />
          <Stat label="Vitesse" value={`${character.speed} m`} />
          <Stat label="Initiative" value={formatMod(getAbilityModifier(character.dex))} />
          <Stat label="Bonus de maîtrise" value={`+${prof}`} />
        </div>
        <div className="border border-line bg-card p-5">
          <p className="mb-2 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
            Caractéristiques
          </p>
          <div className="grid grid-cols-3 gap-2">
            {abilities.map(([label, score]) => (
              <div key={label} className="flex flex-col items-center border border-line p-2">
                <span className="text-[9px] uppercase tracking-widest text-text-mute">{label}</span>
                <span className="font-narr text-xl text-gold-bright">{score}</span>
                <span className="font-mono text-[10px] text-text-mute">
                  {formatMod(getAbilityModifier(score))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {Object.keys(slots).length > 0 && (
        <section className="border border-line bg-card p-5">
          <p className="mb-2 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
            ✧ Emplacements de sorts
          </p>
          {Object.entries(slots)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([lvl, s]) => (
              <SlotRow key={lvl} level={lvl} have={s.max - s.used} total={s.max} />
            ))}
        </section>
      )}
    </main>
  );
}

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
