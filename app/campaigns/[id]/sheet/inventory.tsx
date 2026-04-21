'use client';

import { useState, useTransition } from 'react';
import { BtnGhost, BtnPrimary } from '../../../../components/ui/button';
import {
  addInventoryItem,
  adjustCurrency,
  type Currency,
  type InventoryItem,
  removeInventoryItem,
} from '../../../../lib/server/inventory-actions';

const TYPE_LABEL: Record<string, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  tool: 'Outil',
  consumable: 'Consommable',
  treasure: 'Trésor',
  misc: 'Divers',
};

const TYPES: Array<InventoryItem['type']> = [
  'weapon',
  'armor',
  'tool',
  'consumable',
  'treasure',
  'misc',
];

export function InventorySection({
  characterId,
  inventory,
}: {
  characterId: string;
  inventory: InventoryItem[];
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<InventoryItem['type']>('misc');
  const [pending, startTransition] = useTransition();

  const submitAdd = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      await addInventoryItem({ characterId, name: name.trim(), qty, type });
      setName('');
      setQty(1);
    });
  };

  const remove = (itemId: string) => {
    startTransition(() =>
      removeInventoryItem({ characterId, itemId, qty: 1 }).then(() => undefined),
    );
  };
  const removeAll = (itemId: string, currentQty: number) => {
    startTransition(() =>
      removeInventoryItem({ characterId, itemId, qty: currentQty }).then(() => undefined),
    );
  };

  return (
    <section className="border border-line bg-card p-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
        ◈ Équipement
      </p>
      {inventory.length === 0 ? (
        <p className="mb-4 font-narr italic text-text-mute">Sac vide.</p>
      ) : (
        <ul className="mb-4 divide-y divide-line border border-line">
          {inventory.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
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
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(item.id)}
                  className="border border-line px-2 py-1 font-mono text-[11px] text-text-mute hover:border-gold hover:text-gold"
                  title="Retirer 1"
                >
                  −1
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removeAll(item.id, item.qty)}
                  className="border border-line px-2 py-1 font-mono text-[11px] text-text-mute hover:border-blood hover:text-blood"
                  title="Tout jeter"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12ch] flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-text-mute">
          Objet
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Potion de soin, épée courte…"
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-2 py-1.5 font-narr text-sm text-text outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-text-mute">
          Qté
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-2 py-1.5 text-center font-mono text-sm text-text outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-text-mute">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InventoryItem['type'])}
            className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-2 py-1.5 font-ui text-sm text-text outline-none focus:border-gold"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t ?? 'misc']}
              </option>
            ))}
          </select>
        </label>
        <BtnPrimary onClick={submitAdd} disabled={pending || !name.trim()}>
          Ajouter
        </BtnPrimary>
      </div>
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

export function PurseSection({
  characterId,
  currency,
}: {
  characterId: string;
  currency: Currency;
}) {
  const [amounts, setAmounts] = useState<Currency>({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  const [pending, startTransition] = useTransition();

  const apply = (sign: 1 | -1) => {
    startTransition(async () => {
      await adjustCurrency({
        characterId,
        cp: amounts.cp * sign,
        sp: amounts.sp * sign,
        ep: amounts.ep * sign,
        gp: amounts.gp * sign,
        pp: amounts.pp * sign,
      });
      setAmounts({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    });
  };

  return (
    <section className="border border-line bg-card p-5">
      <p className="mb-3 font-display text-[10px] uppercase tracking-[0.25em] text-gold">
        ✦ Bourse
      </p>
      <div className="mb-4 grid grid-cols-5 gap-2">
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

      <p className="mb-2 text-[10px] uppercase tracking-widest text-text-mute">Ajuster la bourse</p>
      <div className="mb-3 grid grid-cols-5 gap-2">
        {COIN_LABEL.map(([key]) => (
          <input
            key={key}
            type="number"
            min={0}
            value={amounts[key]}
            onChange={(e) =>
              setAmounts((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value)) }))
            }
            className="w-full rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-2 py-1.5 text-center font-mono text-sm text-text outline-none focus:border-gold"
          />
        ))}
      </div>
      <div className="flex gap-2">
        <BtnGhost
          onClick={() => apply(-1)}
          disabled={pending}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          − Dépenser
        </BtnGhost>
        <BtnGhost
          onClick={() => apply(1)}
          disabled={pending}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          + Recevoir
        </BtnGhost>
      </div>
    </section>
  );
}
