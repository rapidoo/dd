import { describe, expect, it } from 'vitest';
import { ASI_LEVELS, grantsASI, levelFromXP, xpToReach } from '../leveling';

describe('xpToReach', () => {
  const cases: Array<[number, number]> = [
    [1, 0],
    [2, 300],
    [5, 6500],
    [10, 64000],
    [20, 355000],
  ];
  for (const [lvl, xp] of cases) {
    it(`level ${lvl} → ${xp} XP`, () => {
      expect(xpToReach(lvl)).toBe(xp);
    });
  }
  it('rejects invalid level', () => {
    expect(() => xpToReach(0)).toThrow();
    expect(() => xpToReach(21)).toThrow();
  });
});

describe('levelFromXP', () => {
  const cases: Array<[number, number]> = [
    [0, 1],
    [299, 1],
    [300, 2],
    [2700, 4],
    [2699, 3],
    [355000, 20],
    [1000000, 20],
  ];
  for (const [xp, lvl] of cases) {
    it(`${xp} XP → level ${lvl}`, () => {
      expect(levelFromXP(xp)).toBe(lvl);
    });
  }
  it('rejects negative', () => {
    expect(() => levelFromXP(-1)).toThrow();
  });
});

describe('ASI_LEVELS / grantsASI', () => {
  it('contains 4, 8, 12, 16, 19', () => {
    expect(ASI_LEVELS).toEqual([4, 8, 12, 16, 19]);
  });
  it('grantsASI is true only for those levels', () => {
    expect(grantsASI(4)).toBe(true);
    expect(grantsASI(5)).toBe(false);
    expect(grantsASI(19)).toBe(true);
    expect(grantsASI(20)).toBe(false);
  });
});
