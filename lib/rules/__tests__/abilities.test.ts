import { describe, expect, it } from 'vitest';
import { getAbilityModifier, getAllModifiers, passiveScore } from '../abilities';

describe('getAbilityModifier', () => {
  const table: Array<[number, number]> = [
    [1, -5],
    [2, -4],
    [3, -4],
    [4, -3],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 2],
    [15, 2],
    [16, 3],
    [17, 3],
    [18, 4],
    [19, 4],
    [20, 5],
    [30, 10],
  ];

  for (const [score, mod] of table) {
    it(`maps ${score} → ${mod}`, () => {
      expect(getAbilityModifier(score)).toBe(mod);
    });
  }

  it('throws on below range', () => {
    expect(() => getAbilityModifier(0)).toThrow();
  });
  it('throws on above range', () => {
    expect(() => getAbilityModifier(31)).toThrow();
  });
  it('throws on non-integer', () => {
    expect(() => getAbilityModifier(10.5)).toThrow();
  });
});

describe('getAllModifiers', () => {
  it('maps all six abilities', () => {
    expect(getAllModifiers({ str: 16, dex: 14, con: 13, int: 10, wis: 12, cha: 8 })).toEqual({
      str: 3,
      dex: 2,
      con: 1,
      int: 0,
      wis: 1,
      cha: -1,
    });
  });
});

describe('passiveScore', () => {
  it('is 10 with no modifiers', () => {
    expect(passiveScore()).toBe(10);
  });
  it('adds mods', () => {
    expect(passiveScore(3, 2)).toBe(15);
  });
});
