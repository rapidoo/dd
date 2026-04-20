import { rollD20 } from './dice';
import { type AdvantageState, defaultRandom, type Random } from './types';

export interface SavingThrowInput {
  abilityMod: number;
  profBonus: number;
  proficient: boolean;
  otherBonus?: number;
  dc: number;
  advantage?: AdvantageState;
}

export interface SavingThrowResult {
  total: number;
  roll: number;
  rawRolls: number[];
  dc: number;
  success: boolean;
  naturalOne: boolean;
  naturalTwenty: boolean;
}

/**
 * Resolve a saving throw:
 *   total = 1d20 + abilityMod + (profBonus if proficient) + otherBonus
 *   success if total >= dc.
 * Natural 1 / 20 are informational only for saves (no auto-fail/auto-success by default
 * per core rules — crits apply only to attack rolls per dnd5e_rules.md §1.3).
 */
export function rollSavingThrow(
  input: SavingThrowInput,
  rng: Random = defaultRandom,
): SavingThrowResult {
  const mod = input.abilityMod + (input.proficient ? input.profBonus : 0) + (input.otherBonus ?? 0);
  const d20 = rollD20(mod, input.advantage ?? 'normal', rng);
  return {
    total: d20.total,
    roll: d20.roll,
    rawRolls: d20.rawRolls,
    dc: input.dc,
    success: d20.total >= input.dc,
    naturalOne: d20.roll === 1,
    naturalTwenty: d20.roll === 20,
  };
}
