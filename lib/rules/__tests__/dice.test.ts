import { describe, expect, it } from 'vitest';
import {
  isNatural1,
  isNatural20,
  parseDiceExpression,
  resolveAdvantage,
  rollD20,
  rollDie,
  rollExpression,
} from '../dice';
import { seededRandom } from '../types';

describe('parseDiceExpression', () => {
  it('parses single die without count', () => {
    expect(parseDiceExpression('d20')).toEqual({ count: 1, faces: 20, modifier: 0 });
  });

  it('parses multiple dice', () => {
    expect(parseDiceExpression('2d6')).toEqual({ count: 2, faces: 6, modifier: 0 });
  });

  it('parses positive modifier', () => {
    expect(parseDiceExpression('1d20+5')).toEqual({ count: 1, faces: 20, modifier: 5 });
  });

  it('parses negative modifier', () => {
    expect(parseDiceExpression('1d20-2')).toEqual({ count: 1, faces: 20, modifier: -2 });
  });

  it('tolerates whitespace', () => {
    expect(parseDiceExpression('  3d8  +  4  ')).toEqual({ count: 3, faces: 8, modifier: 4 });
  });

  it('rejects invalid faces', () => {
    expect(() => parseDiceExpression('1d7')).toThrow();
  });

  it('rejects zero dice', () => {
    expect(() => parseDiceExpression('0d20')).toThrow();
  });
});

describe('rollDie', () => {
  it('returns value in [1, faces]', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rollDie(20, rng);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('is deterministic with seeded rng', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect(rollDie(20, a)).toBe(rollDie(20, b));
  });
});

describe('rollExpression', () => {
  it('sums dice + modifier', () => {
    const rng = seededRandom(99);
    const result = rollExpression('2d6+3', rng);
    expect(result.dice).toHaveLength(2);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(result.dice.reduce((a, b) => a + b, 0) + 3);
  });
});

describe('resolveAdvantage', () => {
  it('returns normal with no sources', () => {
    expect(resolveAdvantage(0, 0)).toBe('normal');
  });
  it('returns advantage with only advantage sources', () => {
    expect(resolveAdvantage(3, 0)).toBe('advantage');
  });
  it('returns disadvantage with only disadvantage sources', () => {
    expect(resolveAdvantage(0, 2)).toBe('disadvantage');
  });
  it('cancels mixed sources regardless of count', () => {
    expect(resolveAdvantage(5, 1)).toBe('normal');
    expect(resolveAdvantage(1, 5)).toBe('normal');
  });
});

describe('rollD20', () => {
  it('normal: single roll', () => {
    const rng = seededRandom(3);
    const r = rollD20(5, 'normal', rng);
    expect(r.rawRolls).toHaveLength(1);
    expect(r.total).toBe(r.roll + 5);
  });

  it('advantage: keeps higher of two', () => {
    // Deterministic: force a high then low roll by seed
    const rng = seededRandom(1);
    const r = rollD20(0, 'advantage', rng);
    expect(r.rawRolls).toHaveLength(2);
    const [a, b] = r.rawRolls;
    expect(r.roll).toBe(Math.max(a as number, b as number));
  });

  it('disadvantage: keeps lower of two', () => {
    const rng = seededRandom(2);
    const r = rollD20(0, 'disadvantage', rng);
    expect(r.rawRolls).toHaveLength(2);
    const [a, b] = r.rawRolls;
    expect(r.roll).toBe(Math.min(a as number, b as number));
  });

  it('adds modifier to total', () => {
    const rng = seededRandom(4);
    const r = rollD20(7, 'normal', rng);
    expect(r.total).toBe(r.roll + 7);
  });
});

describe('isNatural20 / isNatural1', () => {
  it('detects natural 20', () => {
    expect(
      isNatural20({
        roll: 20,
        rawRolls: [20],
        effectiveAdvantage: 'normal',
        modifier: 0,
        total: 20,
      }),
    ).toBe(true);
    expect(
      isNatural20({
        roll: 19,
        rawRolls: [19],
        effectiveAdvantage: 'normal',
        modifier: 0,
        total: 19,
      }),
    ).toBe(false);
  });
  it('detects natural 1', () => {
    expect(
      isNatural1({ roll: 1, rawRolls: [1], effectiveAdvantage: 'normal', modifier: 0, total: 1 }),
    ).toBe(true);
    expect(
      isNatural1({ roll: 2, rawRolls: [2], effectiveAdvantage: 'normal', modifier: 0, total: 2 }),
    ).toBe(false);
  });
});
