import { describe, expect, it } from 'vitest';
import { getStartingSpells, isSpellcaster } from '../spells';

describe('starting spells — D&D 5e', () => {
  it('wizard gets 3 cantrips and several level 1 spells', () => {
    const spells = getStartingSpells('dnd5e', 'wizard');
    const cantrips = spells.filter((s) => s.level === 0);
    const level1 = spells.filter((s) => s.level === 1);
    expect(cantrips.length).toBeGreaterThanOrEqual(3);
    expect(level1.length).toBeGreaterThanOrEqual(4);
    expect(spells.find((s) => s.id === 'magic-missile')).toBeDefined();
  });

  it('cleric gets healing spells', () => {
    const spells = getStartingSpells('dnd5e', 'cleric');
    expect(spells.find((s) => s.id === 'cure-wounds')).toBeDefined();
  });

  it('warlock gets eldritch blast', () => {
    const spells = getStartingSpells('dnd5e', 'warlock');
    expect(spells.find((s) => s.id === 'eldritch-blast')).toBeDefined();
  });

  it('fighter and barbarian have no starting spells', () => {
    expect(getStartingSpells('dnd5e', 'fighter')).toEqual([]);
    expect(getStartingSpells('dnd5e', 'barbarian')).toEqual([]);
  });

  it('paladin and ranger have no spells at level 1', () => {
    // Per PHB they only get spells at level 2.
    expect(getStartingSpells('dnd5e', 'paladin')).toEqual([]);
    expect(getStartingSpells('dnd5e', 'ranger')).toEqual([]);
  });
});

describe('starting spells — Witcher', () => {
  it('sorceleur gets the 5 signs as cantrips', () => {
    const spells = getStartingSpells('witcher', 'witcher');
    const ids = spells.map((s) => s.id).sort();
    expect(ids).toEqual(['aard', 'axii', 'igni', 'quen', 'yrden']);
    expect(spells.every((s) => s.level === 0)).toBe(true);
  });

  it('mage gets cantrips and level 1 spells', () => {
    const spells = getStartingSpells('witcher', 'mage');
    expect(spells.length).toBeGreaterThan(0);
    expect(spells.some((s) => s.level === 1)).toBe(true);
  });

  it('alchemist has no spells (uses potions instead)', () => {
    expect(getStartingSpells('witcher', 'alchemist')).toEqual([]);
  });
});

describe('starting spells — Naheulbeuk', () => {
  it('magicien (wizard) gets a humorous spell list', () => {
    const spells = getStartingSpells('naheulbeuk', 'wizard');
    expect(spells.length).toBeGreaterThan(0);
    expect(spells.find((s) => s.id === 'etincelle')).toBeDefined();
  });

  it('cleric gets healing-style spells', () => {
    const spells = getStartingSpells('naheulbeuk', 'cleric');
    expect(spells.find((s) => s.id === 'soin-mediocre')).toBeDefined();
  });

  it('barbarian has no spells', () => {
    expect(getStartingSpells('naheulbeuk', 'barbarian')).toEqual([]);
  });
});

describe('isSpellcaster', () => {
  it('returns true for caster classes', () => {
    expect(isSpellcaster('dnd5e', 'wizard')).toBe(true);
    expect(isSpellcaster('witcher', 'witcher')).toBe(true);
    expect(isSpellcaster('naheulbeuk', 'cleric')).toBe(true);
  });

  it('returns false for non-caster classes', () => {
    expect(isSpellcaster('dnd5e', 'fighter')).toBe(false);
    expect(isSpellcaster('dnd5e', 'paladin')).toBe(false);
    expect(isSpellcaster('witcher', 'warrior')).toBe(false);
    expect(isSpellcaster('naheulbeuk', 'rogue')).toBe(false);
  });
});
