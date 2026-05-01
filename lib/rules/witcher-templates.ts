/**
 * Pre-configured character templates for The Witcher universe.
 * These templates provide complete character sheets with stats, equipment,
 * skills, and special abilities ready to use in campaigns.
 */

import type { CharacterRow } from '../db/types';

export interface WitcherCharacterTemplate {
  id: string;
  name: string;
  description: string;
  species: string;
  class: string;
  subclass: string | null;
  level: number;
  // Ability scores (before racial bonuses)
  baseAbilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  // Final ability scores (after racial bonuses)
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  abilityModifiers: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  max_hp: number;
  current_hp: number;
  ac: number;
  speed: number;
  proficiencies: string[];
  skills: Record<string, number>;
  features: Array<{
    name: string;
    description: string;
  }>;
  inventory: Array<{
    name: string;
    type: string;
    description?: string;
    damage?: string;
    effect?: string;
    count?: number;
  }>;
  // Witcher-specific properties
  signs?: Array<{
    name: string;
    description: string;
    effect: string;
    cost?: string;
    range?: string;
    duration?: string;
  }>;
  spells_known?: string[];
  potions?: Array<{
    name: string;
    effect: string;
    ingredients?: string[];
    duration?: string;
  }>;
  // Alchemist-specific
  alchemyKit?: {
    fioles: number;
    rareIngredients: number;
  };
  // Vampire-specific
  regeneration?: number;
  weaknesses?: string[];
  // Bard-specific
  songs?: Array<{
    name: string;
    effect: string;
    duration?: string;
    dc?: number;
  }>;
  // Mage-specific
  spellSlots?: Record<number, { max: number; used: number }>;
  school?: string;
}

// Helper to calculate ability modifier
function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper to create a character template
function createTemplate(
  template: Omit<WitcherCharacterTemplate, 'abilityModifiers'> & {
    abilities: WitcherCharacterTemplate['abilities'];
  },
): WitcherCharacterTemplate {
  const abilityModifiers = {
    str: calcModifier(template.abilities.str),
    dex: calcModifier(template.abilities.dex),
    con: calcModifier(template.abilities.con),
    int: calcModifier(template.abilities.int),
    wis: calcModifier(template.abilities.wis),
    cha: calcModifier(template.abilities.cha),
  };
  return { ...template, abilityModifiers };
}

// Geralt de Riv - Sorceleur (Niveau 5)
export const GERALT_TEMPLATE: WitcherCharacterTemplate = createTemplate({
  id: 'geralt-de-riv',
  name: 'Geralt de Riv',
  description:
    "Sorceleur legendaire de l'Ecole du Loup, chasseur de monstres mute par l'alchimie et la magie.",
  species: 'human',
  class: 'Sorceleur',
  subclass: 'Loup',
  level: 5,
  baseAbilities: {
    str: 14,
    dex: 16,
    con: 15,
    int: 10,
    wis: 12,
    cha: 8,
  },
  abilities: {
    str: 15,
    dex: 17,
    con: 16,
    int: 11,
    wis: 13,
    cha: 9,
  },
  max_hp: 45,
  current_hp: 45,
  ac: 16,
  speed: 9,
  proficiencies: ['athletics', 'survival', 'intimidation', 'alchimie'],
  skills: {
    athletics: 4,
    survival: 4,
    intimidation: 2,
    alchimie: 4,
  },
  features: [
    {
      name: 'Immunite aux poisons et maladies',
      description: 'Immune a tous les poisons et maladies grace aux mutations alchimiques.',
    },
    {
      name: 'Connaissance des faiblesses des monstres',
      description:
        'Connait instinctivement les faiblesses de la plupart des creatures monstrueuses.',
    },
    {
      name: 'Maitre alchimiste',
      description: 'Peut preparer 2 potions par repos long sans risque d explosion.',
    },
    {
      name: 'Resistance magique',
      description: 'Avantage sur les jets de sauvegarde contre les sorts et effets magiques.',
    },
  ],
  inventory: [
    {
      name: 'Epee en acier',
      type: 'arme',
      damage: '1d8',
      description: 'Epee principale pour le combat contre les humains et betes',
    },
    {
      name: 'Epee en argent',
      type: 'arme',
      damage: '1d8+2',
      description: 'Epee en argent gravee, bonus contre les monstres',
    },
    {
      name: 'Armure de cuir renforce',
      type: 'armure',
      description: 'Armure legere renforcee, CA 14',
    },
    { name: 'Bouclier en bois', type: 'armure', description: '+2 CA, total CA 16' },
    { name: 'Potion de Soins', type: 'potion', description: 'Restaure 2D6 PV', count: 2 },
    { name: 'Potion Force du Taureau', type: 'potion', description: '+2 en Force pour 1 combat' },
    {
      name: 'Potion Vision Nocturne',
      type: 'potion',
      description: 'Vision dans le noir pendant 1 heure',
    },
  ],
  signs: [
    {
      name: 'Igni',
      description: 'Projette une boule de feu',
      effect: '4D6 degats de feu (zone 10 pieds)',
      cost: '1 utilisation/repos',
      range: '30 pieds',
      duration: 'Instantane',
    },
    {
      name: 'Aard',
      description: 'Pousse les ennemis',
      effect: 'Pousse 2 ennemis a 15 pieds',
      cost: '1 utilisation/repos',
      range: '30 pieds',
      duration: 'Instantane',
    },
    {
      name: 'Quen',
      description: 'Bouclier magique absorbant',
      effect: 'Absorbe 15 degats',
      cost: '1 utilisation/repos',
      range: 'Soi-meme',
      duration: '1 tour',
    },
    {
      name: 'Yrden',
      description: 'Piege magique explosif',
      effect: '3D6 degats (zone)',
      cost: '1 utilisation/repos',
      range: '10 pieds',
      duration: '1 minute',
    },
    {
      name: 'Axii',
      description: 'Controle mental',
      effect: 'Controle 1 cible, jet de Sagesse DC 17',
      cost: '1 utilisation/repos',
      range: '30 pieds',
      duration: '1 tour',
    },
  ],
});

// Jaskier - Barde (Niveau 4)
export const JASKIER_TEMPLATE: WitcherCharacterTemplate = createTemplate({
  id: 'jaskier',
  name: 'Jaskier',
  description:
    'Barde charismatique, poete et musicien, connu pour ses ballades et son sens aigu de la politique.',
  species: 'halfling',
  class: 'Barde',
  subclass: null,
  level: 4,
  baseAbilities: {
    str: 8,
    dex: 16,
    con: 10,
    int: 14,
    wis: 12,
    cha: 18,
  },
  abilities: {
    str: 7,
    dex: 17,
    con: 10,
    int: 14,
    wis: 12,
    cha: 19,
  },
  max_hp: 25,
  current_hp: 25,
  ac: 14,
  speed: 7.5,
  proficiencies: ['persuasion', 'tromperie', 'performance', 'histoire', 'discretion'],
  skills: {
    persuasion: 6,
    tromperie: 6,
    performance: 6,
    histoire: 4,
    discretion: 5,
  },
  features: [
    {
      name: 'Maitre des Rumeurs',
      description:
        'Peut obtenir des informations et rumeurs dans les tavernes et villes avec avantage.',
    },
    {
      name: 'Inspiration',
      description: '1 fois par session, un allie peut relancer un jet rate.',
    },
    {
      name: 'Chance des Halflings',
      description: 'Avantage sur les jets de sauvegarde contre la mort et les effets de peur.',
    },
  ],
  inventory: [
    {
      name: 'Luth magique',
      type: 'instrument',
      description: 'Instrument enchante pour les performances magiques',
    },
    { name: 'Dague', type: 'arme', damage: '1d4' },
    { name: 'Veste en cuir', type: 'armure', description: 'CA 12, total CA 14 avec DEX mod' },
    { name: 'Potion de Soins', type: 'potion', description: 'Restaure 2D6 PV' },
  ],
  songs: [
    {
      name: 'Ballade du Heros',
      effect: '+1 aux jets dattaque pour les allies',
      duration: '1 combat',
    },
    {
      name: 'Chant de la Peur',
      effect: 'Les ennemis doivent reussir un jet de Sagesse DC 14 ou fuir',
      duration: '1 tour',
    },
    {
      name: 'Melodie de Guerison',
      effect: 'Restaure 1D6 PV a tous les allies',
      duration: 'Instantane',
    },
    {
      name: 'Chant de la Chance',
      effect: 'Les allies peuvent relancer 1 jet rate par combat',
      duration: '1 combat',
    },
  ],
});

// Yennefer de Vengerberg - Mage (Niveau 5)
export const YENNEFER_TEMPLATE: WitcherCharacterTemplate = createTemplate({
  id: 'yennefer-de-vengerberg',
  name: 'Yennefer de Vengerberg',
  description: 'Mage puissante de lecole du Chaos, specialiste des sorts de feu et des illusions.',
  species: 'human',
  class: 'Mage',
  subclass: 'Chaos',
  level: 5,
  baseAbilities: {
    str: 8,
    dex: 14,
    con: 12,
    int: 18,
    wis: 14,
    cha: 16,
  },
  abilities: {
    str: 9,
    dex: 15,
    con: 13,
    int: 19,
    wis: 15,
    cha: 17,
  },
  max_hp: 22,
  current_hp: 22,
  ac: 13,
  speed: 9,
  proficiencies: ['arcanes', 'histoire', 'persuasion', 'detection de la magie'],
  skills: {
    arcanes: 6,
    histoire: 6,
    persuasion: 5,
    'detection de la magie': 6,
  },
  features: [
    {
      name: 'Resistance aux sorts',
      description: 'Avantage sur les jets de sauvegarde contre les sorts.',
    },
    {
      name: 'Surcharge magique',
      description:
        'Si un lancer de sort echoue critique (nat 1), risque detourdissement pendant 1 tour.',
    },
    {
      name: 'Specialisation Ecole du Chaos',
      description: 'Les sorts de feu infligent +1 de de degats.',
    },
  ],
  inventory: [
    {
      name: 'Baton magique',
      type: 'arme',
      damage: '1d6',
      description: 'Baton qui canalise les sorts',
    },
    { name: 'Robe de mage', type: 'armure', description: 'CA 10 + DEX mod + INT mod = 13' },
    { name: 'Grimoire', type: 'objet', description: 'Contient tous les sorts connus' },
    { name: 'Potion de Soins', type: 'potion', description: 'Restaure 2D6 PV' },
  ],
  spells_known: [
    'Boule de Feu',
    'Bouclier Magique',
    'Illusion',
    'Foudre en Chaine',
    'Invisibilite',
    'Meteore',
  ],
  spellSlots: {
    1: { max: 4, used: 0 },
    2: { max: 3, used: 0 },
    3: { max: 2, used: 0 },
  },
  school: 'Chaos',
});

// Zoltan Chivay - Guerrier Berserker (Niveau 4)
export const ZOLTAN_TEMPLATE: WitcherCharacterTemplate = createTemplate({
  id: 'zoltan-chivay',
  name: 'Zoltan Chivay',
  description: 'Nain guerrier, berserker redoutable au combat rappeche.',
  species: 'dwarf',
  class: 'Guerrier',
  subclass: 'Berserker',
  level: 4,
  baseAbilities: {
    str: 18,
    dex: 10,
    con: 16,
    int: 12,
    wis: 14,
    cha: 10,
  },
  abilities: {
    str: 20,
    dex: 10,
    con: 18,
    int: 12,
    wis: 14,
    cha: 10,
  },
  max_hp: 40,
  current_hp: 40,
  ac: 18,
  speed: 7.5,
  proficiencies: ['athletics', 'intimidation', 'soins', 'artisanat'],
  skills: {
    athletics: 6,
    intimidation: 4,
    soins: 4,
    artisanat: 3,
  },
  features: [
    {
      name: 'Style de combat: Berserker',
      description: '+1 aux degats en melee.',
    },
    {
      name: 'Rage',
      description: '1 fois par session: +2 aux degats, -2 en CA pendant 3 tours.',
    },
    {
      name: 'Seconde chance',
      description: '1 fois par combat, annule un jet de degat rate.',
    },
    {
      name: 'Resistance aux poisons',
      description: 'Avantage sur les jets de sauvegarde contre les poisons.',
    },
    {
      name: 'Vision dans le noir',
      description: 'Peut voir dans le noir jusqua 60 pieds.',
    },
  ],
  inventory: [
    {
      name: 'Hache a deux mains',
      type: 'arme',
      damage: '1d12+4',
      description: 'Hache de guerre naine',
    },
    { name: 'Bouclier', type: 'armure', description: '+2 CA' },
    { name: 'Cotte de mailles', type: 'armure', description: 'CA 14, total CA 16 + bouclier = 18' },
    { name: 'Potion de Soins', type: 'potion', description: 'Restaure 2D6 PV' },
    {
      name: 'Potion de Force du Taureau',
      type: 'potion',
      description: '+2 en Force pour 1 combat',
    },
  ],
});

// Regis - Alchimiste Vampire (Niveau 5)
export const REGIS_TEMPLATE: WitcherCharacterTemplate = createTemplate({
  id: 'regis',
  name: 'Emiel Regis Rohellec Terzieff-Godefroy',
  description: 'Vampire noble, maitre alchimiste et erudit, specialiste des potions et poisons.',
  species: 'vampire',
  class: 'Alchimiste',
  subclass: null,
  level: 5,
  baseAbilities: {
    str: 14,
    dex: 16,
    con: 14,
    int: 18,
    wis: 12,
    cha: 16,
  },
  abilities: {
    str: 16,
    dex: 18,
    con: 16,
    int: 20,
    wis: 12,
    cha: 18,
  },
  max_hp: 35,
  current_hp: 35,
  ac: 15,
  speed: 9,
  proficiencies: ['alchimie', 'medecine', 'arcanes', 'persuasion'],
  skills: {
    alchimie: 8,
    medicine: 7,
    arcanes: 8,
    persuasion: 6,
  },
  features: [
    {
      name: 'Regeneration',
      description: 'Recupere 1D6 PV par tour de combat.',
    },
    {
      name: 'Immunite aux maladies et poisons',
      description: 'Immune a toutes les maladies et poisons (sauf ceux a base dargent).',
    },
    {
      name: 'Faiblesse au soleil',
      description: 'Subit 1D6 degats par tour en plein soleil.',
    },
    {
      name: 'Maitre alchimiste',
      description: 'Peut preparer 2 potions ou bombes par tour de combat.',
    },
    {
      name: 'Vision dans le noir',
      description: 'Peut voir dans le noir jusqua 60 pieds.',
    },
  ],
  inventory: [
    {
      name: 'Dague en argent',
      type: 'arme',
      damage: '1d4+2',
      description: 'Dague specialement forgee, efficace contre les monstres',
    },
    {
      name: 'Kit d alchimie',
      type: 'objet',
      description: 'Contient 5 fioles et 3 ingredients rares',
    },
    { name: 'Robe renforcee', type: 'armure', description: 'CA 12 + DEX mod = 15' },
    { name: 'Potion de Soins', type: 'potion', effect: 'Restaure 2D6 PV' },
    { name: 'Potion Force du Taureau', type: 'potion', effect: '+2 en Force pour 1 combat' },
    {
      name: 'Poison paralysant',
      type: 'potion',
      effect: 'Paralyse une cible pour 1D4 tours (jet de CONST DC 15)',
    },
  ],
  alchemyKit: {
    fioles: 5,
    rareIngredients: 3,
  },
  regeneration: 1,
  weaknesses: ['soleil', 'argent'],
  potions: [
    {
      name: 'Soins',
      effect: 'Restaure 2D6 PV',
      ingredients: ['Herbes de Brokilon', 'eau pure'],
      duration: 'Instantane',
    },
    {
      name: 'Force du Taureau',
      effect: '+2 en Force',
      ingredients: ['Sang de troll', 'racine de mandragore'],
      duration: '1 combat',
    },
    {
      name: 'Poison paralysant',
      effect: 'Paralyse la cible',
      ingredients: ['Venin de kikimora', 'champignon noir'],
      duration: '1D4 tours',
    },
  ],
});

// Template registry
export const WITCHER_TEMPLATES: Record<string, WitcherCharacterTemplate> = {
  geralt: GERALT_TEMPLATE,
  jaskier: JASKIER_TEMPLATE,
  yennefer: YENNEFER_TEMPLATE,
  zoltan: ZOLTAN_TEMPLATE,
  regis: REGIS_TEMPLATE,
};

export function getWitcherTemplates(): WitcherCharacterTemplate[] {
  return Object.values(WITCHER_TEMPLATES);
}

export function getWitcherTemplateById(id: string): WitcherCharacterTemplate | undefined {
  return WITCHER_TEMPLATES[id];
}

export function getWitcherTemplatesByClass(className: string): WitcherCharacterTemplate[] {
  return getWitcherTemplates().filter((t) => t.class === className);
}

export function getWitcherTemplatesBySpecies(species: string): WitcherCharacterTemplate[] {
  return getWitcherTemplates().filter((t) => t.species === species);
}

export function templateToCharacterRow(
  template: WitcherCharacterTemplate,
  campaignId: string,
  ownerId: string | null = null,
): Partial<CharacterRow> {
  return {
    campaign_id: campaignId,
    owner_id: ownerId,
    is_ai: false,
    name: template.name,
    species: template.species,
    class: template.class,
    subclass: template.subclass,
    level: template.level,
    str: template.abilities.str,
    dex: template.abilities.dex,
    con: template.abilities.con,
    int_score: template.abilities.int,
    wis: template.abilities.wis,
    cha: template.abilities.cha,
    max_hp: template.max_hp,
    current_hp: template.current_hp,
    ac: template.ac,
    speed: template.speed,
    proficiencies: template.proficiencies.reduce(
      (acc, p) => {
        acc[p] = true;
        return acc;
      },
      {} as Record<string, unknown>,
    ),
    features: template.features.map((f) => ({
      name: f.name,
      description: f.description,
    })),
    inventory: template.inventory,
    persona: {
      templateId: template.id,
      description: template.description,
      signs: template.signs,
      songs: template.songs,
      potions: template.potions,
      alchemyKit: template.alchemyKit,
      regeneration: template.regeneration,
      weaknesses: template.weaknesses,
      school: template.school,
    },
  };
}
