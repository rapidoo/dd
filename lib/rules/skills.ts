import type { Ability, Skill } from './types';

/** Maps each skill to its governing ability (SRD 5.1). */
export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export interface SkillProficiency {
  proficient: boolean;
  expertise: boolean;
}

/**
 * Skill modifier = ability modifier
 *   + proficiency bonus (if proficient)
 *   + another proficiency bonus (if expertise — total 2× prof).
 */
export function skillModifier(
  abilityMod: number,
  profBonus: number,
  prof: SkillProficiency,
): number {
  let mod = abilityMod;
  if (prof.proficient) mod += profBonus;
  if (prof.expertise) mod += profBonus;
  return mod;
}
