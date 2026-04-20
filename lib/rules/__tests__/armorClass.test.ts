import { describe, expect, it } from 'vitest';
import { calculateAC } from '../armorClass';

describe('calculateAC', () => {
  it('unarmored = 10 + DEX', () => {
    expect(calculateAC({ dexMod: 3 })).toBe(13);
  });

  it('unarmored with shield = 10 + DEX + 2', () => {
    expect(calculateAC({ dexMod: 2, shieldBonus: 2 })).toBe(14);
  });

  it('light armor (leather 11): base + full DEX', () => {
    expect(
      calculateAC({
        dexMod: 4,
        armor: { category: 'light', baseAC: 11 },
      }),
    ).toBe(15);
  });

  it('medium armor caps DEX at 2', () => {
    expect(
      calculateAC({
        dexMod: 5,
        armor: { category: 'medium', baseAC: 14, maxDexBonus: 2 },
      }),
    ).toBe(16);
  });

  it('medium armor with low DEX still uses actual DEX if under cap', () => {
    expect(
      calculateAC({
        dexMod: 1,
        armor: { category: 'medium', baseAC: 14, maxDexBonus: 2 },
      }),
    ).toBe(15);
  });

  it('heavy armor ignores DEX completely', () => {
    expect(
      calculateAC({
        dexMod: 5,
        armor: { category: 'heavy', baseAC: 18, maxDexBonus: 0 },
      }),
    ).toBe(18);
  });

  it('heavy armor + shield stacks', () => {
    expect(
      calculateAC({
        dexMod: 0,
        armor: { category: 'heavy', baseAC: 18, maxDexBonus: 0 },
        shieldBonus: 2,
      }),
    ).toBe(20);
  });

  it('otherBonus adds on top', () => {
    expect(
      calculateAC({
        dexMod: 2,
        armor: { category: 'light', baseAC: 11 },
        shieldBonus: 2,
        otherBonus: 1,
      }),
    ).toBe(16);
  });

  it('negative DEX penalises unarmored AC', () => {
    expect(calculateAC({ dexMod: -2 })).toBe(8);
  });
});
