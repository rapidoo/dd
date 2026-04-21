'use client';

import { useState } from 'react';
import { Message, TypingIndicator } from '../../components/session/message';
import { SessionSidebar } from '../../components/session/sidebar';
import { BtnGhost, BtnPrimary } from '../../components/ui/button';
import {
  DiceOverlay,
  type DiceOverlayState,
  type RollKind,
} from '../../components/ui/dice-overlay';
import { SlotRow, Stat } from '../../components/ui/stat';

function buildDemoRoll(kind: RollKind, outcome: 'normal' | 'crit' | 'fumble'): DiceOverlayState {
  const roll = outcome === 'crit' ? 20 : outcome === 'fumble' ? 1 : 14;
  const mod = kind === 'damage' ? 0 : 5;
  return {
    dice:
      kind === 'damage'
        ? [
            { faces: 8, value: 7 },
            { faces: 8, value: 4 },
          ]
        : [{ faces: 20, value: roll }],
    modifier: mod,
    label:
      kind === 'attack'
        ? 'Épée longue'
        : kind === 'save'
          ? 'Sauvegarde de SAG'
          : kind === 'damage'
            ? 'Éclair (3d6)'
            : kind === 'concentration'
              ? 'Maintenir Bénédiction'
              : 'Perception',
    kind,
    keptD20: kind === 'damage' ? undefined : roll,
    allD20: kind === 'damage' ? undefined : [roll],
    advantage: 'normal',
    total: kind === 'damage' ? 11 : roll + mod,
    critical: outcome === 'crit' && kind !== 'damage',
    fumble: outcome === 'fumble' && kind !== 'damage',
  };
}

export default function DesignPage() {
  const [current, setCurrent] = useState('session');
  const [overlay, setOverlay] = useState<DiceOverlayState | null>(null);
  const [rolling, setRolling] = useState(false);

  const triggerRoll = (kind: RollKind, outcome: 'normal' | 'crit' | 'fumble' = 'normal') => {
    setOverlay(buildDemoRoll(kind, outcome));
    setRolling(true);
    setTimeout(() => setRolling(false), 1000);
  };

  return (
    <div className="relative flex min-h-screen">
      <SessionSidebar current={current} onNavigate={setCurrent} />

      <main className="flex-1 overflow-y-auto p-10">
        <h1 className="mb-2 font-display text-3xl text-gold-bright">Design system</h1>
        <p className="mb-10 max-w-xl text-sm text-text-mute">
          Palette, typographies et composants partagés extraits du design de la session
          (session.html). Cette page sert de référence visuelle et de golden file pour les tests de
          régression.
        </p>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">Palette</h2>
          <div className="flex flex-wrap gap-2">
            {[
              ['bg', '#0a0604'],
              ['bg-deep', '#1a100a'],
              ['gold', '#d4a64c'],
              ['gold-bright', '#ecc87a'],
              ['candle', '#f0b050'],
              ['blood', '#9a3028'],
              ['parch', '#ede2c8'],
              ['moss', '#6a7a3a'],
              ['sky', '#4a6a8a'],
              ['violet', '#6a5a8a'],
            ].map(([name, hex]) => (
              <div
                key={name}
                className="flex h-16 w-24 flex-col items-center justify-center border border-line text-[10px]"
                style={{ background: hex }}
              >
                <span
                  style={{
                    color: name === 'parch' || name === 'gold-bright' ? '#1a100a' : '#f2e8d0',
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">Boutons</h2>
          <div className="flex flex-wrap gap-3">
            <BtnPrimary icon="▸">Envoyer</BtnPrimary>
            <BtnGhost icon="⚔">Attaquer</BtnGhost>
            <BtnGhost active>Onglet actif</BtnGhost>
            <BtnGhost icon="☾">Repos</BtnGhost>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
            Dés animés
          </h2>
          <div className="flex flex-wrap gap-3">
            <BtnGhost onClick={() => triggerRoll('attack')}>d20 attaque</BtnGhost>
            <BtnGhost onClick={() => triggerRoll('attack', 'crit')}>d20 crit</BtnGhost>
            <BtnGhost onClick={() => triggerRoll('attack', 'fumble')}>d20 fumble</BtnGhost>
            <BtnGhost onClick={() => triggerRoll('damage')}>2d8 dégâts</BtnGhost>
            <BtnGhost onClick={() => triggerRoll('save')}>sauvegarde</BtnGhost>
            <BtnGhost onClick={() => triggerRoll('concentration')}>concentration</BtnGhost>
          </div>
        </section>

        <section className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="border border-line bg-card p-6">
            <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
              Statistiques
            </h2>
            <Stat
              label="Points de vie"
              value="28 / 38"
              pct={74}
              barColor="linear-gradient(90deg, #5a1810, #9a3028)"
            />
            <Stat label="Classe d'armure" value={18} />
            <Stat label="Initiative" value="+1" />
            <div className="mt-4">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-text-mute">
                Emplacements de sorts
              </p>
              <SlotRow level={1} have={4} total={4} />
              <SlotRow level={2} have={2} total={3} />
              <SlotRow level={3} have={1} total={2} />
            </div>
          </div>

          <div className="border border-line bg-card p-6">
            <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
              Messages
            </h2>
            <Message
              author={{ kind: 'gm', name: 'Le Conteur', glyph: '⚜' }}
              time="20:42"
              text="Les escaliers descendent dans une salle circulaire. Au centre, une vieille femme aveugle tourne la tête vers vous."
              mode="narration"
            />
            <Message
              author={{ kind: 'user', name: 'Elspeth' }}
              time="20:43"
              text="Je m'avance lentement, la main sur le pendentif."
              mode="action"
            />
            <TypingIndicator who="Le Conteur" />
          </div>
        </section>
      </main>

      <DiceOverlay state={overlay} rolling={rolling} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
