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

export default async function SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ character?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { character: selectedId } = await searchParams;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', id)
    .order('is_ai', { ascending: true })
    .order('created_at', { ascending: true });
  const characters = (data ?? []) as CharacterRow[];

  if (characters.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-text">
        <p className="font-narr italic text-text-mute">
          Pas encore de personnage dans cette campagne.
        </p>
        <Link href={`/campaigns/${id}/characters/new`} className="text-gold underline">
          Créer un personnage →
        </Link>
      </main>
    );
  }

  const character =
    (selectedId && characters.find((c) => c.id === selectedId)) ||
    characters.find((c) => !c.is_ai) ||
    characters[0];
  if (!character) notFound();

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
  const persona =
    typeof character.persona === 'object' && character.persona && 'notes' in character.persona
      ? String((character.persona as { notes?: unknown }).notes ?? '')
      : '';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-text">
      <Link
        href={`/campaigns/${id}`}
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour à la campagne
      </Link>

      <section className="flex flex-wrap items-center gap-2">
        {characters.map((c) => {
          const active = c.id === character.id;
          return (
            <Link
              key={c.id}
              href={`/campaigns/${id}/sheet?character=${c.id}`}
              className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition-colors ${
                active
                  ? 'border-gold bg-[rgba(212,166,76,0.12)] text-gold-bright'
                  : 'border-line text-text-mute hover:border-gold/60 hover:text-text'
              }`}
            >
              <span>{c.is_ai ? '◉' : '⚜'}</span>
              <span className="font-display">{c.name}</span>
              <span className="text-text-faint">· {c.is_ai ? 'allié' : 'joueur'}</span>
            </Link>
          );
        })}
      </section>

      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">
          {species} · {className} {character.level}
          {character.is_ai && <span className="ml-2 text-text-mute">· compagnon IA</span>}
        </p>
        <h1 className="font-narr text-4xl text-gold-bright">{character.name}</h1>
        {persona && (
          <p className="mt-2 max-w-2xl font-narr text-base italic text-text-mid">{persona}</p>
        )}
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
