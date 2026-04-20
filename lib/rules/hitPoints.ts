import type { HitDie } from './types';

/** Numeric faces for a hit die. */
export function hitDieFaces(die: HitDie): number {
  switch (die) {
    case 'd6':
      return 6;
    case 'd8':
      return 8;
    case 'd10':
      return 10;
    case 'd12':
      return 12;
  }
}

/**
 * Compute maximum HP using the "average" rule (dnd5e_rules.md §7.10):
 *   Level 1 : max face + CON mod
 *   Levels > 1 : average(die) + CON mod per level, where average = faces/2 + 1
 * Per-level HP is clamped to min 1 (CON penalty cannot drop a level below 1 HP).
 */
export function calculateMaxHP(die: HitDie, conMod: number, level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error(`Level out of range [1,20]: ${level}`);
  }
  const faces = hitDieFaces(die);
  let hp = Math.max(1, faces + conMod);
  const avg = faces / 2 + 1;
  for (let l = 2; l <= level; l++) {
    hp += Math.max(1, avg + conMod);
  }
  return hp;
}

export interface HPState {
  current: number;
  max: number;
  temp: number;
}

/**
 * Apply damage to a creature.
 *   Temp HP absorbs first.
 *   Current HP floors at 0 (not negative).
 *   Massive damage rule (damage exceeding max HP at 0) → dead = true.
 */
export interface DamageApplicationResult {
  state: HPState;
  absorbedByTemp: number;
  appliedToCurrent: number;
  wentToZero: boolean;
  massive: boolean;
}

export function applyDamage(state: HPState, amount: number): DamageApplicationResult {
  if (amount < 0) throw new Error(`Damage amount cannot be negative: ${amount}`);
  let remaining = amount;
  let absorbedByTemp = 0;
  let temp = state.temp;
  if (temp > 0) {
    absorbedByTemp = Math.min(temp, remaining);
    temp -= absorbedByTemp;
    remaining -= absorbedByTemp;
  }
  const before = state.current;
  const newCurrent = Math.max(0, before - remaining);
  const appliedToCurrent = before - newCurrent;
  const wentToZero = before > 0 && newCurrent === 0;
  // Massive damage = damage after temp absorption exceeds max HP when already at 0
  const massive = newCurrent === 0 && remaining >= state.max;
  return {
    state: { current: newCurrent, max: state.max, temp },
    absorbedByTemp,
    appliedToCurrent,
    wentToZero,
    massive,
  };
}

/** Heal, clamped to max. Does not affect temp HP. */
export function applyHealing(state: HPState, amount: number): HPState {
  if (amount < 0) throw new Error(`Healing amount cannot be negative: ${amount}`);
  return {
    ...state,
    current: Math.min(state.max, state.current + amount),
  };
}

/**
 * Grant temp HP. Temp HP does NOT stack — new value replaces old only if higher.
 * This matches the 5e rule in dnd5e_rules.md.
 */
export function grantTempHP(state: HPState, amount: number): HPState {
  if (amount < 0) throw new Error(`Temp HP amount cannot be negative: ${amount}`);
  return { ...state, temp: Math.max(state.temp, amount) };
}
