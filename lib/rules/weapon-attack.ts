import type { CharacterRow } from '../db/types';
import { getAbilityModifier } from './abilities';
import { proficiencyBonus } from './proficiency';

export interface WeaponMeta {
  /** Damage expression without the ability modifier (e.g. "1d8"). */
  damageDice: string;
  /** French label for display — "contondant", "perforant", "tranchant", etc. */
  damageType?: string;
  /**
   * Which ability drives attack and damage.
   * - 'str': strength (most melee)
   * - 'dex': dexterity (ranged, or finesse melee by default)
   * - 'finesse': either STR or DEX, pick whichever is higher (melee finesse)
   */
  ability?: 'str' | 'dex' | 'finesse';
  /** Ranged weapons always use DEX. */
  ranged?: boolean;
}

export interface WeaponAttack {
  /** Formatted attack bonus, e.g. "+5". */
  toHit: string;
  /** Full damage expression including the modifier, e.g. "1d8+3". */
  damage: string;
  /** Ability actually used ("str" | "dex"). Useful to explain the math. */
  usedAbility: 'str' | 'dex';
  /** French label for the damage type, if known. */
  damageType?: string;
}

/**
 * Compute attack bonus and damage expression for a weapon held by a character.
 *
 * Assumes the character is proficient (we don't track per-class weapon
 * proficiency yet). For finesse weapons, picks whichever of STR/DEX is
 * higher. Returns null when the weapon lacks damage dice — such items are
 * purely narrative.
 */
export function weaponAttack(
  character: CharacterRow,
  meta: WeaponMeta | null,
): WeaponAttack | null {
  if (!meta?.damageDice) return null;
  const strMod = getAbilityModifier(character.str);
  const dexMod = getAbilityModifier(character.dex);
  const usedAbility = pickAbility(meta, strMod, dexMod);
  const mod = usedAbility === 'str' ? strMod : dexMod;
  const prof = proficiencyBonus(character.level);
  const toHitValue = prof + mod;
  const toHit = toHitValue >= 0 ? `+${toHitValue}` : String(toHitValue);
  const damage =
    mod === 0
      ? meta.damageDice
      : mod > 0
        ? `${meta.damageDice}+${mod}`
        : `${meta.damageDice}${mod}`;
  return { toHit, damage, usedAbility, damageType: meta.damageType };
}

function pickAbility(meta: WeaponMeta, strMod: number, dexMod: number): 'str' | 'dex' {
  if (meta.ranged) return 'dex';
  if (meta.ability === 'dex') return 'dex';
  if (meta.ability === 'finesse') return dexMod >= strMod ? 'dex' : 'str';
  return 'str';
}
