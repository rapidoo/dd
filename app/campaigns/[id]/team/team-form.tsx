'use client';

import { useActionState, useState, useTransition } from 'react';
import { BtnPrimary } from '../../../../components/ui/button';
import type { CharacterRow } from '../../../../lib/db/types';
import type { Universe } from '../../../../lib/db/types';
import { getClassOptions, getSpeciesForUniverse, getSpeciesOptions, getClassesForUniverse } from '../../../../lib/rules/srd';
import type { ServerResult } from '../../../../lib/server/campaigns';
import { createCompanion } from '../../../../lib/server/companions';
import { suggestName, suggestPersona } from '../../../../lib/server/persona-suggest';

export function TeamForm({ campaignId, universe }: { campaignId: string; universe: Universe }) {
  const [state, formAction] = useActionState<ServerResult<CharacterRow> | null, FormData>(
    createCompanion,
    null,
  );
  const classes = getClassesForUniverse(universe);
  const species = getSpeciesForUniverse(universe);
  const classOptions = getClassOptions(universe);
  const speciesOptions = getSpeciesOptions(universe);
  
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState(speciesOptions[0]?.id ?? 'dwarf');
  const [classId, setClassId] = useState(classOptions[0]?.id ?? 'fighter');
  const [persona, setPersona] = useState('');
  const [suggestPending, startSuggest] = useTransition();
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [namePending, startName] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

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
      {state && !state.ok && <p className="text-sm text-blood md:col-span-2">{state.error}</p>}
      <div className="md:col-span-2 flex justify-end">
        <BtnPrimary type="submit" icon="◉">
          Recruter
        </BtnPrimary>
      </div>
    </form>
  );
}
