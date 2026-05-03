import type { CharacterRow } from '../../../../lib/db/types';
import { weaponAttack } from '../../../../lib/rules/weapon-attack';
import type { Currency, InventoryItem } from '../../../../lib/server/inventory-actions';

const TYPE_LABEL: Record<string, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  tool: 'Outil',
  consumable: 'Consommable',
  treasure: 'Trésor',
  misc: 'Divers',
};

export function WeaponsSection({
  character,
  inventory,
}: {
  character: CharacterRow;
  inventory: InventoryItem[];
}) {
  const weapons = inventory.filter((i) => i.type === 'weapon');
  if (weapons.length === 0) return null;
  return (
    <section className="border border-line bg-card p-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.25em] text-gold">⚔ Armes</p>
      <ul className="divide-y divide-line border border-line">
        {weapons.map((w) => {
          const attack = weaponAttack(character, w.weapon ?? null);
          return (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-narr text-base text-text">
                  <span className="font-semibold text-gold-bright">×{w.qty}</span> {w.name}
                </p>
                {w.description && (
                  <p className="font-narr text-[11px] italic text-text-mute">{w.description}</p>
                )}
              </div>
              {attack ? (
                <div className="flex shrink-0 items-baseline gap-3 font-mono text-[12px]">
                  <span className="font-semibold text-gold-bright">{attack.toHit}</span>
                  <span className="text-text">{attack.damage}</span>
                  {attack.damageType && (
                    <span className="text-text-faint">{attack.damageType}</span>
                  )}
                </div>
              ) : (
                <span
                  className="font-mono text-[11px] text-text-faint"
                  title="Arme sans statistiques mécaniques — narrative uniquement."
                >
                  —
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InventorySection({ inventory }: { inventory: InventoryItem[] }) {
  return (
    <section id="inventaire" className="scroll-mt-10 border border-line bg-card p-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
        ◈ Équipement
      </p>
      {inventory.length === 0 ? (
        <p className="font-narr italic text-text-mute">Sac vide. Le Conteur t'en fera trouver.</p>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {inventory.map((item, idx) => (
            <li
              key={item.id ?? `${idx}-${item.name}`}
              className="flex items-baseline gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-narr text-base text-text">
                  <span className="font-semibold text-gold-bright">×{item.qty}</span> {item.name}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-faint">
                  {TYPE_LABEL[item.type ?? 'misc'] ?? 'Divers'}
                  {item.description && (
                    <span className="ml-2 normal-case tracking-normal text-text-mute">
                      — {item.description}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const COIN_LABEL: Array<[keyof Currency, string, string]> = [
  ['pp', 'Platine', '#d6e2eb'],
  ['gp', 'Or', '#ecc87a'],
  ['ep', 'Électrum', '#c4b26a'],
  ['sp', 'Argent', '#c9c9c9'],
  ['cp', 'Cuivre', '#c47a3a'],
];

export function PurseSection({ currency }: { currency: Currency }) {
  return (
    <section className="border border-line bg-card p-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
        ✦ Bourse
      </p>
      <div className="grid grid-cols-5 gap-2">
        {COIN_LABEL.map(([key, label, color]) => (
          <div key={key} className="flex flex-col items-center border border-line px-2 py-3">
            <span className="font-display text-[10px] uppercase tracking-widest" style={{ color }}>
              {label}
            </span>
            <span className="font-narr text-2xl text-gold-bright">{currency?.[key] ?? 0}</span>
            <span className="font-mono text-[9px] uppercase text-text-faint">{key}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
