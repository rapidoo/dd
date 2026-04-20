import { describe, expect, it } from 'vitest';
import { SKILL_ABILITY, skillModifier } from '../skills';

describe('SKILL_ABILITY', () => {
  it('maps 18 skills', () => {
    expect(Object.keys(SKILL_ABILITY)).toHaveLength(18);
  });
  it('maps athletics to STR', () => {
    expect(SKILL_ABILITY.athletics).toBe('str');
  });
  it('maps stealth to DEX', () => {
    expect(SKILL_ABILITY.stealth).toBe('dex');
  });
  it('maps persuasion to CHA', () => {
    expect(SKILL_ABILITY.persuasion).toBe('cha');
  });
});

describe('skillModifier', () => {
  it('returns just ability mod when not proficient', () => {
    expect(skillModifier(3, 2, { proficient: false, expertise: false })).toBe(3);
  });
  it('adds proficiency once when proficient', () => {
    expect(skillModifier(3, 2, { proficient: true, expertise: false })).toBe(5);
  });
  it('adds proficiency twice when expertise (with proficient)', () => {
    expect(skillModifier(3, 2, { proficient: true, expertise: true })).toBe(7);
  });
  it('expertise without proficient still doubles prof bonus (defensive)', () => {
    expect(skillModifier(3, 2, { proficient: false, expertise: true })).toBe(5);
  });
});
