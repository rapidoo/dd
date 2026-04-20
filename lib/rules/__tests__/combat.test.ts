import { describe, expect, it } from 'vitest';
import { rollAttack, rollInitiative, sortInitiative } from '../combat';
import type { Random } from '../types';

function fixedD20(...values: number[]): Random {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    if (v === undefined) throw new Error('no more fixed values');
    i++;
    return (v - 1) / 20 + 0.0001;
  };
}

describe('rollAttack', () => {
  it('natural 20 is crit even against high AC', () => {
    const r = rollAttack(
      { abilityMod: 0, profBonus: 0, proficient: false, targetAC: 30 },
      fixedD20(20),
    );
    expect(r.outcome).toBe('crit');
    expect(r.isCritical).toBe(true);
  });

  it('natural 1 is fumble even with huge bonuses', () => {
    const r = rollAttack(
      { abilityMod: 10, profBonus: 6, proficient: true, otherBonus: 5, targetAC: 5 },
      fixedD20(1),
    );
    expect(r.outcome).toBe('fumble');
    expect(r.isCritical).toBe(false);
  });

  it('hits when total >= AC', () => {
    const r = rollAttack(
      { abilityMod: 3, profBonus: 2, proficient: true, targetAC: 15 },
      fixedD20(10),
    );
    expect(r.total).toBe(15);
    expect(r.outcome).toBe('hit');
  });

  it('misses when total < AC', () => {
    const r = rollAttack(
      { abilityMod: 0, profBonus: 2, proficient: true, targetAC: 18 },
      fixedD20(10),
    );
    expect(r.total).toBe(12);
    expect(r.outcome).toBe('miss');
  });

  it('applies proficiency only when proficient', () => {
    const r1 = rollAttack(
      { abilityMod: 3, profBonus: 2, proficient: true, targetAC: 10 },
      fixedD20(5),
    );
    const r2 = rollAttack(
      { abilityMod: 3, profBonus: 2, proficient: false, targetAC: 10 },
      fixedD20(5),
    );
    expect(r1.modifier).toBe(5);
    expect(r2.modifier).toBe(3);
  });
});

describe('rollInitiative', () => {
  it('adds DEX mod to d20', () => {
    const r = rollInitiative({ dexMod: 4 }, fixedD20(12));
    expect(r.total).toBe(16);
  });
});

describe('sortInitiative', () => {
  it('sorts by total descending', () => {
    const sorted = sortInitiative([
      { id: 'a', total: 10, dexMod: 2 },
      { id: 'b', total: 18, dexMod: 4 },
      { id: 'c', total: 12, dexMod: 1 },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('tie-breaks by dexMod descending', () => {
    const sorted = sortInitiative([
      { id: 'a', total: 15, dexMod: 1 },
      { id: 'b', total: 15, dexMod: 5 },
    ]);
    expect(sorted[0]?.id).toBe('b');
  });

  it('tie-breaks by id when total+dex identical', () => {
    const sorted = sortInitiative([
      { id: 'z', total: 10, dexMod: 2 },
      { id: 'a', total: 10, dexMod: 2 },
    ]);
    expect(sorted[0]?.id).toBe('a');
  });
});
