import { rollDie } from './dice';
import { hitDieFaces } from './hitPoints';
import { restoreAllSpellSlots } from './spellcasting';
import type { HitDie, Random, SpellSlots } from './types';
import { defaultRandom } from './types';

/**
 * A pool of hit dice is tracked per character. Level = total hit dice.
 * Short rest: spend any number of available dice, roll each and add CON mod (min 1 per die).
 * Long rest: restore half of max hit dice (rounded down, min 1), full HP, all spell slots.
 */

export interface HitDiceState {
  die: HitDie;
  max: number;
  available: number;
}

export interface ShortRestInput {
  hitDice: HitDiceState;
  diceToSpend: number;
  conMod: number;
  currentHP: number;
  maxHP: number;
}

export interface ShortRestResult {
  hitDice: HitDiceState;
  hpGained: number;
  newCurrentHP: number;
  rolls: number[];
}

export function takeShortRest(input: ShortRestInput, rng: Random = defaultRandom): ShortRestResult {
  if (input.diceToSpend < 0) throw new Error('diceToSpend cannot be negative');
  if (input.diceToSpend > input.hitDice.available) {
    throw new Error(
      `Cannot spend ${input.diceToSpend} dice, only ${input.hitDice.available} available`,
    );
  }
  const faces = hitDieFaces(input.hitDice.die);
  const rolls: number[] = [];
  let hpGained = 0;
  for (let i = 0; i < input.diceToSpend; i++) {
    const roll = rollDie(faces as 4 | 6 | 8 | 10 | 12, rng);
    rolls.push(roll);
    hpGained += Math.max(1, roll + input.conMod);
  }
  const newCurrentHP = Math.min(input.maxHP, input.currentHP + hpGained);
  return {
    hitDice: { ...input.hitDice, available: input.hitDice.available - input.diceToSpend },
    hpGained,
    newCurrentHP,
    rolls,
  };
}

export interface LongRestInput {
  hitDice: HitDiceState;
  maxHP: number;
  spellSlots: SpellSlots;
  /** Current exhaustion level (0..6). Long rest reduces by 1 if character has had food/water. */
  exhaustionLevel?: number;
  /** Whether the character had sufficient food and water. */
  hadSustenance?: boolean;
}

export interface LongRestResult {
  hitDice: HitDiceState;
  newCurrentHP: number;
  spellSlots: SpellSlots;
  exhaustionLevel: number;
}

/**
 * Long rest (dnd5e_rules.md §7.11):
 *   - HP restored to max
 *   - Half max hit dice restored (rounded down, min 1)
 *   - All spell slots restored
 *   - Exhaustion reduced by 1 (if food + water)
 */
export function takeLongRest(input: LongRestInput): LongRestResult {
  const recoveredDice = Math.max(1, Math.floor(input.hitDice.max / 2));
  const available = Math.min(input.hitDice.max, input.hitDice.available + recoveredDice);
  const exhaustion = input.exhaustionLevel ?? 0;
  const hadSustenance = input.hadSustenance ?? true;
  const newExhaustion = hadSustenance ? Math.max(0, exhaustion - 1) : exhaustion;
  return {
    hitDice: { ...input.hitDice, available },
    newCurrentHP: input.maxHP,
    spellSlots: restoreAllSpellSlots(input.spellSlots),
    exhaustionLevel: newExhaustion,
  };
}
