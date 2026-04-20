import type { SpellSlots } from './types';

/**
 * Full-caster spell slot progression (Bard, Cleric, Druid, Sorcerer, Wizard).
 * Indexed by [level][spellLevel] → max slots.
 * Source: SRD 5.1 PHB Table.
 */
const FULL_CASTER_SLOTS: Record<
  number,
  Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>>
> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

/** Half-caster progression (Paladin, Ranger). */
const HALF_CASTER_SLOTS: Record<number, Partial<Record<1 | 2 | 3 | 4 | 5, number>>> = {
  1: {},
  2: { 1: 2 },
  3: { 1: 3 },
  4: { 1: 3 },
  5: { 1: 4, 2: 2 },
  6: { 1: 4, 2: 2 },
  7: { 1: 4, 2: 3 },
  8: { 1: 4, 2: 3 },
  9: { 1: 4, 2: 3, 3: 2 },
  10: { 1: 4, 2: 3, 3: 2 },
  11: { 1: 4, 2: 3, 3: 3 },
  12: { 1: 4, 2: 3, 3: 3 },
  13: { 1: 4, 2: 3, 3: 3, 4: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 2 },
  16: { 1: 4, 2: 3, 3: 3, 4: 2 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
};

export type CasterType = 'full' | 'half' | 'none';

export function spellSlotsFor(casterType: CasterType, level: number): SpellSlots {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error(`Level out of range [1,20]: ${level}`);
  }
  if (casterType === 'none') return {};
  const table = casterType === 'full' ? FULL_CASTER_SLOTS : HALF_CASTER_SLOTS;
  const row = table[level] ?? {};
  const result: SpellSlots = {};
  for (const [lvlStr, maxRaw] of Object.entries(row)) {
    if (maxRaw === undefined) continue;
    const lvl = Number.parseInt(lvlStr, 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    result[lvl] = { max: maxRaw, used: 0 };
  }
  return result;
}

export interface SpellSaveDCInput {
  profBonus: number;
  spellAbilityMod: number;
  otherBonus?: number;
}

/** Spell save DC = 8 + proficiency bonus + spellcasting ability modifier. */
export function spellSaveDC(input: SpellSaveDCInput): number {
  return 8 + input.profBonus + input.spellAbilityMod + (input.otherBonus ?? 0);
}

/** Spell attack bonus = proficiency bonus + spellcasting ability modifier. */
export function spellAttackBonus(input: SpellSaveDCInput): number {
  return input.profBonus + input.spellAbilityMod + (input.otherBonus ?? 0);
}

/**
 * Consume a spell slot of the given level. Returns the updated slots or null if none available.
 */
export function consumeSpellSlot(
  slots: SpellSlots,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): SpellSlots | null {
  const s = slots[level];
  if (!s || s.used >= s.max) return null;
  return { ...slots, [level]: { ...s, used: s.used + 1 } };
}

/** Restore a single spell slot. Silently ignores unknown levels. */
export function restoreSpellSlot(
  slots: SpellSlots,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  count = 1,
): SpellSlots {
  const s = slots[level];
  if (!s) return slots;
  return { ...slots, [level]: { ...s, used: Math.max(0, s.used - count) } };
}

/** Long rest: all slots fully restored. */
export function restoreAllSpellSlots(slots: SpellSlots): SpellSlots {
  const out: SpellSlots = {};
  for (const key of Object.keys(slots)) {
    const lvl = Number.parseInt(key, 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    const s = slots[lvl];
    if (!s) continue;
    out[lvl] = { ...s, used: 0 };
  }
  return out;
}

export function availableSlot(
  slots: SpellSlots,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): boolean {
  const s = slots[level];
  return s !== undefined && s.used < s.max;
}
