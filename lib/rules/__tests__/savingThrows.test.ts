import { describe, expect, it } from 'vitest';
import { rollSavingThrow } from '../savingThrows';
import { type Random, seededRandom } from '../types';

/** Deterministic mock rng that returns values that produce specific d20 rolls. */
function fixedD20(...values: number[]): Random {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    if (v === undefined) throw new Error('no more fixed values');
    i++;
    return (v - 1) / 20 + 0.0001; // maps to floor(rng * 20) + 1 = v
  };
}

describe('rollSavingThrow', () => {
  it('succeeds when total >= DC (proficient)', () => {
    const rng = fixedD20(15);
    const r = rollSavingThrow({ abilityMod: 2, profBonus: 2, proficient: true, dc: 15 }, rng);
    expect(r.roll).toBe(15);
    expect(r.total).toBe(19);
    expect(r.success).toBe(true);
  });

  it('fails when total < DC', () => {
    const rng = fixedD20(5);
    const r = rollSavingThrow({ abilityMod: 1, profBonus: 2, proficient: false, dc: 15 }, rng);
    expect(r.total).toBe(6);
    expect(r.success).toBe(false);
  });

  it('respects advantage by rolling 2d20', () => {
    const rng = seededRandom(1);
    const r = rollSavingThrow(
      { abilityMod: 0, profBonus: 0, proficient: false, dc: 10, advantage: 'advantage' },
      rng,
    );
    expect(r.rawRolls).toHaveLength(2);
  });

  it('flags natural 20', () => {
    const rng = fixedD20(20);
    const r = rollSavingThrow({ abilityMod: 0, profBonus: 0, proficient: false, dc: 30 }, rng);
    expect(r.naturalTwenty).toBe(true);
  });

  it('flags natural 1', () => {
    const rng = fixedD20(1);
    const r = rollSavingThrow({ abilityMod: 10, profBonus: 0, proficient: false, dc: 10 }, rng);
    expect(r.naturalOne).toBe(true);
    // Per core rules, nat 1 does not auto-fail a save — success flag follows math
    expect(r.success).toBe(true);
  });

  it('adds otherBonus to total', () => {
    const rng = fixedD20(10);
    const r = rollSavingThrow(
      { abilityMod: 0, profBonus: 2, proficient: true, otherBonus: 3, dc: 10 },
      rng,
    );
    expect(r.total).toBe(15);
  });
});
