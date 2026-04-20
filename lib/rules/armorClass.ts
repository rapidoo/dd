import type { ArmorCategory } from './types';

export interface ArmorPiece {
  category: ArmorCategory;
  /** Base AC value of the armor (e.g. 13 for leather, 16 for chainmail, 18 for plate). */
  baseAC: number;
  /** Max DEX bonus the armor allows. undefined = unlimited (light). 0 = no DEX (heavy). */
  maxDexBonus?: number;
  /** Strength score required to avoid speed penalty (not modeled here, info only). */
  strengthRequired?: number;
  /** Does the armor impose disadvantage on stealth? Info only. */
  stealthDisadvantage?: boolean;
}

export interface ACInput {
  dexMod: number;
  armor?: ArmorPiece;
  shieldBonus?: number;
  otherBonus?: number;
}

/**
 * AC calculation (dnd5e_rules.md §6):
 *   Unarmored     → 10 + DEX mod
 *   Light armor   → base + DEX mod
 *   Medium armor  → base + min(DEX mod, 2)
 *   Heavy armor   → base (no DEX)
 *   + shield (+2 typically)
 *   + any miscellaneous bonus (e.g. magic items, class features)
 */
export function calculateAC(input: ACInput): number {
  const shield = input.shieldBonus ?? 0;
  const other = input.otherBonus ?? 0;
  if (!input.armor || input.armor.category === 'none') {
    return 10 + input.dexMod + shield + other;
  }
  const { armor } = input;
  let dex = input.dexMod;
  if (armor.maxDexBonus !== undefined) {
    dex = Math.min(dex, armor.maxDexBonus);
  }
  return armor.baseAC + dex + shield + other;
}
