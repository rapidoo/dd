import { describe, expect, it } from 'vitest';
import { applySpeciesBonuses, deriveCharacter } from '../derivations';

const BASE = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

describe('applySpeciesBonuses', () => {
  it('human gets +1 to every ability', () => {
    expect(applySpeciesBonuses(BASE, 'human')).toEqual({
      str: 16,
      dex: 15,
      con: 14,
      int: 13,
      wis: 11,
      cha: 9,
    });
  });

  it('elf gets +2 DEX', () => {
    expect(applySpeciesBonuses(BASE, 'elf').dex).toBe(16);
  });

  it('clamps at 30', () => {
    expect(applySpeciesBonuses({ ...BASE, con: 29 }, 'dwarf').con).toBe(30);
  });

  it('throws on unknown species', () => {
    expect(() => applySpeciesBonuses(BASE, 'nope')).toThrow();
  });
});

describe('deriveCharacter', () => {
  it('fighter human level 1: HP + AC + prof', () => {
    const d = deriveCharacter({
      classId: 'fighter',
      speciesId: 'human',
      level: 1,
      abilityScores: BASE,
      skillProficiencies: ['athletics', 'perception'],
    });
    // human +1 CON → 14 → mod +2 ; d10 hit die L1 → 10 + 2 = 12
    expect(d.maxHP).toBe(12);
    // AC 10 + DEX mod (human +1 → 15 → +2) = 12
    expect(d.ac).toBe(12);
    expect(d.proficiencyBonus).toBe(2);
    expect(d.initiative).toBe(2);
    expect(d.spellSaveDC).toBeNull();
    expect(d.spellAttackBonus).toBeNull();
    expect(d.spellSlots).toEqual({});
    expect(d.hitDie).toBe('d10');
    // WIS 10 → +1 (human) = 11 → mod 0; 10 + 0 + prof 2 = 12
    expect(d.passivePerception).toBe(12);
  });

  it('wizard elf level 5: spell slots + DC', () => {
    const d = deriveCharacter({
      classId: 'wizard',
      speciesId: 'elf',
      level: 5,
      abilityScores: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
      skillProficiencies: ['arcana', 'history'],
    });
    // elf +2 DEX → 16, INT 16 (no bonus) mod +3 ; prof L5 → +3 ; DC = 8 + 3 + 3 = 14
    expect(d.spellSaveDC).toBe(14);
    expect(d.spellAttackBonus).toBe(6);
    expect(d.spellSlots[3]?.max).toBe(2);
    expect(d.hitDie).toBe('d6');
    expect(d.proficiencyBonus).toBe(3);
  });

  it('paladin half-caster L5 has level-2 slots', () => {
    const d = deriveCharacter({
      classId: 'paladin',
      speciesId: 'human',
      level: 5,
      abilityScores: BASE,
      skillProficiencies: ['athletics', 'religion'],
    });
    expect(d.spellSlots[1]?.max).toBe(4);
    expect(d.spellSlots[2]?.max).toBe(2);
  });

  it('passive perception adds prof if proficient', () => {
    const d1 = deriveCharacter({
      classId: 'fighter',
      speciesId: 'human',
      level: 1,
      abilityScores: BASE,
      skillProficiencies: ['perception'],
    });
    const d2 = deriveCharacter({
      classId: 'fighter',
      speciesId: 'human',
      level: 1,
      abilityScores: BASE,
      skillProficiencies: ['athletics'],
    });
    expect(d1.passivePerception).toBe(d2.passivePerception + 2);
  });

  it('throws on unknown class', () => {
    expect(() =>
      deriveCharacter({
        classId: 'nope',
        speciesId: 'human',
        level: 1,
        abilityScores: BASE,
        skillProficiencies: [],
      }),
    ).toThrow();
  });
});
