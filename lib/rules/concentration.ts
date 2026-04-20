import { rollSavingThrow, type SavingThrowResult } from './savingThrows';
import type { Concentration, Random } from './types';
import { defaultRandom } from './types';

export function emptyConcentration(): Concentration {
  return { active: false, spellName: null, level: null };
}

/**
 * Start concentrating on a spell. If already concentrating, the old one drops
 * (dnd5e_rules.md §8.5 — casting a new concentration spell immediately ends the previous).
 */
export function startConcentration(
  _existing: Concentration,
  spellName: string,
  level: number,
): Concentration {
  return { active: true, spellName, level };
}

export function dropConcentration(): Concentration {
  return emptyConcentration();
}

/**
 * DC for a concentration save when damaged: DC = max(10, floor(damage / 2)).
 */
export function concentrationSaveDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export interface ConcentrationCheckInput {
  conMod: number;
  profBonus: number;
  proficient: boolean; // true if character has CON save proficiency
  damage: number;
}

export interface ConcentrationCheckResult {
  save: SavingThrowResult;
  maintained: boolean;
}

export function checkConcentration(
  input: ConcentrationCheckInput,
  rng: Random = defaultRandom,
): ConcentrationCheckResult {
  const dc = concentrationSaveDC(input.damage);
  const save = rollSavingThrow(
    {
      abilityMod: input.conMod,
      profBonus: input.profBonus,
      proficient: input.proficient,
      dc,
    },
    rng,
  );
  return { save, maintained: save.success };
}
