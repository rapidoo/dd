'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';

import { BtnPrimary } from '../../../../../components/ui/button';
import { Stat } from '../../../../../components/ui/stat';
import type { CharacterRow, Universe } from '../../../../../lib/db/types';
import {
  emptyCurrency,
  getCoinLabel,
  getGoldFormula,
  getStartingKit,
  rollStartingGold,
} from '../../../../../lib/rules/character-onboarding';
import {
  type CharacterTemplate,
  getTemplatesForUniverse,
  getTemplatesIntro,
} from '../../../../../lib/rules/character-templates';
import { deriveCharacter } from '../../../../../lib/rules/derivations';
import type { Item } from '../../../../../lib/rules/equipment';
import { getStartingSpells, isSpellcaster, type Spell } from '../../../../../lib/rules/spells';
import {
  getClassesForUniverse,
  getClassOptions,
  getSpeciesOptions,
} from '../../../../../lib/rules/srd';
import type { AbilityScores } from '../../../../../lib/rules/types';
import type { ServerResult } from '../../../../../lib/server/campaigns';
import { createCharacter } from '../../../../../lib/server/characters';

const ABILITIES: Array<{ key: keyof AbilityScores; label: string }> = [
  { key: 'str', label: 'Force' },
  { key: 'dex', label: 'Dextérité' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Sagesse' },
  { key: 'cha', label: 'Charisme' },
];

const SKILL_LABELS: Record<string, string> = {
  acrobatics: 'Acrobaties',
  animalHandling: 'Dressage',
  arcana: 'Arcanes',
  athletics: 'Athlétisme',
  deception: 'Tromperie',
  history: 'Histoire',
  insight: 'Perspicacité',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Médecine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Représentation',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Escamotage',
  stealth: 'Discrétion',
  survival: 'Survie',
};

export function NewCharacterForm({
  campaignId,
  universe,
}: {
  campaignId: string;
  universe: Universe;
}) {
  const [state, formAction] = useActionState<ServerResult<CharacterRow> | null, FormData>(
    createCharacter,
    null,
  );
  // Memoize so identity is stable across renders — these are useEffect deps
  // below; recomputing on every render produced an infinite update loop.
  const classes = useMemo(() => getClassesForUniverse(universe), [universe]);
  const classOptions = useMemo(() => getClassOptions(universe), [universe]);
  const speciesOptions = useMemo(() => getSpeciesOptions(universe), [universe]);

  // Universe-driven templates (D&D / Witcher / Naheulbeuk).
  const templates = useMemo(() => getTemplatesForUniverse(universe), [universe]);
  const templatesIntro = useMemo(() => getTemplatesIntro(universe), [universe]);
  const [selectedTemplate, setSelectedTemplate] = useState<CharacterTemplate | null>(null);

  // Default to first available class and species for the universe
  const [classId, setClassId] = useState(classOptions[0]?.id ?? 'fighter');
  const [speciesId, setSpeciesId] = useState(speciesOptions[0]?.id ?? 'human');
  const [abilities, setAbilities] = useState<AbilityScores>({
    str: 15,
    dex: 14,
    con: 13,
    int: 12,
    wis: 10,
    cha: 8,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [background, setBackground] = useState('');
  const [personality, setPersonality] = useState('');
  const [alignment, setAlignment] = useState('');

  const classData = classes[classId];
  const availableSkills = useMemo(() => classData?.skillList ?? [], [classData]);
  const skillLimit = classData?.skillChoices ?? 2;

  // Onboarding tirage : or de départ + équipement de base. Indépendant des
  // templates : un template fournit le personnage, le tirage fournit la bourse.
  const goldFormula = useMemo(() => getGoldFormula(universe, classId), [universe, classId]);
  const startingKit = useMemo(() => getStartingKit(universe, classId), [universe, classId]);
  const startingSpells = useMemo(() => getStartingSpells(universe, classId), [universe, classId]);
  const isCaster = useMemo(() => isSpellcaster(universe, classId), [universe, classId]);
  const coinLabel = useMemo(() => getCoinLabel(universe), [universe]);
  const [rolledCurrency, setRolledCurrency] = useState(emptyCurrency());
  const [rolledDice, setRolledDice] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [rolled, setRolled] = useState(false);

  const handleRoll = () => {
    if (rolling || rolled) return;
    setRolling(true);
    // Animation : on affiche des dés aléatoires pendant ~600ms avant le résultat final.
    const ticks = 8;
    let i = 0;
    const interval = setInterval(() => {
      const fakeDice = Array.from({ length: rolledDice.length || 4 }, () =>
        Math.ceil(Math.random() * 6),
      );
      setRolledDice(fakeDice);
      i += 1;
      if (i >= ticks) {
        clearInterval(interval);
        const result = rollStartingGold(universe, classId);
        setRolledDice(result.dice);
        setRolledCurrency(result.currency);
        setRolling(false);
        setRolled(true);
      }
    }, 70);
  };

  // Reset le tirage quand l'univers ou la classe change (formule différente).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to formula changes
  useEffect(() => {
    setRolled(false);
    setRolledCurrency(emptyCurrency());
    setRolledDice([]);
  }, [universe, classId]);

  const totalGold = rolledCurrency.gp;

  // Reset selections when the universe changes (class/species lists differ).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to universe changes
  useEffect(() => {
    if (classOptions.length > 0 && classId && !classOptions.some((c) => c.id === classId)) {
      setClassId(classOptions[0]?.id ?? '');
    }
    if (speciesOptions.length > 0 && speciesId && !speciesOptions.some((s) => s.id === speciesId)) {
      setSpeciesId(speciesOptions[0]?.id ?? '');
    }
    setSkills([]);
    // Reset the selected template when switching universe — its species/class
    // ids may not exist in the new universe's option list.
    setSelectedTemplate(null);
  }, [universe]);

  // Apply a Witcher / Naheulbeuk template's stats/skills when selected.
  useEffect(() => {
    if (!selectedTemplate) return;
    // Template species/class can be either the SRD id ('human', 'rogue') or
    // the display name ('Humain', 'Roublard') depending on the template.
    // Match by id first, fall back to name (case-insensitive).
    const templateSpecies =
      speciesOptions.find((s) => s.id === selectedTemplate.species) ??
      speciesOptions.find((s) => s.name.toLowerCase() === selectedTemplate.species.toLowerCase());
    const templateClass =
      classOptions.find((c) => c.id === selectedTemplate.class) ??
      classOptions.find((c) => c.name.toLowerCase() === selectedTemplate.class.toLowerCase());
    if (templateSpecies) setSpeciesId(templateSpecies.id);
    if (templateClass) setClassId(templateClass.id);
    setName(selectedTemplate.name);
    setAbilities({
      str: selectedTemplate.abilities.str,
      dex: selectedTemplate.abilities.dex,
      con: selectedTemplate.abilities.con,
      int: selectedTemplate.abilities.int,
      wis: selectedTemplate.abilities.wis,
      cha: selectedTemplate.abilities.cha,
    });
    const templateSkills = selectedTemplate.proficiencies
      .filter((p) => availableSkills.includes(p))
      .slice(0, skillLimit);
    setSkills(templateSkills);
    // Pré-remplit historique (subclass) et personnalité (description) depuis
    // le modèle. Reste éditable — le joueur peut affiner.
    setBackground(selectedTemplate.subclass ?? '');
    setPersonality(selectedTemplate.description);
  }, [selectedTemplate, speciesOptions, classOptions, availableSkills, skillLimit]);

  const toggleSkill = (skill: string) => {
    setSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= skillLimit) return prev;
      return [...prev, skill];
    });
  };

  const preview = useMemo(() => {
    try {
      return deriveCharacter({
        universe,
        classId,
        speciesId,
        level: 1,
        abilityScores: abilities,
        skillProficiencies: skills,
      });
    } catch {
      return null;
    }
  }, [universe, classId, speciesId, abilities, skills]);

  const fieldError = (key: string) => {
    if (!state || state.ok) return null;
    const errs = state.fieldErrors?.[key];
    if (!errs || errs.length === 0) return null;
    return <p className="mt-1 text-xs text-blood">{errs[0]}</p>;
  };

  // Add hidden inputs for template data
  const templateHiddenInputs = selectedTemplate ? (
    <>
      <input type="hidden" name="templateId" value={selectedTemplate.id} />
      <input type="hidden" name="name" value={selectedTemplate.name} />
      <input type="hidden" name="level" value={selectedTemplate.level} />
      <input type="hidden" name="speciesId" value={speciesId} />
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="str" value={selectedTemplate.abilities.str} />
      <input type="hidden" name="dex" value={selectedTemplate.abilities.dex} />
      <input type="hidden" name="con" value={selectedTemplate.abilities.con} />
      <input type="hidden" name="int" value={selectedTemplate.abilities.int} />
      <input type="hidden" name="wis" value={selectedTemplate.abilities.wis} />
      <input type="hidden" name="cha" value={selectedTemplate.abilities.cha} />
      <input type="hidden" name="maxHP" value={selectedTemplate.max_hp} />
      <input type="hidden" name="ac" value={selectedTemplate.ac} />
      <input type="hidden" name="speed" value={selectedTemplate.speed} />
      {selectedTemplate.proficiencies.map((p) => (
        <input key={`prof-${p}`} type="hidden" name="proficiencies" value={p} />
      ))}
      {selectedTemplate.features.map((f) => (
        <input key={`feat-${f.name}`} type="hidden" name="features" value={JSON.stringify(f)} />
      ))}
      {skills.map((s) => (
        <input key={`skill-${s}`} type="hidden" name="skillProficiencies" value={s} />
      ))}
    </>
  ) : null;

  // Equipement + currency : indépendants du template, viennent du tirage.
  const kitHiddenInputs = (
    <>
      <input type="hidden" name="currency" value={JSON.stringify(rolledCurrency)} />
      {startingKit.map((item: Item) => (
        <input
          key={`kit-${item.name}-${item.type}`}
          type="hidden"
          name="inventory"
          value={JSON.stringify(item)}
        />
      ))}
      {startingSpells.map((spell: Spell) => (
        <input
          key={`spell-${spell.id}`}
          type="hidden"
          name="spells"
          value={JSON.stringify(spell)}
        />
      ))}
    </>
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="level" value={selectedTemplate ? selectedTemplate.level : 1} />
      {skills.map((s) => (
        <input key={s} type="hidden" name="skillProficiencies" value={s} />
      ))}
      {templateHiddenInputs}
      {kitHiddenInputs}

      {/* Universe-driven character templates (D&D / Witcher / Naheulbeuk). */}
      {templates.length > 0 && (
        <section className="border border-line bg-card p-4">
          <p className="mb-2 font-display text-sm uppercase tracking-[0.3em] text-gold">
            {templatesIntro.title}
          </p>
          <p className="mb-3 text-xs text-text-mute">{templatesIntro.subtitle}</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(isSelected ? null : template)}
                  className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-gold bg-[rgba(212,166,76,0.1)]'
                      : 'border-line bg-transparent hover:border-gold'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-narr text-lg font-bold text-gold-bright">
                      {template.name}
                    </span>
                    <span className="text-xs text-text-mute">Niv. {template.level}</span>
                  </div>
                  <p className="text-xs text-text-mute line-clamp-2">{template.description}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded bg-[rgba(0,0,0,0.4)] px-2 py-1 text-text-faint">
                      {template.species}
                    </span>
                    <span className="rounded bg-[rgba(0,0,0,0.4)] px-2 py-1 text-text-faint">
                      {template.class}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedTemplate && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-text-mute">
                Modèle sélectionné :{' '}
                <span className="font-bold text-gold">{selectedTemplate.name}</span>
              </p>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-sm text-text-mute hover:text-gold transition-colors"
              >
                Annuler
              </button>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Nom
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            value={name}
            disabled={!!selectedTemplate}
            onChange={(e) => setName(e.target.value)}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-lg text-text outline-none focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={selectedTemplate ? '' : 'Elspeth Courtecire'}
          />
          {fieldError('name')}
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Alignement
          <input
            type="text"
            name="alignment"
            maxLength={40}
            value={alignment}
            onChange={(e) => setAlignment(e.target.value)}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
            placeholder="Neutre bon"
          />
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Espèce
          <select
            name="speciesId"
            value={speciesId}
            onChange={(e) => setSpeciesId(e.target.value)}
            disabled={!!selectedTemplate}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {speciesOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Classe
          <select
            name="classId"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSkills([]);
            }}
            disabled={!!selectedTemplate}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-mute">
          Caractéristiques (1–30)
        </p>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {ABILITIES.map(({ key, label }) => (
            <label
              key={key}
              className="flex flex-col items-center gap-1 border border-line bg-card p-3"
            >
              <span className="font-display text-[10px] uppercase tracking-[0.2em] text-gold">
                {label}
              </span>
              <input
                type="number"
                min={1}
                max={30}
                name={key}
                value={abilities[key]}
                onChange={(e) =>
                  setAbilities((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
                disabled={!!selectedTemplate}
                className="w-14 rounded-none border-0 bg-transparent text-center font-narr text-2xl text-gold-bright outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-mute">
          Compétences — {skills.length} / {skillLimit} choisies
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          {availableSkills.map((s) => {
            const selected = skills.includes(s);
            const full = skills.length >= skillLimit && !selected;
            return (
              <button
                key={s}
                type="button"
                disabled={full || !!selectedTemplate}
                onClick={() => toggleSkill(s)}
                className={`border px-3 py-2 text-left font-narr text-sm transition-colors ${
                  selected
                    ? 'border-gold bg-[rgba(212,166,76,0.1)] text-gold-bright'
                    : full || selectedTemplate
                      ? 'border-line text-text-faint'
                      : 'border-line text-text hover:border-gold'
                }`}
              >
                {SKILL_LABELS[s] ?? s}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Historique
          <input
            type="text"
            name="background"
            maxLength={80}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
            placeholder="Ermite, soldat, noble…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          Personnalité (traits, idéaux, liens, défauts)
          <textarea
            name="personality"
            rows={3}
            maxLength={1000}
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
          />
        </label>
      </section>

      <section className="border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm uppercase tracking-[0.3em] text-gold">
              ⚂ Tirage initial
            </p>
            <p className="mt-1 text-xs text-text-mute">
              Or de départ : {goldFormula.dice}
              {goldFormula.multiplier !== 1 ? ` × ${goldFormula.multiplier}` : ''} {coinLabel}
            </p>
          </div>
          {!rolled && (
            <button
              type="button"
              onClick={handleRoll}
              disabled={rolling}
              className={`px-4 py-2 border font-display text-xs uppercase tracking-[0.2em] transition-all ${
                rolling
                  ? 'border-line text-text-faint cursor-wait'
                  : 'border-gold text-gold-bright hover:bg-[rgba(212,166,76,0.12)]'
              }`}
            >
              {rolling ? '⚂ ⚂ ⚂' : '⚂ Lancer les dés'}
            </button>
          )}
          {rolled && (
            <span className="font-display text-xs uppercase tracking-[0.2em] text-gold">
              ✓ tiré
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-line bg-[rgba(0,0,0,0.4)] p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-mute">Or de départ</p>
            <div className="flex items-center gap-2">
              {rolledDice.length > 0 ? (
                rolledDice.map((d, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: dice values are interchangeable; index is intentional
                    key={`die-${i}-${d}`}
                    className={`inline-flex h-9 w-9 items-center justify-center border font-display text-lg ${
                      rolling
                        ? 'border-line text-text-mute'
                        : 'border-gold text-gold-bright bg-[rgba(212,166,76,0.08)]'
                    }`}
                  >
                    {d}
                  </span>
                ))
              ) : (
                <span className="text-sm text-text-faint italic">— pas encore tiré —</span>
              )}
            </div>
            {rolled && (
              <p className="mt-3 font-narr text-2xl text-gold-bright">
                {totalGold} {coinLabel}
              </p>
            )}
          </div>

          <div className="border border-line bg-[rgba(0,0,0,0.4)] p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-mute">
              Équipement de base ({startingKit.length})
            </p>
            <ul className="space-y-1 text-sm">
              {startingKit.map((item: Item) => (
                <li key={`disp-${item.name}-${item.type}`} className="flex justify-between gap-2">
                  <span className="text-text">
                    {item.name}
                    {item.count && item.count > 1 ? ` ×${item.count}` : ''}
                  </span>
                  {item.damage && (
                    <span className="font-narr text-xs text-text-mute">{item.damage}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {isCaster && (
        <section className="border border-line bg-card p-5">
          <p className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">
            ✦ Sorts de départ ({startingSpells.length})
          </p>
          <p className="mb-3 text-xs text-text-mute">
            Liste apprise au niveau 1 pour cette classe. Les emplacements de sort sont calculés
            automatiquement.
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {startingSpells.map((spell: Spell) => (
              <li
                key={`spell-disp-${spell.id}`}
                className="border border-line bg-[rgba(0,0,0,0.4)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-narr text-base text-gold-bright">{spell.name}</span>
                  <span className="font-display text-[10px] uppercase tracking-[0.2em] text-text-mute">
                    {spell.level === 0 ? 'Cantrip' : `Niv. ${spell.level}`}
                    {spell.school ? ` · ${spell.school}` : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-mute">{spell.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview && (
        <section className="border border-line bg-card p-5">
          <p className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">
            ✧ Aperçu (calculé côté serveur à la création)
          </p>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="PV max" value={preview.maxHP} />
            <Stat label="CA" value={preview.ac} />
            <Stat label="Bonus de maîtrise" value={`+${preview.proficiencyBonus}`} />
            <Stat
              label="Initiative"
              value={preview.initiative >= 0 ? `+${preview.initiative}` : `${preview.initiative}`}
            />
            {preview.spellSaveDC !== null && <Stat label="DD sort" value={preview.spellSaveDC} />}
            {preview.spellAttackBonus !== null && (
              <Stat
                label="Attaque de sort"
                value={
                  preview.spellAttackBonus >= 0
                    ? `+${preview.spellAttackBonus}`
                    : `${preview.spellAttackBonus}`
                }
              />
            )}
            <Stat label="Perception passive" value={preview.passivePerception} />
            <Stat label="Vitesse" value={`${preview.speed} m`} />
          </div>
        </section>
      )}

      {state && !state.ok && !state.fieldErrors && (
        <p className="text-sm text-blood">{state.error}</p>
      )}

      <div className="flex flex-col items-end gap-2">
        {!rolled && (
          <p className="text-xs text-blood">⚂ Lance les dés avant de forger le personnage.</p>
        )}
        <BtnPrimary icon="⚜" type="submit" disabled={!rolled}>
          Forger le personnage
        </BtnPrimary>
      </div>
    </form>
  );
}
