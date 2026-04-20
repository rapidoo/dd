import { describe, expect, it } from 'vitest';
import { proficiencyBonus } from '../proficiency';

describe('proficiencyBonus', () => {
  const table: Array<[number, number]> = [
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 3],
    [8, 3],
    [9, 4],
    [10, 4],
    [11, 4],
    [12, 4],
    [13, 5],
    [14, 5],
    [15, 5],
    [16, 5],
    [17, 6],
    [18, 6],
    [19, 6],
    [20, 6],
  ];

  for (const [level, bonus] of table) {
    it(`level ${level} → +${bonus}`, () => {
      expect(proficiencyBonus(level)).toBe(bonus);
    });
  }

  it('rejects level 0', () => {
    expect(() => proficiencyBonus(0)).toThrow();
  });
  it('rejects level 21', () => {
    expect(() => proficiencyBonus(21)).toThrow();
  });
  it('rejects non-integer', () => {
    expect(() => proficiencyBonus(5.5)).toThrow();
  });
});
