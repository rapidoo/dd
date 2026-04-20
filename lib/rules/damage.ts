import { parseDiceExpression, rollDie } from './dice';
import { type DamageType, defaultRandom, type Random, type Resistance } from './types';

export interface DamageInput {
  /** Dice expression for base damage, e.g. "1d8" or "2d6". Modifier in expression ignored. */
  diceExpression: string;
  /** Ability modifier (e.g. STR/DEX for weapon). NOT doubled on crit. */
  abilityMod: number;
  /** Extra flat bonus (e.g. magic weapon). NOT doubled on crit. */
  otherBonus?: number;
  /** If true, double the dice (not the modifiers) per dnd5e_rules.md §1.3. */
  critical?: boolean;
  damageType: DamageType;
}

export interface DamageResult {
  diceRolled: number[];
  diceTotal: number;
  modifier: number;
  rawTotal: number;
  damageType: DamageType;
  critical: boolean;
}

/**
 * Roll damage. On a crit, roll the dice twice and sum (equivalent to doubling dice).
 * Modifiers (ability + other) are added once, NEVER doubled.
 */
export function rollDamage(input: DamageInput, rng: Random = defaultRandom): DamageResult {
  const parsed = parseDiceExpression(input.diceExpression);
  const critical = input.critical ?? false;
  const count = critical ? parsed.count * 2 : parsed.count;
  const diceRolled: number[] = [];
  for (let i = 0; i < count; i++) {
    diceRolled.push(rollDie(parsed.faces, rng));
  }
  const diceTotal = diceRolled.reduce((a, b) => a + b, 0);
  const modifier = input.abilityMod + (input.otherBonus ?? 0);
  const rawTotal = Math.max(0, diceTotal + modifier);
  return {
    diceRolled,
    diceTotal,
    modifier,
    rawTotal,
    damageType: input.damageType,
    critical,
  };
}

/**
 * Apply resistance/vulnerability/immunity to a raw damage value.
 * Immune → 0. Resistant → floor(dmg/2). Vulnerable → dmg × 2. Normal → unchanged.
 */
export function applyResistance(amount: number, resistance: Resistance): number {
  if (amount < 0) return 0;
  switch (resistance) {
    case 'immune':
      return 0;
    case 'resistant':
      return Math.floor(amount / 2);
    case 'vulnerable':
      return amount * 2;
    default:
      return amount;
  }
}

/**
 * Combine all steps: roll damage → apply resistance → return final integer damage.
 */
export function resolveDamage(
  input: DamageInput,
  resistance: Resistance = 'normal',
  rng: Random = defaultRandom,
): { roll: DamageResult; finalAmount: number } {
  const roll = rollDamage(input, rng);
  const finalAmount = applyResistance(roll.rawTotal, resistance);
  return { roll, finalAmount };
}
