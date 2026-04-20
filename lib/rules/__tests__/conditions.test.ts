import { describe, expect, it } from 'vitest';
import {
  addCondition,
  aggregateEffects,
  CONDITION_EFFECTS,
  exhaustionEffects,
  hasCondition,
  removeCondition,
  tickConditions,
} from '../conditions';
import { CONDITION_TYPES } from '../types';

describe('CONDITION_EFFECTS', () => {
  it('covers all 14 official conditions', () => {
    expect(Object.keys(CONDITION_EFFECTS)).toHaveLength(14);
    for (const t of CONDITION_TYPES) {
      expect(CONDITION_EFFECTS[t]).toBeDefined();
    }
  });

  it('paralyzed: attacks vs have advantage, auto-fail STR/DEX saves, speed 0, incapacitated', () => {
    const e = CONDITION_EFFECTS.paralyzed;
    expect(e.attackRollsAgainstAdvantage).toBe(true);
    expect(e.autoFailStrSave).toBe(true);
    expect(e.autoFailDexSave).toBe(true);
    expect(e.speedZero).toBe(true);
    expect(e.incapacitated).toBe(true);
  });

  it('invisible: attacks vs at disadvantage', () => {
    expect(CONDITION_EFFECTS.invisible.attackRollsAgainstDisadvantage).toBe(true);
  });

  it('unconscious breaks concentration', () => {
    expect(CONDITION_EFFECTS.unconscious.breaksConcentration).toBe(true);
  });
});

describe('addCondition / removeCondition / hasCondition', () => {
  it('adds new condition', () => {
    const list = addCondition([], { type: 'prone' });
    expect(hasCondition(list, 'prone')).toBe(true);
  });

  it('does not duplicate on re-add, refreshes duration', () => {
    const list = addCondition([{ type: 'poisoned', durationRounds: 3 }], {
      type: 'poisoned',
      durationRounds: 10,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.durationRounds).toBe(10);
  });

  it('removes by type', () => {
    const list = removeCondition([{ type: 'prone' }, { type: 'charmed' }], 'prone');
    expect(list.map((c) => c.type)).toEqual(['charmed']);
  });
});

describe('tickConditions', () => {
  it('decrements timed conditions', () => {
    const list = tickConditions(
      [
        { type: 'poisoned', durationRounds: 3 },
        { type: 'stunned', durationRounds: 1 },
        { type: 'prone' }, // no duration → stays
      ],
      1,
    );
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.type === 'poisoned')?.durationRounds).toBe(2);
    expect(list.find((c) => c.type === 'stunned')).toBeUndefined();
    expect(list.find((c) => c.type === 'prone')).toBeDefined();
  });
});

describe('aggregateEffects', () => {
  it('combines advantage and disadvantage flags via OR', () => {
    const agg = aggregateEffects([{ type: 'prone' }, { type: 'invisible' }]);
    expect(agg.attackRollsAgainstAdvantage).toBe(false); // prone doesn't have it flatly
    expect(agg.attackRollsAgainstDisadvantage).toBe(true);
    expect(agg.ownAttacksDisadvantage).toBe(true);
  });

  it('empty list gives all false', () => {
    const agg = aggregateEffects([]);
    expect(Object.values(agg).every((v) => v === false)).toBe(true);
  });

  it('stunned + paralyzed → incapacitated + auto-fail STR/DEX', () => {
    const agg = aggregateEffects([{ type: 'stunned' }, { type: 'paralyzed' }]);
    expect(agg.incapacitated).toBe(true);
    expect(agg.autoFailStrSave).toBe(true);
    expect(agg.autoFailDexSave).toBe(true);
    expect(agg.speedZero).toBe(true);
  });
});

describe('exhaustionEffects', () => {
  it('level 0 is clean', () => {
    const e = exhaustionEffects(0);
    expect(e.disadvantageOnChecks).toBe(false);
  });
  it('level 3 adds disadvantage on attacks/saves', () => {
    const e = exhaustionEffects(3);
    expect(e.disadvantageOnAttacksAndSaves).toBe(true);
    expect(e.speedHalved).toBe(true);
  });
  it('level 6 = dead', () => {
    expect(exhaustionEffects(6).dead).toBe(true);
  });
  it('rejects out of range', () => {
    expect(() => exhaustionEffects(-1)).toThrow();
    expect(() => exhaustionEffects(7)).toThrow();
  });
});
