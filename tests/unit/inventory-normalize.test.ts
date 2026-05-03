import { describe, expect, it } from 'vitest';
import { normalizeKitItem } from '../../lib/server/inventory-normalize';

describe('normalizeKitItem', () => {
  it('assigns a unique id to every kit item', () => {
    const a = normalizeKitItem({ name: 'Dague', type: 'weapon', damage: '1d4 perforant' });
    const b = normalizeKitItem({ name: 'Dague', type: 'weapon', damage: '1d4 perforant' });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('maps count → qty (default 1)', () => {
    expect(normalizeKitItem({ name: 'Ration', type: 'consumable', count: 5 }).qty).toBe(5);
    expect(normalizeKitItem({ name: 'Bâton', type: 'weapon' }).qty).toBe(1);
  });

  it('coerces unknown kit types to misc', () => {
    expect(normalizeKitItem({ name: 'Médaillon', type: 'magic' }).type).toBe('misc');
    expect(normalizeKitItem({ name: 'Symbole', type: 'focus' }).type).toBe('misc');
    expect(normalizeKitItem({ name: 'Talisman', type: 'trinket' }).type).toBe('misc');
  });

  it('keeps canonical types as-is', () => {
    expect(normalizeKitItem({ name: 'Épée', type: 'weapon' }).type).toBe('weapon');
    expect(normalizeKitItem({ name: 'Cuir', type: 'armor' }).type).toBe('armor');
    expect(normalizeKitItem({ name: 'Crochets', type: 'tool' }).type).toBe('tool');
    expect(normalizeKitItem({ name: 'Potion', type: 'consumable' }).type).toBe('consumable');
  });

  it('maps shield to armor', () => {
    expect(normalizeKitItem({ name: 'Bouclier', type: 'shield' }).type).toBe('armor');
  });

  it('parses weapon damage into a weapon block', () => {
    const item = normalizeKitItem({
      name: 'Épée longue',
      type: 'weapon',
      damage: '1d8 tranchant',
    });
    expect(item.weapon).toEqual({ damageDice: '1d8', damageType: 'tranchant' });
  });

  it('does not produce a weapon block for non-weapons', () => {
    const item = normalizeKitItem({ name: 'Cotte de mailles', type: 'armor', damage: '1d8' });
    expect(item.weapon).toBeUndefined();
  });

  it('merges description and effect into description', () => {
    const item = normalizeKitItem({
      name: 'Médaillon',
      type: 'magic',
      description: 'En argent',
      effect: 'vibre face aux monstres',
    });
    expect(item.description).toBe('En argent · vibre face aux monstres');
  });

  it('falls back to misc when type is missing', () => {
    expect(normalizeKitItem({ name: 'Truc' }).type).toBe('misc');
  });
});
