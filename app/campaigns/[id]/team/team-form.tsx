'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { BtnPrimary } from '../../../../components/ui/button';
import type { CharacterRow, Universe } from '../../../../lib/db/types';
import {
  emptyCurrency,
  getCoinLabel,
  getGoldFormula,
  getStartingKit,
  rollStartingGold,
} from '../../../../lib/rules/character-onboarding';
import {
  type CharacterTemplate,
  getTemplatesForUniverse,
  getTemplatesIntro,
} from '../../../../lib/rules/character-templates';
import type { Item } from '../../../../lib/rules/equipment';
import { getStartingSpells, isSpellcaster, type Spell } from '../../../../lib/rules/spells';
import { getClassOptions, getSpeciesOptions } from '../../../../lib/rules/srd';
import type { ServerResult } from '../../../../lib/server/campaigns';
import { createCompanion } from '../../../../lib/server/companions';
import { suggestName, suggestPersona } from '../../../../lib/server/persona-suggest';

export function TeamForm({ campaignId, universe }: { campaignId: string; universe: Universe }) {
  const [state, formAction] = useActionState<ServerResult<CharacterRow> | null, FormData>(
    createCompanion,
    null,
  );
  const classOptions = useMemo(() => getClassOptions(universe), [universe]);
  const speciesOptions = useMemo(() => getSpeciesOptions(universe), [universe]);
  const templates = useMemo(() => getTemplatesForUniverse(universe), [universe]);
  const templatesIntro = useMemo(() => getTemplatesIntro(universe), [universe]);

  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState(speciesOptions[0]?.id ?? 'dwarf');
  const [classId, setClassId] = useState(classOptions[0]?.id ?? 'fighter');
  const [persona, setPersona] = useState('');
  const [suggestPending, startSuggest] = useTransition();
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [namePending, startName] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CharacterTemplate | null>(null);

  // Onboarding tirage : or de départ + équipement de base. Identique au PJ.
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to formula changes
  useEffect(() => {
    setRolled(false);
    setRolledCurrency(emptyCurrency());
    setRolledDice([]);
  }, [universe, classId]);

  // Apply a template's stats / species / class / name / description as
  // persona seed when selected. The user can still tweak the persona text.
  useEffect(() => {
    if (!selectedTemplate) return;
    const templateSpecies =
      speciesOptions.find((s) => s.id === selectedTemplate.species) ??
      speciesOptions.find((s) => s.name.toLowerCase() === selectedTemplate.species.toLowerCase());
    const templateClass =
      classOptions.find((c) => c.id === selectedTemplate.class) ??
      classOptions.find((c) => c.name.toLowerCase() === selectedTemplate.class.toLowerCase());
    if (templateSpecies) setSpeciesId(templateSpecies.id);
    if (templateClass) setClassId(templateClass.id);
    setName(selectedTemplate.name);
    setPersona(selectedTemplate.description);
  }, [selectedTemplate, speciesOptions, classOptions]);

  const askSuggestion = () => {
    setSuggestError(null);
    startSuggest(async () => {
      const res = await suggestPersona({ speciesId, classId, name: name || undefined });
      if (res.ok && res.text) setPersona(res.text);
      else setSuggestError(res.error ?? 'Échec');
    });
  };

  const askName = () => {
    setNameError(null);
    startName(async () => {
      const res = await suggestName({ speciesId, classId });
      if (res.ok && res.text) setName(res.text);
      else setNameError(res.error ?? 'Échec');
    });
  };

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="campaignId" value={campaignId} />
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

      {selectedTemplate && (
        <>
          <input type="hidden" name="templateId" value={selectedTemplate.id} />
          <input type="hidden" name="level" value={selectedTemplate.level} />
          <input type="hidden" name="str" value={selectedTemplate.abilities.str} />
          <input type="hidden" name="dex" value={selectedTemplate.abilities.dex} />
          <input type="hidden" name="con" value={selectedTemplate.abilities.con} />
          <input type="hidden" name="int" value={selectedTemplate.abilities.int} />
          <input type="hidden" name="wis" value={selectedTemplate.abilities.wis} />
          <input type="hidden" name="cha" value={selectedTemplate.abilities.cha} />
        </>
      )}

      {templates.length > 0 && (
        <section className="md:col-span-2 border border-line bg-card p-4">
          <p className="mb-2 font-display text-sm uppercase tracking-[0.3em] text-gold">
            {templatesIntro.title}
          </p>
          <p className="mb-3 text-xs text-text-mute">{templatesIntro.subtitle}</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const isSelected = selectedTemplate?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplate(isSelected ? null : t)}
                  className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-gold bg-[rgba(212,166,76,0.1)]'
                      : 'border-line bg-transparent hover:border-gold'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-narr text-lg font-bold text-gold-bright">{t.name}</span>
                    <span className="text-xs text-text-mute">Niv. {t.level}</span>
                  </div>
                  <p className="text-xs text-text-mute line-clamp-2">{t.description}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded bg-[rgba(0,0,0,0.4)] px-2 py-1 text-text-faint">
                      {t.species}
                    </span>
                    <span className="rounded bg-[rgba(0,0,0,0.4)] px-2 py-1 text-text-faint">
                      {t.class}
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

      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        <span className="flex items-center justify-between gap-2">
          <span>Nom</span>
          <button
            type="button"
            onClick={askName}
            disabled={namePending}
            title="Proposer un nom"
            className="inline-flex items-center gap-1 border border-gold/60 bg-gradient-to-b from-gold-bright/15 to-gold/10 px-2 py-0.5 font-ui text-[10px] uppercase tracking-widest text-gold-bright transition-colors hover:border-gold hover:bg-[rgba(212,166,76,0.18)] disabled:opacity-50"
          >
            <span aria-hidden>✎✨</span>
            <span>{namePending ? '…' : 'Inspire-moi'}</span>
          </button>
        </span>
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-lg text-text outline-none focus:border-gold"
          placeholder="Dorn Ferrecoeur"
        />
        {nameError && <span className="text-xs text-blood">{nameError}</span>}
      </label>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Espèce
        <select
          name="speciesId"
          value={speciesId}
          onChange={(e) => setSpeciesId(e.target.value)}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
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
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
        >
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="md:col-span-2 flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        <span className="flex items-center justify-between gap-2">
          <span>Personnalité (ton, voix, particularités)</span>
          <button
            type="button"
            onClick={askSuggestion}
            disabled={suggestPending}
            title="Proposer une personnalité"
            className="inline-flex items-center gap-1 border border-gold/60 bg-gradient-to-b from-gold-bright/15 to-gold/10 px-3 py-1 font-ui text-[10px] uppercase tracking-widest text-gold-bright transition-colors hover:border-gold hover:bg-[rgba(212,166,76,0.18)] disabled:opacity-50"
          >
            <span aria-hidden>✎✨</span>
            <span>{suggestPending ? 'Invoque…' : 'Inspire-moi'}</span>
          </button>
        </span>
        <textarea
          name="persona"
          required
          maxLength={600}
          rows={3}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
          placeholder="Nain bourru mais loyal. Agit avant de parler. Prend les coups en premier et reproche ensuite."
        />
        {suggestError && <span className="text-xs text-blood">{suggestError}</span>}
      </label>
      <section className="md:col-span-2 border border-line bg-card p-5">
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
                {rolledCurrency.gp} {coinLabel}
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
        <section className="md:col-span-2 border border-line bg-card p-5">
          <p className="mb-3 font-display text-sm uppercase tracking-[0.3em] text-gold">
            ✦ Sorts de départ ({startingSpells.length})
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

      {state && !state.ok && <p className="text-sm text-blood md:col-span-2">{state.error}</p>}
      <div className="md:col-span-2 flex flex-col items-end gap-2">
        {!rolled && (
          <p className="text-xs text-blood">⚂ Lance les dés avant de recruter le compagnon.</p>
        )}
        <BtnPrimary type="submit" icon="◉" disabled={!rolled}>
          Recruter
        </BtnPrimary>
      </div>
    </form>
  );
}
