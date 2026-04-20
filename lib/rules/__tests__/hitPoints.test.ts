import { describe, expect, it } from 'vitest';
import { applyDamage, applyHealing, calculateMaxHP, grantTempHP, hitDieFaces } from '../hitPoints';

describe('hitDieFaces', () => {
  it('maps hit dies', () => {
    expect(hitDieFaces('d6')).toBe(6);
    expect(hitDieFaces('d8')).toBe(8);
    expect(hitDieFaces('d10')).toBe(10);
    expect(hitDieFaces('d12')).toBe(12);
  });
});

describe('calculateMaxHP', () => {
  it('level 1 d8 with +2 CON → 10', () => {
    expect(calculateMaxHP('d8', 2, 1)).toBe(10);
  });

  it('level 5 d10 with +3 CON → 10 + 4×(6+3) = 46', () => {
    // L1: 10+3=13 ; L2-5: avg d10 = 6 + 3 = 9 each, ×4 = 36 → total 49
    expect(calculateMaxHP('d10', 3, 5)).toBe(49);
  });

  it('level 3 d6 with -2 CON clamps each level to min 1', () => {
    // L1: max(1, 6-2) = 4 ; L2: max(1, 4-2) = 2 ; L3: max(1, 4-2) = 2 ; total 8
    expect(calculateMaxHP('d6', -2, 3)).toBe(8);
  });

  it('rejects invalid level', () => {
    expect(() => calculateMaxHP('d8', 0, 0)).toThrow();
    expect(() => calculateMaxHP('d8', 0, 21)).toThrow();
  });
});

describe('applyDamage', () => {
  it('subtracts from current HP', () => {
    const r = applyDamage({ current: 20, max: 30, temp: 0 }, 5);
    expect(r.state.current).toBe(15);
    expect(r.absorbedByTemp).toBe(0);
    expect(r.wentToZero).toBe(false);
  });

  it('temp HP absorbs first', () => {
    const r = applyDamage({ current: 20, max: 30, temp: 8 }, 5);
    expect(r.state.temp).toBe(3);
    expect(r.state.current).toBe(20);
    expect(r.absorbedByTemp).toBe(5);
  });

  it('temp HP depletes then spills into current', () => {
    const r = applyDamage({ current: 20, max: 30, temp: 5 }, 10);
    expect(r.state.temp).toBe(0);
    expect(r.state.current).toBe(15);
    expect(r.absorbedByTemp).toBe(5);
    expect(r.appliedToCurrent).toBe(5);
  });

  it('clamps at 0 and flags wentToZero', () => {
    const r = applyDamage({ current: 5, max: 30, temp: 0 }, 100);
    expect(r.state.current).toBe(0);
    expect(r.wentToZero).toBe(true);
    expect(r.massive).toBe(true);
  });

  it('massive damage rule: damage ≥ max HP when at 0 → dead flag', () => {
    const r = applyDamage({ current: 1, max: 10, temp: 0 }, 20);
    expect(r.massive).toBe(true);
  });

  it('at-zero non-massive: wentToZero without massive', () => {
    const r = applyDamage({ current: 3, max: 30, temp: 0 }, 5);
    expect(r.state.current).toBe(0);
    expect(r.wentToZero).toBe(true);
    expect(r.massive).toBe(false);
  });

  it('rejects negative damage', () => {
    expect(() => applyDamage({ current: 20, max: 30, temp: 0 }, -1)).toThrow();
  });
});

describe('applyHealing', () => {
  it('heals up to max', () => {
    expect(applyHealing({ current: 5, max: 10, temp: 0 }, 3)).toEqual({
      current: 8,
      max: 10,
      temp: 0,
    });
  });
  it('clamps to max', () => {
    expect(applyHealing({ current: 8, max: 10, temp: 0 }, 100).current).toBe(10);
  });
  it('does not touch temp HP', () => {
    expect(applyHealing({ current: 5, max: 10, temp: 4 }, 3).temp).toBe(4);
  });
  it('rejects negative heal', () => {
    expect(() => applyHealing({ current: 5, max: 10, temp: 0 }, -1)).toThrow();
  });
});

describe('grantTempHP', () => {
  it('replaces when higher', () => {
    expect(grantTempHP({ current: 10, max: 10, temp: 3 }, 8).temp).toBe(8);
  });
  it('keeps when lower (does not stack)', () => {
    expect(grantTempHP({ current: 10, max: 10, temp: 8 }, 3).temp).toBe(8);
  });
  it('rejects negative', () => {
    expect(() => grantTempHP({ current: 10, max: 10, temp: 0 }, -1)).toThrow();
  });
});
