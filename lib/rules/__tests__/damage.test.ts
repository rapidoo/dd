import { describe, expect, it } from 'vitest';
import { applyResistance, resolveDamage, rollDamage } from '../damage';
import { seededRandom } from '../types';

describe('rollDamage', () => {
  it('non-crit rolls dice once and adds modifiers', () => {
    const rng = seededRandom(1);
    const r = rollDamage({ diceExpression: '2d6', abilityMod: 3, damageType: 'slashing' }, rng);
    expect(r.diceRolled).toHaveLength(2);
    expect(r.modifier).toBe(3);
    expect(r.rawTotal).toBe(r.diceTotal + 3);
  });

  it('crit doubles the dice count, NOT the modifier', () => {
    const rng = seededRandom(42);
    const r = rollDamage(
      { diceExpression: '1d8', abilityMod: 5, critical: true, damageType: 'piercing' },
      rng,
    );
    expect(r.diceRolled).toHaveLength(2);
    expect(r.modifier).toBe(5);
    expect(r.rawTotal).toBe(r.diceTotal + 5);
    expect(r.critical).toBe(true);
  });

  it('otherBonus stacks with abilityMod and is not doubled on crit', () => {
    const rng = seededRandom(3);
    const r = rollDamage(
      {
        diceExpression: '1d6',
        abilityMod: 2,
        otherBonus: 1,
        critical: true,
        damageType: 'slashing',
      },
      rng,
    );
    expect(r.modifier).toBe(3);
    expect(r.rawTotal).toBe(r.diceTotal + 3);
  });

  it('clamps negative rawTotal to 0', () => {
    const rng = seededRandom(9);
    const r = rollDamage(
      { diceExpression: '1d4', abilityMod: -10, damageType: 'bludgeoning' },
      rng,
    );
    expect(r.rawTotal).toBe(0);
  });
});

describe('applyResistance', () => {
  it('immune → 0', () => {
    expect(applyResistance(12, 'immune')).toBe(0);
  });
  it('resistant → floor(dmg/2)', () => {
    expect(applyResistance(11, 'resistant')).toBe(5);
  });
  it('vulnerable → dmg×2', () => {
    expect(applyResistance(7, 'vulnerable')).toBe(14);
  });
  it('normal → unchanged', () => {
    expect(applyResistance(7, 'normal')).toBe(7);
  });
  it('negative → 0', () => {
    expect(applyResistance(-3, 'normal')).toBe(0);
  });
});

describe('resolveDamage', () => {
  it('combines roll + resistance', () => {
    const rng = seededRandom(5);
    const { roll, finalAmount } = resolveDamage(
      { diceExpression: '2d6', abilityMod: 4, damageType: 'fire' },
      'resistant',
      rng,
    );
    expect(finalAmount).toBe(Math.floor(roll.rawTotal / 2));
  });
});
