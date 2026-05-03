'use client';

import { useActionState, useState } from 'react';
import { BtnPrimary } from '../../../components/ui/button';
import type { CampaignRow, Universe } from '../../../lib/db/types';
import { getModulesByUniverse, MODULE_TEMPLATES } from '../../../lib/modules/templates';
import { createCampaign, type ServerResult } from '../../../lib/server/campaigns';

type Mode = 'homebrew' | 'module' | 'generated' | 'arena';

const MODES: Array<{
  value: Mode;
  title: string;
  description: string;
  glyph: string;
}> = [
  {
    value: 'homebrew',
    title: 'Ton monde',
    description:
      "Décris précisément l'univers, les lieux, le ton. Le Conteur respecte ta description sans l'inventer.",
    glyph: '✎',
  },
  {
    value: 'module',
    title: 'Module pré-écrit',
    description: 'Pioche dans une aventure existante — pitch, intrigue et PNJ déjà prêts.',
    glyph: '❋',
  },
  {
    value: 'generated',
    title: 'Monde généré',
    description:
      'Donne juste un thème court (« cité sous la glace »). Le Conteur invente le reste à partir de là.',
    glyph: '✧',
  },
  {
    value: 'arena',
    title: "Arène d'entraînement",
    description:
      'Bac à sable combat pur. Pas d’histoire, pas de PNJ alliés — vagues d’ennemis enchaînées pour tester la mécanique.',
    glyph: '⚔',
  },
];

export function NewCampaignForm() {
  const [state, formAction] = useActionState<ServerResult<CampaignRow> | null, FormData>(
    createCampaign,
    null,
  );
  const [settingMode, setSettingMode] = useState<Mode>('homebrew');
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [universe, setUniverse] = useState<Universe>('dnd5e');

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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {MODES.map((mode) => (
            <label
              key={mode.value}
              className="flex cursor-pointer flex-col gap-1 border border-line bg-card p-4 has-[:checked]:border-gold has-[:checked]:bg-[rgba(212,166,76,0.08)]"
            >
              <input
                type="radio"
                name="settingMode"
                value={mode.value}
                checked={settingMode === mode.value}
                onChange={() => setSettingMode(mode.value)}
                className="sr-only"
              />
              <span className="font-display text-xl text-gold-bright">{mode.glyph}</span>
              <span className="font-display text-sm text-text">{mode.title}</span>
              <span className="text-xs text-text-mute">{mode.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs uppercase tracking-[0.2em] text-text-mute">Univers</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <label
            className={`flex cursor-pointer flex-col gap-1 border border-line bg-card p-4 has-[:checked]:border-gold has-[:checked]:bg-[rgba(212,166,76,0.08)]`}
          >
            <input
              type="radio"
              name="universe"
              value="dnd5e"
              checked={universe === 'dnd5e'}
              onChange={() => setUniverse('dnd5e')}
              className="sr-only"
            />
            <span className="font-display text-xl text-gold-bright">⚔</span>
            <span className="font-display text-sm text-text">Donjons & Dragons 5e</span>
            <span className="text-xs text-text-mute">
              Règles D&D 5e standard : classes, races, magie, alignement.
            </span>
          </label>
          <label
            className={`flex cursor-pointer flex-col gap-1 border border-line bg-card p-4 has-[:checked]:border-gold has-[:checked]:bg-[rgba(212,166,76,0.08)]`}
          >
            <input
              type="radio"
              name="universe"
              value="witcher"
              checked={universe === 'witcher'}
              onChange={() => setUniverse('witcher')}
              className="sr-only"
            />
            <span className="font-display text-xl text-gold-bright">🏹</span>
            <span className="font-display text-sm text-text">The Witcher</span>
            <span className="text-xs text-text-mute">
              Univers sombre et réaliste : sorceleurs, monstres, magie des Signes, alchimie.
            </span>
          </label>
          <label
            className={`flex cursor-pointer flex-col gap-1 border border-line bg-card p-4 has-[:checked]:border-gold has-[:checked]:bg-[rgba(212,166,76,0.08)]`}
          >
            <input
              type="radio"
              name="universe"
              value="naheulbeuk"
              checked={universe === 'naheulbeuk'}
              onChange={() => setUniverse('naheulbeuk')}
              className="sr-only"
            />
            <span className="font-display text-xl text-gold-bright">🍺</span>
            <span className="font-display text-sm text-text">Donjon de Naheulbeuk</span>
            <span className="text-xs text-text-mute">
              Terre de Fangh : parodie joyeusement con. Bras cassés héroïques, échecs sympathiques,
              Zangdar.
            </span>
          </label>
        </div>
      </fieldset>

      {settingMode === 'module' && (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-text-mute">
            Choisis un module — {getModulesByUniverse(universe).length} disponibles pour{' '}
            {universeLabel(universe)}
          </p>
          <input type="hidden" name="moduleId" value={moduleId ?? ''} />
          <div className="grid gap-3 md:grid-cols-2">
            {getModulesByUniverse(universe).map((t) => {
              const selected = moduleId === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setModuleId(t.id)}
                  className={`flex flex-col gap-2 border p-4 text-left transition-colors ${
                    selected
                      ? 'border-gold bg-[rgba(212,166,76,0.1)]'
                      : 'border-line bg-card hover:border-gold/60'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-base text-gold-bright">{t.title}</span>
                    <span
                      className="font-display text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: difficultyColor(t.difficulty) }}
                    >
                      {t.difficulty}
                    </span>
                  </div>
                  <p className="font-narr text-sm italic text-text-mid">{t.tagline}</p>
                  <p className="font-narr text-sm text-text">{t.summary}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-text-mute">
                    <span className="border border-line px-2 py-0.5">niv. {t.levelRange}</span>
                    <span className="border border-line px-2 py-0.5">{t.sessionsEstimate}</span>
                    {t.tones.map((tone) => (
                      <span key={tone} className="text-text-faint">
                        · {tone}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 font-ui text-[11px] text-text-mute">
                    <span className="text-gold">Équipe conseillée :</span> {t.recommendedParty}
                  </p>
                </button>
              );
            })}
          </div>
          {settingMode === 'module' && !moduleId && (
            <p className="text-xs text-blood">Sélectionne un module pour continuer.</p>
          )}
        </section>
      )}

      {settingMode !== 'module' && (
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
          {settingMode === 'homebrew'
            ? 'Description de ton univers'
            : settingMode === 'arena'
              ? 'Type d’ennemis (optionnel)'
              : 'Thème de départ'}
          <textarea
            name="settingPitch"
            rows={settingMode === 'homebrew' ? 6 : 3}
            maxLength={2000}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
            placeholder={
              settingMode === 'homebrew'
                ? "Décris les lieux, les factions, l'ambiance, les règles propres à ton monde. Le Conteur suivra ta description à la lettre."
                : settingMode === 'arena'
                  ? 'Ex. : « gobelins, ogres, et un dragon final » ou « créatures Witcher : noyeurs, alghouls, leshen ». Laisse vide pour laisser le MJ choisir.'
                  : 'Ex. : « cité sous la glace dirigée par une guilde de marchands de rêves » — quelques mots suffisent.'
            }
          />
        </label>
      )}

      {state && !state.ok && !state.fieldErrors && (
        <p className="text-sm text-blood">{state.error}</p>
      )}

      <div className="flex justify-end">
        <BtnPrimary icon="✦" type="submit" disabled={settingMode === 'module' && !moduleId}>
          Allumer le feu
        </BtnPrimary>
      </div>
    </form>
  );
}

function universeLabel(u: Universe): string {
  switch (u) {
    case 'dnd5e':
      return 'D&D 5e';
    case 'witcher':
      return 'The Witcher';
    case 'naheulbeuk':
      return 'Naheulbeuk';
  }
}

function difficultyColor(d: string): string {
  switch (d) {
    case 'débutant':
      return 'var(--color-moss)';
    case 'intermédiaire':
      return 'var(--color-gold)';
    case 'expert':
      return 'var(--color-candle)';
    case 'mortel':
      return 'var(--color-blood)';
    default:
      return 'var(--color-text-mute)';
  }
}
