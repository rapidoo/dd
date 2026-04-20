import { rollD20, rollDie } from './dice';
import { type AdvantageState, defaultRandom, type Random } from './types';

export interface AttackInput {
  abilityMod: number;
  profBonus: number;
  proficient: boolean;
  otherBonus?: number;
  targetAC: number;
  advantage?: AdvantageState;
}

export type AttackOutcome = 'hit' | 'miss' | 'crit' | 'fumble';

export interface AttackResult {
  roll: number;
  rawRolls: number[];
  modifier: number;
  total: number;
  targetAC: number;
  outcome: AttackOutcome;
  isCritical: boolean;
}

/**
 * Attack roll resolution per dnd5e_rules.md §1.3 and §7:
 *   - Natural 20 → automatic hit AND critical (double damage dice).
 *   - Natural 1  → automatic miss (fumble), regardless of bonuses.
 *   - Otherwise hit iff total >= targetAC.
 */
export function rollAttack(input: AttackInput, rng: Random = defaultRandom): AttackResult {
  const modifier =
    input.abilityMod + (input.proficient ? input.profBonus : 0) + (input.otherBonus ?? 0);
  const d20 = rollD20(modifier, input.advantage ?? 'normal', rng);
  let outcome: AttackOutcome;
  let isCritical = false;
  if (d20.roll === 20) {
    outcome = 'crit';
    isCritical = true;
  } else if (d20.roll === 1) {
    outcome = 'fumble';
  } else if (d20.total >= input.targetAC) {
    outcome = 'hit';
  } else {
    outcome = 'miss';
  }
  return {
    roll: d20.roll,
    rawRolls: d20.rawRolls,
    modifier,
    total: d20.total,
    targetAC: input.targetAC,
    outcome,
    isCritical,
  };
}

export interface InitiativeInput {
  dexMod: number;
  otherBonus?: number;
  advantage?: AdvantageState;
}

export interface InitiativeResult {
  roll: number;
  total: number;
}

/** Initiative = 1d20 + DEX mod (+ other bonuses e.g. Alert). */
export function rollInitiative(
  input: InitiativeInput,
  rng: Random = defaultRandom,
): InitiativeResult {
  const mod = input.dexMod + (input.otherBonus ?? 0);
  const d20 = rollD20(mod, input.advantage ?? 'normal', rng);
  return { roll: d20.roll, total: d20.total };
}

export interface InitiativeOrderEntry {
  id: string;
  total: number;
  dexMod: number;
}

/**
 * Sort initiative descending by total, tie-break by DEX modifier, then by entry id
 * (deterministic — spec doesn't mandate a tie-break roll in MVP).
 */
export function sortInitiative(entries: InitiativeOrderEntry[]): InitiativeOrderEntry[] {
  return [...entries].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod;
    return a.id.localeCompare(b.id);
  });
}

/** Utility to roll a single die from combat helpers. */
export { rollDie };
