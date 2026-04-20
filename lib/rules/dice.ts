import { type AdvantageState, defaultRandom, type Random } from './types';

export const DIE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieFaces = (typeof DIE_FACES)[number];

export interface DiceExpression {
  count: number;
  faces: DieFaces;
  modifier: number;
}

const DICE_RE = /^\s*(\d*)d(4|6|8|10|12|20|100)\s*(?:([+-])\s*(\d+))?\s*$/i;

export function parseDiceExpression(expression: string): DiceExpression {
  const match = DICE_RE.exec(expression);
  if (!match) {
    throw new Error(`Invalid dice expression: "${expression}"`);
  }
  const countStr = match[1];
  const facesStr = match[2];
  const sign = match[3];
  const modStr = match[4];
  if (facesStr === undefined) {
    throw new Error(`Invalid dice expression: "${expression}"`);
  }
  const count = countStr === undefined || countStr === '' ? 1 : Number.parseInt(countStr, 10);
  const faces = Number.parseInt(facesStr, 10) as DieFaces;
  const modifier = modStr === undefined ? 0 : Number.parseInt(modStr, 10) * (sign === '-' ? -1 : 1);
  if (count < 1 || count > 100) {
    throw new Error(`Dice count out of range: ${count}`);
  }
  return { count, faces, modifier };
}

export function rollDie(faces: DieFaces, rng: Random = defaultRandom): number {
  return 1 + Math.floor(rng() * faces);
}

export interface RollResult {
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
}

export function rollExpression(expression: string, rng: Random = defaultRandom): RollResult {
  const parsed = parseDiceExpression(expression);
  const dice: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    dice.push(rollDie(parsed.faces, rng));
  }
  const sum = dice.reduce((a, b) => a + b, 0);
  return { expression, dice, modifier: parsed.modifier, total: sum + parsed.modifier };
}

export interface D20Roll {
  /** Kept roll after advantage/disadvantage resolution (1..20). */
  roll: number;
  /** Both raw rolls if advantage/disadvantage, otherwise length 1. */
  rawRolls: number[];
  /** Advantage/disadvantage state that was effectively applied. */
  effectiveAdvantage: AdvantageState;
  modifier: number;
  total: number;
}

/**
 * Collapse multiple advantage/disadvantage sources per PHB rules:
 * - any number of advantage sources without disadvantage → advantage
 * - any number of disadvantage sources without advantage → disadvantage
 * - any advantage AND any disadvantage, regardless of count → normal (cancel)
 */
export function resolveAdvantage(
  advantageSources: number,
  disadvantageSources: number,
): AdvantageState {
  const adv = advantageSources > 0;
  const dis = disadvantageSources > 0;
  if (adv && dis) return 'normal';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'normal';
}

export function rollD20(
  modifier: number,
  advantage: AdvantageState = 'normal',
  rng: Random = defaultRandom,
): D20Roll {
  if (advantage === 'normal') {
    const roll = rollDie(20, rng);
    return {
      roll,
      rawRolls: [roll],
      effectiveAdvantage: 'normal',
      modifier,
      total: roll + modifier,
    };
  }
  const a = rollDie(20, rng);
  const b = rollDie(20, rng);
  const roll = advantage === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  return {
    roll,
    rawRolls: [a, b],
    effectiveAdvantage: advantage,
    modifier,
    total: roll + modifier,
  };
}

export function isNatural20(r: D20Roll): boolean {
  return r.roll === 20;
}

export function isNatural1(r: D20Roll): boolean {
  return r.roll === 1;
}
