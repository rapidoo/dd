import type { Ability, AbilityScores } from './types';

/**
 * Ability modifier from score.
 * Formula (verbatim, dnd5e_rules.md): `modifier = floor((score - 10) / 2)`.
 * Math.floor handles negative correctly (e.g. score 1 → -5).
 */
export function getAbilityModifier(score: number): number {
  if (!Number.isInteger(score)) {
    throw new Error(`Ability score must be an integer, got ${score}`);
  }
  if (score < 1 || score > 30) {
    throw new Error(`Ability score out of range [1,30]: ${score}`);
  }
  return Math.floor((score - 10) / 2);
}

export function getAllModifiers(scores: AbilityScores): Record<Ability, number> {
  return {
    str: getAbilityModifier(scores.str),
    dex: getAbilityModifier(scores.dex),
    con: getAbilityModifier(scores.con),
    int: getAbilityModifier(scores.int),
    wis: getAbilityModifier(scores.wis),
    cha: getAbilityModifier(scores.cha),
  };
}

/** Passive score = 10 + relevant modifiers (used e.g. for Passive Perception). */
export function passiveScore(...modifiers: number[]): number {
  return 10 + modifiers.reduce((a, b) => a + b, 0);
}
