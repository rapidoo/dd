export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type Skill =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival';

export type AdvantageState = 'normal' | 'advantage' | 'disadvantage';

export type ConditionType =
  | 'prone'
  | 'grappled'
  | 'blinded'
  | 'deafened'
  | 'charmed'
  | 'poisoned'
  | 'restrained'
  | 'stunned'
  | 'unconscious'
  | 'incapacitated'
  | 'invisible'
  | 'paralyzed'
  | 'petrified'
  | 'frightened';

export const CONDITION_TYPES: readonly ConditionType[] = [
  'prone',
  'grappled',
  'blinded',
  'deafened',
  'charmed',
  'poisoned',
  'restrained',
  'stunned',
  'unconscious',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'frightened',
] as const;

export interface Condition {
  type: ConditionType;
  durationRounds?: number;
  source?: string;
}

export type DamageType =
  | 'bludgeoning'
  | 'piercing'
  | 'slashing'
  | 'acid'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'force'
  | 'necrotic'
  | 'poison'
  | 'psychic'
  | 'radiant'
  | 'thunder';

export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface SpellSlot {
  max: number;
  used: number;
}

export type SpellSlots = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, SpellSlot>>;

export interface DeathSaves {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
}

export interface Concentration {
  active: boolean;
  spellName: string | null;
  level: number | null;
}

export type ArmorCategory = 'none' | 'light' | 'medium' | 'heavy';
export type Resistance = 'vulnerable' | 'resistant' | 'immune' | 'normal';

/**
 * Seedable random number generator — returns a uniform value in [0, 1).
 * Tests pass a seeded RNG; production defaults to Math.random.
 */
export type Random = () => number;

export const defaultRandom: Random = Math.random;

/**
 * mulberry32 — small, fast, good-enough PRNG for deterministic tests.
 */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
