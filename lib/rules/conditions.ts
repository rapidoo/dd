import type { Condition, ConditionType } from './types';

export interface ConditionEffects {
  /** Attack rolls against this creature have advantage. */
  attackRollsAgainstAdvantage?: boolean;
  /** Attack rolls against this creature have disadvantage. */
  attackRollsAgainstDisadvantage?: boolean;
  /** Creature's own attack rolls are at disadvantage. */
  ownAttacksDisadvantage?: boolean;
  /** Auto-fails STR saves. */
  autoFailStrSave?: boolean;
  /** Auto-fails DEX saves. */
  autoFailDexSave?: boolean;
  /** Cannot take actions or reactions. */
  incapacitated?: boolean;
  /** Speed becomes 0. */
  speedZero?: boolean;
  /** Breaks concentration immediately. */
  breaksConcentration?: boolean;
  /** Attacks within 5 feet gain advantage; attacks beyond suffer disadvantage (prone rule). */
  proneAttackMod?: boolean;
}

/**
 * Aggregate effects for each official condition (dnd5e_rules.md §9).
 * Exhaustion is handled separately (`exhaustion.ts` is not needed — tracked as int 0–6 on character).
 */
export const CONDITION_EFFECTS: Record<ConditionType, ConditionEffects> = {
  prone: { ownAttacksDisadvantage: true, proneAttackMod: true },
  grappled: { speedZero: true },
  blinded: {
    attackRollsAgainstAdvantage: true,
    ownAttacksDisadvantage: true,
  },
  deafened: {},
  charmed: {},
  poisoned: { ownAttacksDisadvantage: true },
  restrained: {
    attackRollsAgainstAdvantage: true,
    ownAttacksDisadvantage: true,
    autoFailDexSave: false,
    speedZero: true,
  },
  stunned: {
    incapacitated: true,
    attackRollsAgainstAdvantage: true,
    autoFailStrSave: true,
    autoFailDexSave: true,
  },
  unconscious: {
    incapacitated: true,
    attackRollsAgainstAdvantage: true,
    autoFailStrSave: true,
    autoFailDexSave: true,
    speedZero: true,
    breaksConcentration: true,
  },
  incapacitated: { incapacitated: true, breaksConcentration: true },
  invisible: {
    attackRollsAgainstDisadvantage: true,
  },
  paralyzed: {
    incapacitated: true,
    attackRollsAgainstAdvantage: true,
    autoFailStrSave: true,
    autoFailDexSave: true,
    speedZero: true,
  },
  petrified: {
    incapacitated: true,
    attackRollsAgainstAdvantage: true,
    autoFailStrSave: true,
    autoFailDexSave: true,
    speedZero: true,
    breaksConcentration: true,
  },
  frightened: {
    ownAttacksDisadvantage: true,
  },
};

export function addCondition(existing: Condition[], condition: Condition): Condition[] {
  if (existing.some((c) => c.type === condition.type)) {
    // Refresh duration if re-applied; keep existing otherwise.
    return existing.map((c) =>
      c.type === condition.type
        ? { ...c, durationRounds: condition.durationRounds ?? c.durationRounds }
        : c,
    );
  }
  return [...existing, condition];
}

export function removeCondition(existing: Condition[], type: ConditionType): Condition[] {
  return existing.filter((c) => c.type !== type);
}

export function hasCondition(conditions: Condition[], type: ConditionType): boolean {
  return conditions.some((c) => c.type === type);
}

/** Decrement all durationRounds, dropping conditions whose counter reaches 0. */
export function tickConditions(conditions: Condition[], rounds = 1): Condition[] {
  const out: Condition[] = [];
  for (const c of conditions) {
    if (c.durationRounds === undefined) {
      out.push(c);
      continue;
    }
    const remaining = c.durationRounds - rounds;
    if (remaining > 0) {
      out.push({ ...c, durationRounds: remaining });
    }
  }
  return out;
}

export interface AggregatedEffects {
  attackRollsAgainstAdvantage: boolean;
  attackRollsAgainstDisadvantage: boolean;
  ownAttacksDisadvantage: boolean;
  autoFailStrSave: boolean;
  autoFailDexSave: boolean;
  incapacitated: boolean;
  speedZero: boolean;
  breaksConcentration: boolean;
}

/** Aggregate effects from all active conditions (OR-combined booleans). */
export function aggregateEffects(conditions: Condition[]): AggregatedEffects {
  const agg: AggregatedEffects = {
    attackRollsAgainstAdvantage: false,
    attackRollsAgainstDisadvantage: false,
    ownAttacksDisadvantage: false,
    autoFailStrSave: false,
    autoFailDexSave: false,
    incapacitated: false,
    speedZero: false,
    breaksConcentration: false,
  };
  for (const c of conditions) {
    const e = CONDITION_EFFECTS[c.type];
    if (e.attackRollsAgainstAdvantage) agg.attackRollsAgainstAdvantage = true;
    if (e.attackRollsAgainstDisadvantage) agg.attackRollsAgainstDisadvantage = true;
    if (e.ownAttacksDisadvantage) agg.ownAttacksDisadvantage = true;
    if (e.autoFailStrSave) agg.autoFailStrSave = true;
    if (e.autoFailDexSave) agg.autoFailDexSave = true;
    if (e.incapacitated) agg.incapacitated = true;
    if (e.speedZero) agg.speedZero = true;
    if (e.breaksConcentration) agg.breaksConcentration = true;
  }
  return agg;
}

/**
 * Exhaustion ladder (dnd5e_rules.md §9.1). Level 0–6. Level 6 = death.
 */
export interface ExhaustionEffects {
  level: number;
  disadvantageOnChecks: boolean;
  speedHalved: boolean;
  disadvantageOnAttacksAndSaves: boolean;
  hpMaxHalved: boolean;
  speedZero: boolean;
  dead: boolean;
}

export function exhaustionEffects(level: number): ExhaustionEffects {
  if (!Number.isInteger(level) || level < 0 || level > 6) {
    throw new Error(`Exhaustion level out of range [0,6]: ${level}`);
  }
  return {
    level,
    disadvantageOnChecks: level >= 1,
    speedHalved: level >= 2,
    disadvantageOnAttacksAndSaves: level >= 3,
    hpMaxHalved: level >= 4,
    speedZero: level >= 5,
    dead: level >= 6,
  };
}
