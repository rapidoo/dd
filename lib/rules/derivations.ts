import type { Universe } from '../db/types';
import { getAbilityModifier } from './abilities';
import { calculateAC } from './armorClass';
import { calculateMaxHP } from './hitPoints';
import { proficiencyBonus } from './proficiency';
import { spellAttackBonus, spellSaveDC, spellSlotsFor } from './spellcasting';
import { getClassesForUniverse, getSpeciesForUniverse } from './srd';
import type { AbilityScores, SpellSlots } from './types';

export interface CharacterDraftInput {
  /** Universe drives which CLASSES/SPECIES dict to use. Defaults to dnd5e. */
  universe?: Universe;
  classId: string;
  speciesId: string;
  level: number;
  /** Raw ability scores BEFORE species bonuses are applied. */
  abilityScores: AbilityScores;
  /** Selected skill proficiencies. */
  skillProficiencies: string[];
}

export interface DerivedStats {
  abilityScores: AbilityScores;
  maxHP: number;
  ac: number;
  speed: number;
  proficiencyBonus: number;
  initiative: number;
  spellSaveDC: number | null;
  spellAttackBonus: number | null;
  spellSlots: SpellSlots;
  passivePerception: number;
  hitDie: 'd6' | 'd8' | 'd10' | 'd12';
  savingThrowProficiencies: string[];
  skillProficiencies: string[];
}

/**
 * Apply species bonuses to a set of base ability scores.
 * Each score is clamped to [1,30] to stay within D&D 5e rules.
 */
export function applySpeciesBonuses(
  base: AbilityScores,
  speciesId: string,
  universe: Universe = 'dnd5e',
): AbilityScores {
  const species = getSpeciesForUniverse(universe)[speciesId];
  if (!species) throw new Error(`Unknown species: ${speciesId}`);
  const next = { ...base };
  for (const [ability, bonus] of Object.entries(species.abilityBonuses)) {
    const key = ability as keyof AbilityScores;
    next[key] = Math.max(1, Math.min(30, next[key] + (bonus ?? 0)));
  }
  return next;
}

/**
 * Compute every derived stat the server must own. Client must never recompute these.
 */
export function deriveCharacter(input: CharacterDraftInput): DerivedStats {
  const universe = input.universe ?? 'dnd5e';
  const classData = getClassesForUniverse(universe)[input.classId];
  if (!classData) throw new Error(`Unknown class: ${input.classId}`);
  const species = getSpeciesForUniverse(universe)[input.speciesId];
  if (!species) throw new Error(`Unknown species: ${input.speciesId}`);

  const abilityScores = applySpeciesBonuses(input.abilityScores, input.speciesId, universe);
  const conMod = getAbilityModifier(abilityScores.con);
  const dexMod = getAbilityModifier(abilityScores.dex);
  const wisMod = getAbilityModifier(abilityScores.wis);
  const prof = proficiencyBonus(input.level);

  const maxHP = calculateMaxHP(classData.hitDie, conMod, input.level);
  const ac = calculateAC({ dexMod });

  const spellAbility = classData.spellAbility;
  const spellMod = spellAbility ? getAbilityModifier(abilityScores[spellAbility]) : null;

  return {
    abilityScores,
    maxHP,
    ac,
    speed: species.baseSpeed,
    proficiencyBonus: prof,
    initiative: dexMod,
    spellSaveDC:
      spellMod !== null ? spellSaveDC({ profBonus: prof, spellAbilityMod: spellMod }) : null,
    spellAttackBonus:
      spellMod !== null ? spellAttackBonus({ profBonus: prof, spellAbilityMod: spellMod }) : null,
    spellSlots: spellSlotsFor(classData.casterType, input.level),
    passivePerception: 10 + wisMod + (input.skillProficiencies.includes('perception') ? prof : 0),
    hitDie: classData.hitDie,
    savingThrowProficiencies: classData.savingThrowProficiencies,
    skillProficiencies: input.skillProficiencies,
  };
}
