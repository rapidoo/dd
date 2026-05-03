import type { InventoryItem } from './inventory-actions';

/**
 * Shape posted by the character creation form when a starting kit / template
 * inventory entry is sent. Looser than InventoryItem on purpose — we accept
 * the rules-layer Item shape (name, type, damage, effect, count, description)
 * and normalize it.
 */
export interface RawKitItem {
  name: string;
  type?: string;
  damage?: string;
  effect?: string;
  count?: number;
  description?: string;
}

// Kit item types live in the rules layer (weapon/shield/armor/gear/consumable/
// focus/tool/trinket/magic). InventoryItem.type is constrained to a smaller
// canonical set. Anything that doesn't map cleanly falls into 'misc'.
const KIT_TYPE_TO_INV: Record<string, InventoryItem['type']> = {
  weapon: 'weapon',
  shield: 'armor',
  armor: 'armor',
  consumable: 'consumable',
  tool: 'tool',
  treasure: 'treasure',
};

const DICE_RE = /^(\d*d\d+(?:[+-]\d+)?)\s*(.*)$/i;

function parseWeapon(damage: string): InventoryItem['weapon'] | undefined {
  const match = DICE_RE.exec(damage.trim());
  if (!match) return undefined;
  const dice = match[1];
  const rest = (match[2] ?? '').toLowerCase().trim();
  if (!dice) return undefined;
  return {
    damageDice: dice,
    damageType: rest || undefined,
  };
}

/**
 * Normalize a kit/template item (rules layer) into the canonical InventoryItem
 * shape expected by the play view, sheet, and concierge. Adds a stable id so
 * the React list keys are unique, and renames `count` → `qty`.
 */
export function normalizeKitItem(raw: RawKitItem): InventoryItem {
  const description = [raw.description, raw.effect].filter(Boolean).join(' · ') || undefined;
  const type: InventoryItem['type'] = (raw.type && KIT_TYPE_TO_INV[raw.type]) || 'misc';
  return {
    id: crypto.randomUUID(),
    name: raw.name,
    qty: Math.max(1, raw.count ?? 1),
    type,
    description,
    weapon: type === 'weapon' && raw.damage ? parseWeapon(raw.damage) : undefined,
  };
}
