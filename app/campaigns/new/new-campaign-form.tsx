'use client';

import { useActionState } from 'react';
import { BtnPrimary } from '../../../components/ui/button';
import type { CampaignRow } from '../../../lib/db/types';
import { createCampaign, type ServerResult } from '../../../lib/server/campaigns';

const MODES: Array<{
  value: 'homebrew' | 'module' | 'generated';
  title: string;
  description: string;
  glyph: string;
}> = [
  {
    value: 'homebrew',
    title: 'Monde libre',
    description: "Décris toi-même l'univers dans les marges.",
    glyph: '✎',
  },
  {
    value: 'module',
    title: 'Module pré-écrit',
    description: 'Pioche dans une aventure existante (bientôt).',
    glyph: '❋',
  },
  {
    value: 'generated',
    title: 'Monde généré',
    description: 'Donne un pitch et le MJ-IA en fait un monde.',
    glyph: '✧',
  },
];

export function NewCampaignForm() {
  const [state, formAction] = useActionState<ServerResult<CampaignRow> | null, FormData>(
    createCampaign,
    null,
  );

  const fieldError = (key: string) => {
    if (!state || state.ok) return null;
    const errs = state.fieldErrors?.[key];
    if (!errs || errs.length === 0) return null;
    return <p className="mt-1 text-xs text-blood">{errs[0]}</p>;
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Nom de la campagne
        <input
          name="name"
          type="text"
          required
          maxLength={120}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-lg text-text outline-none focus:border-gold"
          placeholder="Ex. La Bibliothèque de Cire"
        />
        {fieldError('name')}
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs uppercase tracking-[0.2em] text-text-mute">Type de monde</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((mode, idx) => (
            <label
              key={mode.value}
              className="flex cursor-pointer flex-col gap-1 border border-line bg-card p-4 has-[:checked]:border-gold has-[:checked]:bg-[rgba(212,166,76,0.08)]"
            >
              <input
                type="radio"
                name="settingMode"
                value={mode.value}
                defaultChecked={idx === 0}
                className="sr-only"
              />
              <span className="font-display text-xl text-gold-bright">{mode.glyph}</span>
              <span className="font-display text-sm text-text">{mode.title}</span>
              <span className="text-xs text-text-mute">{mode.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Pitch optionnel
        <textarea
          name="settingPitch"
          rows={4}
          maxLength={2000}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
          placeholder="Quelques lignes pour inspirer le MJ — lieux, tonalité, ambiance…"
        />
      </label>

      {state && !state.ok && !state.fieldErrors && (
        <p className="text-sm text-blood">{state.error}</p>
      )}

      <div className="flex justify-end">
        <BtnPrimary icon="✦" type="submit">
          Allumer le feu
        </BtnPrimary>
      </div>
    </form>
  );
}
