import { describe, expect, it } from 'vitest';
import {
  availableSlot,
  consumeSpellSlot,
  restoreAllSpellSlots,
  restoreSpellSlot,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsFor,
} from '../spellcasting';

describe('spellSlotsFor', () => {
  it('full caster level 1 has 2 first-level slots', () => {
    const s = spellSlotsFor('full', 1);
    expect(s[1]?.max).toBe(2);
  });

  it('full caster level 5 has 4/3/2 slots', () => {
    const s = spellSlotsFor('full', 5);
    expect(s[1]?.max).toBe(4);
    expect(s[2]?.max).toBe(3);
    expect(s[3]?.max).toBe(2);
  });

  it('full caster level 20 has a 9th-level slot', () => {
    const s = spellSlotsFor('full', 20);
    expect(s[9]?.max).toBe(1);
  });

  it('half caster level 1 has no slots', () => {
    expect(spellSlotsFor('half', 1)).toEqual({});
  });

  it('half caster level 5 has 4/2', () => {
    const s = spellSlotsFor('half', 5);
    expect(s[1]?.max).toBe(4);
    expect(s[2]?.max).toBe(2);
  });

  it('none caster never has slots', () => {
    expect(spellSlotsFor('none', 10)).toEqual({});
  });

  it('rejects level out of range', () => {
    expect(() => spellSlotsFor('full', 0)).toThrow();
    expect(() => spellSlotsFor('full', 21)).toThrow();
  });
});

describe('spellSaveDC / spellAttackBonus', () => {
  it('DC = 8 + prof + ability', () => {
    expect(spellSaveDC({ profBonus: 3, spellAbilityMod: 4 })).toBe(15);
  });

  it('attack = prof + ability', () => {
    expect(spellAttackBonus({ profBonus: 3, spellAbilityMod: 4 })).toBe(7);
  });

  it('otherBonus stacks', () => {
    expect(spellSaveDC({ profBonus: 2, spellAbilityMod: 3, otherBonus: 1 })).toBe(14);
  });
});

describe('consumeSpellSlot', () => {
  it('consumes when available', () => {
    const slots = { 1: { max: 2, used: 0 } };
    const after = consumeSpellSlot(slots, 1);
    expect(after?.[1]?.used).toBe(1);
  });

  it('returns null when no slots left', () => {
    const slots = { 1: { max: 2, used: 2 } };
    expect(consumeSpellSlot(slots, 1)).toBeNull();
  });

  it('returns null when level has no slots', () => {
    expect(consumeSpellSlot({ 1: { max: 2, used: 0 } }, 3)).toBeNull();
  });

  it('does not mutate input', () => {
    const slots = { 1: { max: 2, used: 0 } };
    consumeSpellSlot(slots, 1);
    expect(slots[1]?.used).toBe(0);
  });
});

describe('restoreSpellSlot / restoreAllSpellSlots', () => {
  it('restores one slot', () => {
    const after = restoreSpellSlot({ 1: { max: 3, used: 2 } }, 1);
    expect(after[1]?.used).toBe(1);
  });

  it('does not go below 0', () => {
    const after = restoreSpellSlot({ 1: { max: 3, used: 0 } }, 1, 5);
    expect(after[1]?.used).toBe(0);
  });

  it('long rest restores every level', () => {
    const slots = {
      1: { max: 4, used: 3 },
      2: { max: 3, used: 3 },
      3: { max: 2, used: 1 },
    };
    const after = restoreAllSpellSlots(slots);
    expect(after[1]?.used).toBe(0);
    expect(after[2]?.used).toBe(0);
    expect(after[3]?.used).toBe(0);
  });
});

describe('availableSlot', () => {
  it('true when max > used', () => {
    expect(availableSlot({ 1: { max: 2, used: 1 } }, 1)).toBe(true);
  });
  it('false when exhausted', () => {
    expect(availableSlot({ 1: { max: 2, used: 2 } }, 1)).toBe(false);
  });
  it('false when level absent', () => {
    expect(availableSlot({ 1: { max: 2, used: 0 } }, 5)).toBe(false);
  });
});
