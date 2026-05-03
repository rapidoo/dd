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

// ============ Witcher Universe Adaptations ============

// Species available in The Witcher universe
export const WITCHER_SPECIES: Record<string, SpeciesData> = {
  human: {
    id: 'human',
    name: 'Humain',
    baseSpeed: 9,
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  },
  elf: {
    id: 'elf',
    name: 'Elfe',
    baseSpeed: 9,
    abilityBonuses: { dex: 2, int: 1 },
  },
  dwarf: {
    id: 'dwarf',
    name: 'Nain',
    baseSpeed: 7.5,
    abilityBonuses: { con: 2, str: 1 },
  },
  halfElf: {
    id: 'halfElf',
    name: 'Demi-Elfe',
    baseSpeed: 9,
    abilityBonuses: { cha: 2, dex: 1 },
  },
  halfling: {
    id: 'halfling',
    name: 'Halfling',
    baseSpeed: 7.5,
    abilityBonuses: { dex: 2, cha: 1 },
  },
  // Vampires supérieurs (Régis, Detlaff). Rares mais canoniques —
  // intelligence et charisme exceptionnels, vision nocturne, régénération.
  vampire: {
    id: 'vampire',
    name: 'Vampire supérieur',
    baseSpeed: 9,
    abilityBonuses: { int: 2, cha: 2, con: 1 },
  },
};

// Classes available in The Witcher universe (adapted roles)
export const WITCHER_CLASSES: Record<string, ClassData> = {
  witcher: {
    id: 'witcher',
    name: 'Sorceleur',
    hitDie: 'd10',
    primaryAbility: ['dex', 'str'],
    casterType: 'half', // Sorceleurs ont une magie limitée (signes)
    spellAbility: 'int',
    savingThrowProficiencies: ['dex', 'con'],
    skillChoices: 3,
    skillList: [
      'athletics',
      'perception',
      'stealth',
      'survival',
      'intimidation',
      'arcana',
      'nature',
      'insight',
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    hitDie: 'd6',
    primaryAbility: ['int', 'wis'],
    casterType: 'full',
    spellAbility: 'int',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoices: 3,
    skillList: [
      'arcana',
      'history',
      'insight',
      'investigation',
      'religion',
      'persuasion',
      'deception',
    ],
  },
  thief: {
    id: 'thief',
    name: 'Voleur',
    hitDie: 'd8',
    primaryAbility: ['dex'],
    casterType: 'none',
    savingThrowProficiencies: ['dex', 'int'],
    skillChoices: 4,
    skillList: [
      'acrobatics',
      'stealth',
      'sleightOfHand',
      'deception',
      'perception',
      'insight',
      'investigation',
      'persuasion',
      'athletics',
    ],
  },
  scout: {
    id: 'scout',
    name: 'Éclaireur',
    hitDie: 'd10',
    primaryAbility: ['dex', 'wis'],
    casterType: 'none',
    savingThrowProficiencies: ['dex', 'wis'],
    skillChoices: 4,
    skillList: [
      'athletics',
      'perception',
      'stealth',
      'survival',
      'nature',
      'insight',
      'animalHandling',
      'investigation',
    ],
  },
  warrior: {
    id: 'warrior',
    name: 'Guerrier',
    hitDie: 'd12',
    primaryAbility: ['str', 'con'],
    casterType: 'none',
    savingThrowProficiencies: ['str', 'con'],
    skillChoices: 2,
    skillList: ['athletics', 'intimidation', 'perception', 'survival', 'animalHandling'],
  },
  alchemist: {
    id: 'alchemist',
    name: 'Alchimiste',
    hitDie: 'd8',
    primaryAbility: ['int', 'wis'],
    casterType: 'none',
    savingThrowProficiencies: ['int', 'con'],
    skillChoices: 3,
    skillList: [
      'arcana',
      'nature',
      'medicine',
      'investigation',
      'insight',
      'survival',
      'perception',
    ],
  },
  // Bardes du Continent — troubadours, espions, conteurs (Jaskier, Priscilla).
  // Pas magiciens : ils manient le verbe et la lame, pas les sorts.
  bard: {
    id: 'bard',
    name: 'Barde',
    hitDie: 'd8',
    primaryAbility: ['cha', 'dex'],
    casterType: 'none',
    savingThrowProficiencies: ['dex', 'cha'],
    skillChoices: 4,
    skillList: [
      'persuasion',
      'deception',
      'performance',
      'history',
      'stealth',
      'insight',
      'investigation',
      'sleightOfHand',
    ],
  },
};

// ============ Naheulbeuk Universe Adaptations ============
//
// Le Donjon de Naheulbeuk (Terre de Fangh) — parodic D&D 5e setting.
// Races taken from the Bible de la Terre de Fangh §III, classes from §VI.
// All classes remain mechanically D&D 5e (parody is in the flavor / GM tone).

export const NAHEULBEUK_SPECIES: Record<string, SpeciesData> = {
  human: {
    id: 'human',
    name: 'Humain de Fangh',
    baseSpeed: 9,
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  },
  dwarf: {
    id: 'dwarf',
    name: 'Nain',
    baseSpeed: 7.5,
    abilityBonuses: { con: 2, str: 1 },
  },
  elf: {
    id: 'elf',
    name: 'Elfe',
    baseSpeed: 9,
    abilityBonuses: { dex: 2, cha: 1 },
  },
  halfElf: {
    id: 'halfElf',
    name: 'Demi-Elfe',
    baseSpeed: 9,
    abilityBonuses: { cha: 2, dex: 1 },
  },
  ogre: {
    id: 'ogre',
    name: 'Ogre',
    baseSpeed: 9,
    abilityBonuses: { str: 2, con: 1 },
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    baseSpeed: 9,
    abilityBonuses: { str: 2, con: 1 },
  },
  goblin: {
    id: 'goblin',
    name: 'Gobelin',
    baseSpeed: 9,
    abilityBonuses: { dex: 2, con: 1 },
  },
  halfling: {
    id: 'halfling',
    name: 'Hobbit',
    baseSpeed: 7.5,
    abilityBonuses: { dex: 2, cha: 1 },
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    baseSpeed: 9,
    abilityBonuses: { str: 3, con: 2 },
  },
  halfDemon: {
    id: 'halfDemon',
    name: 'Demi-Démon',
    baseSpeed: 9,
    abilityBonuses: { cha: 1, int: 1, str: 1 },
  },
  houchou: {
    id: 'houchou',
    name: 'Houchou',
    baseSpeed: 9,
    abilityBonuses: { wis: 2, dex: 1 },
  },
};

// Naheulbeuk classes mirror the seven canonical members of the Compagnie
// (Ranger, Voleur, Magicienne, Nain, Elfe, Ogre, Barbare) plus Paladin
// (Théo de Reuk) and Barde (Mlek). All map to standard 5e mechanics.
export const NAHEULBEUK_CLASSES: Record<string, ClassData> = {
  ranger: {
    id: 'ranger',
    name: 'Ranger',
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
      'persuasion',
      'stealth',
      'survival',
    ],
  },
  rogue: {
    id: 'rogue',
    name: 'Voleur',
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
  wizard: {
    id: 'wizard',
    name: 'Magicienne',
    hitDie: 'd6',
    primaryAbility: ['int'],
    casterType: 'full',
    spellAbility: 'int',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoices: 2,
    skillList: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
  },
  fighter: {
    id: 'fighter',
    name: 'Guerrier',
    hitDie: 'd10',
    primaryAbility: ['str'],
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
      'deception',
      'history',
      'insight',
      'performance',
      'persuasion',
      'sleightOfHand',
      'stealth',
    ],
  },
  cleric: {
    id: 'cleric',
    name: 'Prêtre',
    hitDie: 'd8',
    primaryAbility: ['wis'],
    casterType: 'full',
    spellAbility: 'wis',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
  },
};

// Helper function to get species for a given universe
export function getSpeciesForUniverse(
  universe: 'dnd5e' | 'witcher' | 'naheulbeuk',
): Record<string, SpeciesData> {
  if (universe === 'witcher') return WITCHER_SPECIES;
  if (universe === 'naheulbeuk') return NAHEULBEUK_SPECIES;
  return SPECIES;
}

// Helper function to get classes for a given universe
export function getClassesForUniverse(
  universe: 'dnd5e' | 'witcher' | 'naheulbeuk',
): Record<string, ClassData> {
  if (universe === 'witcher') return WITCHER_CLASSES;
  if (universe === 'naheulbeuk') return NAHEULBEUK_CLASSES;
  return CLASSES;
}

// Get species as array of {id, name} for select options
export function getSpeciesOptions(
  universe: 'dnd5e' | 'witcher' | 'naheulbeuk',
): Array<{ id: string; name: string }> {
  const species = getSpeciesForUniverse(universe);
  return Object.entries(species).map(([id, data]) => ({ id, name: data.name }));
}

// Get classes as array of {id, name} for select options
export function getClassOptions(
  universe: 'dnd5e' | 'witcher' | 'naheulbeuk',
): Array<{ id: string; name: string }> {
  const classes = getClassesForUniverse(universe);
  return Object.entries(classes).map(([id, data]) => ({ id, name: data.name }));
}
