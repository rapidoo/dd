import { describe, expect, it } from 'vitest';
import { takeLongRest, takeShortRest } from '../rest';
import { seededRandom } from '../types';

describe('takeShortRest', () => {
  it('spends dice, adds CON mod (min 1 per die)', () => {
    const rng = seededRandom(1);
    const r = takeShortRest(
      {
        hitDice: { die: 'd8', max: 5, available: 3 },
        diceToSpend: 2,
        conMod: 2,
        currentHP: 10,
        maxHP: 40,
      },
      rng,
    );
    expect(r.hitDice.available).toBe(1);
    expect(r.hpGained).toBe(r.rolls.reduce((a, b) => a + Math.max(1, b + 2), 0));
  });

  it('negative CON still floors each spent die at 1 HP', () => {
    const rng = seededRandom(42);
    const r = takeShortRest(
      {
        hitDice: { die: 'd6', max: 3, available: 3 },
        diceToSpend: 3,
        conMod: -10,
        currentHP: 5,
        maxHP: 50,
      },
      rng,
    );
    expect(r.hpGained).toBeGreaterThanOrEqual(3);
  });

  it('clamps HP to max', () => {
    const rng = seededRandom(3);
    const r = takeShortRest(
      {
        hitDice: { die: 'd12', max: 10, available: 10 },
        diceToSpend: 10,
        conMod: 5,
        currentHP: 50,
        maxHP: 60,
      },
      rng,
    );
    expect(r.newCurrentHP).toBe(60);
  });

  it('rejects spending more than available', () => {
    expect(() =>
      takeShortRest({
        hitDice: { die: 'd8', max: 5, available: 2 },
        diceToSpend: 3,
        conMod: 0,
        currentHP: 5,
        maxHP: 40,
      }),
    ).toThrow();
  });

  it('rejects negative diceToSpend', () => {
    expect(() =>
      takeShortRest({
        hitDice: { die: 'd8', max: 5, available: 2 },
        diceToSpend: -1,
        conMod: 0,
        currentHP: 5,
        maxHP: 40,
      }),
    ).toThrow();
  });
});

describe('takeLongRest', () => {
  it('restores all spell slots', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 5, available: 2 },
      maxHP: 40,
      spellSlots: {
        1: { max: 4, used: 4 },
        2: { max: 3, used: 2 },
      },
    });
    expect(r.spellSlots[1]?.used).toBe(0);
    expect(r.spellSlots[2]?.used).toBe(0);
  });

  it('restores half max hit dice, clamped to max', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 8, available: 1 },
      maxHP: 40,
      spellSlots: {},
    });
    expect(r.hitDice.available).toBe(5); // 1 + floor(8/2)
  });

  it('min 1 hit die restored', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 1, available: 0 },
      maxHP: 8,
      spellSlots: {},
    });
    expect(r.hitDice.available).toBe(1);
  });

  it('heals to max', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 4, available: 2 },
      maxHP: 32,
      spellSlots: {},
    });
    expect(r.newCurrentHP).toBe(32);
  });

  it('reduces exhaustion by 1 when fed', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 4, available: 2 },
      maxHP: 32,
      spellSlots: {},
      exhaustionLevel: 3,
      hadSustenance: true,
    });
    expect(r.exhaustionLevel).toBe(2);
  });

  it('does not reduce exhaustion without food/water', () => {
    const r = takeLongRest({
      hitDice: { die: 'd8', max: 4, available: 2 },
      maxHP: 32,
      spellSlots: {},
      exhaustionLevel: 3,
      hadSustenance: false,
    });
    expect(r.exhaustionLevel).toBe(3);
  });
});
