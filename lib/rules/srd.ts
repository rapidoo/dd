import type { CasterType } from './spellcasting';
import type { Ability, HitDie } from './types';

export interface ClassData {
  id: string;
  name: string;
  hitDie: HitDie;
  primaryAbility: Ability[];
  casterType: CasterType;
  spellAbility?: Ability;
  savingThrowProficiencies: Ability[];
  /** Number of skill choices at level 1. */
  skillChoices: number;
  /** Pool of skills the class can pick from. */
  skillList: string[];
}

export const CLASSES: Record<string, ClassData> = {
  barbarian: {
    id: 'barbarian',
    name: 'Barbare',
    hitDie: 'd12',
    primaryAbility: ['str'],
    casterType: 'none',
    savingThrowProficiencies: ['str', 'con'],
    skillChoices: 2,
    skillList: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
  },
  bard: {
    id: 'bard',
    name: 'Barde',
    hitDie: 'd8',
    primaryAbility: ['cha'],
    casterType: 'full',
    spellAbility: 'cha',
    savingThrowProficiencies: ['dex', 'cha'],
    skillChoices: 3,
    skillList: [
      'acrobatics',
      'animalHandling',
      'arcana',
      'athletics',
      'deception',
      'history',
      'insight',
      'intimidation',
      'investigation',
      'medicine',
      'nature',
      'perception',
      'performance',
      'persuasion',
      'religion',
      'sleightOfHand',
      'stealth',
      'survival',
    ],
  },
  cleric: {
    id: 'cleric',
    name: 'Clerc',
    hitDie: 'd8',
    primaryAbility: ['wis'],
    casterType: 'full',
    spellAbility: 'wis',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
  },
  druid: {
    id: 'druid',
    name: 'Druide',
    hitDie: 'd8',
    primaryAbility: ['wis'],
    casterType: 'full',
    spellAbility: 'wis',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoices: 2,
    skillList: [
      'arcana',
      'animalHandling',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
  },
  fighter: {
    id: 'fighter',
    name: 'Guerrier',
    hitDie: 'd10',
    primaryAbility: ['str', 'dex'],
    casterType: 'none',
    savingThrowProficiencies: ['str', 'con'],
    skillChoices: 2,
    skillList: [
      'acrobatics',
      'animalHandling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'survival',
    ],
  },
  monk: {
    id: 'monk',
    name: 'Moine',
    hitDie: 'd8',
    primaryAbility: ['dex', 'wis'],
    casterType: 'none',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoices: 2,
    skillList: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    hitDie: 'd10',
    primaryAbility: ['str', 'cha'],
    casterType: 'half',
    spellAbility: 'cha',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
  },
  ranger: {
    id: 'ranger',
    name: 'Rôdeur',
    hitDie: 'd10',
    primaryAbility: ['dex', 'wis'],
    casterType: 'half',
    spellAbility: 'wis',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoices: 3,
    skillList: [
      'animalHandling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
  },
  rogue: {
    id: 'rogue',
    name: 'Roublard',
    hitDie: 'd8',
    primaryAbility: ['dex'],
    casterType: 'none',
    savingThrowProficiencies: ['dex', 'int'],
    skillChoices: 4,
    skillList: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'performance',
      'persuasion',
      'sleightOfHand',
      'stealth',
    ],
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Ensorceleur',
    hitDie: 'd6',
    primaryAbility: ['cha'],
    casterType: 'full',
    spellAbility: 'cha',
    savingThrowProficiencies: ['con', 'cha'],
    skillChoices: 2,
    skillList: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
  },
  warlock: {
    id: 'warlock',
    name: 'Sorcier',
    hitDie: 'd8',
    primaryAbility: ['cha'],
    casterType: 'full', // modeled as full for slot progression (Pact Magic handled post-MVP)
    spellAbility: 'cha',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoices: 2,
    skillList: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
  },
  wizard: {
    id: 'wizard',
    name: 'Magicien',
    hitDie: 'd6',
    primaryAbility: ['int'],
    casterType: 'full',
    spellAbility: 'int',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoices: 2,
    skillList: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
  },
};

export interface SpeciesData {
  id: string;
  name: string;
  baseSpeed: number;
  abilityBonuses: Partial<Record<Ability, number>>;
}

export const SPECIES: Record<string, SpeciesData> = {
  human: {
    id: 'human',
    name: 'Humain',
    baseSpeed: 9,
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  },
  elf: { id: 'elf', name: 'Elfe', baseSpeed: 9, abilityBonuses: { dex: 2 } },
  dwarf: { id: 'dwarf', name: 'Nain', baseSpeed: 7.5, abilityBonuses: { con: 2 } },
  halfling: { id: 'halfling', name: 'Halfelin', baseSpeed: 7.5, abilityBonuses: { dex: 2 } },
  dragonborn: {
    id: 'dragonborn',
    name: 'Drakéide',
    baseSpeed: 9,
    abilityBonuses: { str: 2, cha: 1 },
  },
  gnome: { id: 'gnome', name: 'Gnome', baseSpeed: 7.5, abilityBonuses: { int: 2 } },
  halfElf: {
    id: 'halfElf',
    name: 'Demi-Elfe',
    baseSpeed: 9,
    abilityBonuses: { cha: 2 },
  },
  halfOrc: {
    id: 'halfOrc',
    name: 'Demi-Orque',
    baseSpeed: 9,
    abilityBonuses: { str: 2, con: 1 },
  },
  tiefling: {
    id: 'tiefling',
    name: 'Tieffelin',
    baseSpeed: 9,
    abilityBonuses: { cha: 2, int: 1 },
  },
};

export const BACKGROUNDS = [
  'acolyte',
  'criminal',
  'folkHero',
  'noble',
  'sage',
  'soldier',
  'hermit',
  'entertainer',
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number];
