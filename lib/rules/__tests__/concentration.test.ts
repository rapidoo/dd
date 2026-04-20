import { describe, expect, it } from 'vitest';
import {
  checkConcentration,
  concentrationSaveDC,
  dropConcentration,
  emptyConcentration,
  startConcentration,
} from '../concentration';
import type { Random } from '../types';

function fixedD20(...values: number[]): Random {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    if (v === undefined) throw new Error('no more fixed values');
    i++;
    return (v - 1) / 20 + 0.0001;
  };
}

describe('concentrationSaveDC', () => {
  it('is 10 when damage/2 is below 10', () => {
    expect(concentrationSaveDC(5)).toBe(10);
    expect(concentrationSaveDC(18)).toBe(10);
  });
  it('is floor(damage/2) when >= 10', () => {
    expect(concentrationSaveDC(20)).toBe(10);
    expect(concentrationSaveDC(21)).toBe(10);
    expect(concentrationSaveDC(22)).toBe(11);
    expect(concentrationSaveDC(50)).toBe(25);
  });
});

describe('startConcentration / dropConcentration', () => {
  it('starts on a new spell', () => {
    const c = startConcentration(emptyConcentration(), 'Bless', 1);
    expect(c.active).toBe(true);
    expect(c.spellName).toBe('Bless');
    expect(c.level).toBe(1);
  });

  it('replaces existing spell without asking (rule: new concentration ends the old)', () => {
    const first = startConcentration(emptyConcentration(), 'Bless', 1);
    const second = startConcentration(first, 'Hold Person', 2);
    expect(second.spellName).toBe('Hold Person');
    expect(second.level).toBe(2);
  });

  it('drop resets', () => {
    const c = startConcentration(emptyConcentration(), 'Fly', 3);
    expect(dropConcentration().active).toBe(false);
    expect(dropConcentration().spellName).toBeNull();
    void c;
  });
});

describe('checkConcentration', () => {
  it('maintains when save succeeds', () => {
    // 9 damage → DC 10. roll 15 + con 3 + prof 2 = 20 → success
    const r = checkConcentration(
      { conMod: 3, profBonus: 2, proficient: true, damage: 9 },
      fixedD20(15),
    );
    expect(r.maintained).toBe(true);
  });

  it('breaks when save fails', () => {
    // 22 damage → DC 11. roll 5 + con 1 = 6 → fail
    const r = checkConcentration(
      { conMod: 1, profBonus: 2, proficient: false, damage: 22 },
      fixedD20(5),
    );
    expect(r.maintained).toBe(false);
  });
});
