import { describe, expect, it } from 'vitest';
import { DEATH_SAVE_REVIVE_HP, emptyDeathSaves, rollDeathSave } from '../death';
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

describe('rollDeathSave', () => {
  it('roll ≥ 10 → success (+1)', () => {
    const r = rollDeathSave(emptyDeathSaves(), fixedD20(15));
    expect(r.state.successes).toBe(1);
    expect(r.state.failures).toBe(0);
  });

  it('roll < 10 → failure (+1)', () => {
    const r = rollDeathSave(emptyDeathSaves(), fixedD20(5));
    expect(r.state.failures).toBe(1);
  });

  it('nat 1 → +2 failures', () => {
    const r = rollDeathSave(emptyDeathSaves(), fixedD20(1));
    expect(r.state.failures).toBe(2);
    expect(r.naturalOne).toBe(true);
  });

  it('three successes → stable', () => {
    let s = emptyDeathSaves();
    s = rollDeathSave(s, fixedD20(15)).state;
    s = rollDeathSave(s, fixedD20(15)).state;
    s = rollDeathSave(s, fixedD20(15)).state;
    expect(s.stable).toBe(true);
    expect(s.successes).toBe(3);
  });

  it('three failures → dead', () => {
    let s = emptyDeathSaves();
    s = rollDeathSave(s, fixedD20(5)).state;
    s = rollDeathSave(s, fixedD20(5)).state;
    s = rollDeathSave(s, fixedD20(5)).state;
    expect(s.dead).toBe(true);
  });

  it('nat 1 twice → dead (0 + 2 + 2 = 4 failures, clamps to 3)', () => {
    let s = emptyDeathSaves();
    s = rollDeathSave(s, fixedD20(1)).state;
    expect(s.failures).toBe(2);
    s = rollDeathSave(s, fixedD20(1)).state;
    expect(s.failures).toBe(3);
    expect(s.dead).toBe(true);
  });

  it('nat 20 → revived, counters reset', () => {
    const start: ReturnType<typeof emptyDeathSaves> = {
      successes: 2,
      failures: 1,
      stable: false,
      dead: false,
    };
    const r = rollDeathSave(start, fixedD20(20));
    expect(r.revived).toBe(true);
    expect(r.state.successes).toBe(0);
    expect(r.state.failures).toBe(0);
  });

  it('refuses to roll when dead', () => {
    expect(() => rollDeathSave({ successes: 0, failures: 3, stable: false, dead: true })).toThrow();
  });

  it('refuses to roll when stable', () => {
    expect(() => rollDeathSave({ successes: 3, failures: 0, stable: true, dead: false })).toThrow();
  });

  it('exports revive HP constant', () => {
    expect(DEATH_SAVE_REVIVE_HP).toBe(1);
  });
});
