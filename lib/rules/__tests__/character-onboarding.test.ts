import { describe, expect, it } from 'vitest';
import {
  emptyCurrency,
  getCoinLabel,
  getGoldFormula,
  getStartingKit,
  rollStartingGold,
} from '../character-onboarding';
import { seededRandom } from '../types';

describe('character onboarding — gold formulas', () => {
  it('uses 5d4 × 10 for D&D paladin', () => {
    expect(getGoldFormula('dnd5e', 'paladin')).toEqual({
      dice: '5d4',
      multiplier: 10,
      coin: 'gp',
    });
  });

  it('uses 5d4 × 1 for D&D monk (low gold)', () => {
    expect(getGoldFormula('dnd5e', 'monk')).toEqual({
      dice: '5d4',
      multiplier: 1,
      coin: 'gp',
    });
  });

  it('uses 4d6 × 10 for Witcher sorceleur', () => {
    expect(getGoldFormula('witcher', 'witcher')).toEqual({
      dice: '4d6',
      multiplier: 10,
      coin: 'gp',
    });
  });

  it('uses 1d4 × 10 for Naheulbeuk barbarian (always broke)', () => {
    expect(getGoldFormula('naheulbeuk', 'barbarian')).toEqual({
      dice: '1d4',
      multiplier: 10,
      coin: 'gp',
    });
  });

  it('falls back to a sane default for unknown class', () => {
    const fallback = getGoldFormula('dnd5e', 'unknown_class');
    expect(fallback.dice).toBe('4d4');
    expect(fallback.multiplier).toBe(10);
  });
});

describe('character onboarding — starting kit', () => {
  it('paladin gets a longsword + chainmail + shield', () => {
    const kit = getStartingKit('dnd5e', 'paladin');
    const names = kit.map((i) => i.name);
    expect(names).toContain('Épée longue');
    expect(names).toContain('Bouclier');
    expect(names).toContain('Cotte de mailles');
  });

  it('witcher gets the iconic silver + steel sword pair', () => {
    const kit = getStartingKit('witcher', 'witcher');
    const names = kit.map((i) => i.name);
    expect(names).toContain('Épée d’argent');
    expect(names).toContain('Épée d’acier');
    expect(names).toContain('Médaillon de sorceleur');
  });

  it('naheulbeuk wizard gets the silly grimoire and wand', () => {
    const kit = getStartingKit('naheulbeuk', 'wizard');
    const names = kit.map((i) => i.name);
    expect(names).toContain('Grimoire taché de café');
    expect(names).toContain('Baguette ébréchée');
  });

  it('every kit has at least one weapon', () => {
    const universes = ['dnd5e', 'witcher', 'naheulbeuk'] as const;
    for (const u of universes) {
      const classes =
        u === 'dnd5e'
          ? [
              'barbarian',
              'bard',
              'cleric',
              'druid',
              'fighter',
              'monk',
              'paladin',
              'ranger',
              'rogue',
              'sorcerer',
              'warlock',
              'wizard',
            ]
          : u === 'witcher'
            ? ['witcher', 'mage', 'thief', 'scout', 'warrior', 'alchemist']
            : ['ranger', 'rogue', 'wizard', 'fighter', 'barbarian', 'paladin', 'bard', 'cleric'];
      for (const c of classes) {
        const kit = getStartingKit(u, c);
        expect(kit.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('character onboarding — rollStartingGold', () => {
  it('produces deterministic gold with a seeded RNG', () => {
    const rng = seededRandom(42);
    const result = rollStartingGold('dnd5e', 'fighter', rng);
    // 5d4 × 10 → between 50 and 200
    expect(result.currency.gp).toBeGreaterThanOrEqual(50);
    expect(result.currency.gp).toBeLessThanOrEqual(200);
    expect(result.dice).toHaveLength(5);
    for (const die of result.dice) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(4);
    }
  });

  it('gold lands in gp slot, others stay 0', () => {
    const result = rollStartingGold('dnd5e', 'wizard', seededRandom(7));
    expect(result.currency.cp).toBe(0);
    expect(result.currency.sp).toBe(0);
    expect(result.currency.ep).toBe(0);
    expect(result.currency.pp).toBe(0);
  });

  it('expression preserves the multiplier in display when > 1', () => {
    const result = rollStartingGold('dnd5e', 'fighter', seededRandom(1));
    expect(result.expression).toBe('5d4 × 10');
  });

  it('monk expression hides the × 1 multiplier', () => {
    const result = rollStartingGold('dnd5e', 'monk', seededRandom(1));
    expect(result.expression).toBe('5d4');
  });

  it('coin label matches the universe', () => {
    expect(getCoinLabel('dnd5e')).toBe('po');
    expect(getCoinLabel('witcher')).toBe('couronnes');
    expect(getCoinLabel('naheulbeuk')).toBe('PO');
  });
});

describe('emptyCurrency', () => {
  it('initializes all coin slots to zero', () => {
    expect(emptyCurrency()).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  });
});
