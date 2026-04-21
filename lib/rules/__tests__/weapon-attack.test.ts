import { describe, expect, it } from 'vitest';
import type { CharacterRow } from '../../db/types';
import { weaponAttack } from '../weapon-attack';

function mkCharacter(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    id: 'c1',
    campaign_id: 'camp1',
    owner_id: 'u1',
    name: 'Razmoo',
    species: 'dwarf',
    class: 'fighter',
    level: 1,
    str: 16,
    dex: 12,
    con: 14,
    int_score: 8,
    wis: 10,
    cha: 10,
    max_hp: 12,
    current_hp: 12,
    temp_hp: 0,
    ac: 16,
    speed: 7,
    is_ai: false,
    conditions: [],
    spell_slots: {},
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    exhaustion: 0,
    persona: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as CharacterRow;
}

describe('weaponAttack', () => {
  it('returns null for a weapon with no damage dice (pure narrative)', () => {
    expect(weaponAttack(mkCharacter(), { damageDice: '' })).toBeNull();
    expect(weaponAttack(mkCharacter(), null)).toBeNull();
  });

  it('computes STR-based attack for a warhammer on a level-1 fighter STR 16', () => {
    const attack = weaponAttack(mkCharacter(), {
      damageDice: '1d8',
      damageType: 'contondant',
      ability: 'str',
    });
    expect(attack).toEqual({
      toHit: '+5',
      damage: '1d8+3',
      usedAbility: 'str',
      damageType: 'contondant',
    });
  });

  it('computes DEX-based attack for a shortbow', () => {
    const attack = weaponAttack(mkCharacter({ dex: 18 }), {
      damageDice: '1d6',
      damageType: 'perforant',
      ranged: true,
    });
    expect(attack).toEqual({
      toHit: '+6',
      damage: '1d6+4',
      usedAbility: 'dex',
      damageType: 'perforant',
    });
  });

  it('picks DEX for a finesse weapon when DEX > STR', () => {
    const attack = weaponAttack(mkCharacter({ str: 10, dex: 16 }), {
      damageDice: '1d6',
      damageType: 'perforant',
      ability: 'finesse',
    });
    expect(attack?.usedAbility).toBe('dex');
    expect(attack?.toHit).toBe('+5');
    expect(attack?.damage).toBe('1d6+3');
  });

  it('picks STR for a finesse weapon when STR >= DEX', () => {
    const attack = weaponAttack(mkCharacter({ str: 16, dex: 14 }), {
      damageDice: '1d6',
      ability: 'finesse',
    });
    expect(attack?.usedAbility).toBe('str');
    expect(attack?.toHit).toBe('+5');
  });

  it('handles a negative ability modifier (STR 8)', () => {
    const attack = weaponAttack(mkCharacter({ str: 8 }), {
      damageDice: '1d8',
      ability: 'str',
    });
    expect(attack?.toHit).toBe('+1');
    expect(attack?.damage).toBe('1d8-1');
  });

  it('omits the damage modifier when it is zero', () => {
    const attack = weaponAttack(mkCharacter({ str: 10 }), {
      damageDice: '1d8',
      ability: 'str',
    });
    expect(attack?.damage).toBe('1d8');
    expect(attack?.toHit).toBe('+2');
  });

  it('adds proficiency bonus per level', () => {
    const attack = weaponAttack(mkCharacter({ level: 5 }), {
      damageDice: '1d8',
      ability: 'str',
    });
    // prof +3 at level 5, STR mod +3 → +6
    expect(attack?.toHit).toBe('+6');
  });
});
