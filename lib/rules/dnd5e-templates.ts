/**
 * Pre-configured character templates for the default Donjons & Dragons 5e
 * universe (SRD). Generic archetypes — no copyrighted Forgotten Realms or
 * other proprietary IP. Tone: dark fantasy cozy, French-flavored.
 */

export interface DndCharacterTemplate {
  id: string;
  name: string;
  description: string;
  species: string; // SRD species id (human, elf, dwarf, halfling, halfOrc, …)
  class: string; // SRD class id
  subclass: string | null;
  level: number;
  baseAbilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
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
}

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function createTemplate(
  template: Omit<DndCharacterTemplate, 'abilityModifiers'>,
): DndCharacterTemplate {
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

// Le Paladin du Serment — défenseur du serment de la Dévotion.
export const PALADIN_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'paladin-devotion',
  name: 'Le Paladin',
  description:
    "Cuirassé jusqu'aux dents, lent à se mettre en colère, plus lent encore à se taire une fois qu'il y est. Serment de la Dévotion.",
  species: 'human',
  class: 'paladin',
  subclass: 'Serment de la Dévotion',
  level: 3,
  baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 },
  abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 },
  max_hp: 28,
  current_hp: 28,
  ac: 18,
  speed: 9,
  proficiencies: ['athletics', 'persuasion', 'religion', 'insight'],
  skills: { athletics: 5, persuasion: 4, religion: 2, insight: 3 },
  features: [
    {
      name: 'Imposition des mains',
      description: '15 PV à répartir par jour pour soigner.',
    },
    {
      name: 'Châtiment divin',
      description:
        'Sur une touche, dépense un emplacement de sort pour ajouter 2d8 dégâts radieux (3d8 vs morts-vivants/fiélons).',
    },
    {
      name: 'Aura de protection',
      description: '(niv. 6) Bonus +CHA aux jets de sauvegarde des alliés à 3 m.',
    },
  ],
  inventory: [
    { name: 'Épée longue', type: 'weapon', damage: '1d8 tranchant' },
    { name: 'Bouclier', type: 'shield' },
    { name: 'Cotte de mailles', type: 'armor' },
    { name: 'Symbole sacré', type: 'focus' },
    { name: 'Ration de voyage', type: 'consumable', count: 5 },
  ],
});

// L'Archère — élfe rôdeuse, chasseuse à l'arc long.
export const ROUDEUSE_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'roudeuse-chasseuse',
  name: "L'Archère",
  description:
    'Silhouette fine, regard qui devine où le pas suivant va se poser. Vit plus dans la forêt que dans les auberges. Conclave du chasseur.',
  species: 'elf',
  class: 'ranger',
  subclass: 'Conclave du chasseur',
  level: 3,
  baseAbilities: { str: 12, dex: 16, con: 13, int: 11, wis: 14, cha: 10 },
  abilities: { str: 12, dex: 18, con: 13, int: 11, wis: 14, cha: 10 },
  max_hp: 25,
  current_hp: 25,
  ac: 15,
  speed: 9,
  proficiencies: ['perception', 'survival', 'stealth', 'nature'],
  skills: { perception: 4, survival: 4, stealth: 6, nature: 2 },
  features: [
    {
      name: 'Ennemi juré (gobelinoïdes)',
      description: 'Avantage aux jets de Sagesse (Survie) pour pister les gobelinoïdes.',
    },
    {
      name: 'Explorateur né',
      description: 'Le groupe avance à allure normale en exploration sans laisser de traces.',
    },
    {
      name: 'Style de combat — Tir',
      description: '+2 aux jets d’attaque à distance.',
    },
  ],
  inventory: [
    { name: 'Arc long', type: 'weapon', damage: '1d8 perforant', effect: 'portée 45/180 m' },
    { name: 'Carquois (20 flèches)', type: 'consumable', count: 20 },
    { name: 'Épée courte', type: 'weapon', damage: '1d6 perforant' },
    { name: 'Armure de cuir clouté', type: 'armor' },
    { name: 'Cape de sylvain', type: 'gear' },
  ],
});

// La Mage — humaine magicienne, école d'évocation.
export const MAGE_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'mage-evocation',
  name: 'La Mage',
  description:
    "Diplomée d'une académie poussiéreuse, méprise les improvisations mais finit toujours par improviser. École d'évocation.",
  species: 'human',
  class: 'wizard',
  subclass: 'École d’Évocation',
  level: 3,
  baseAbilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
  abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
  max_hp: 18,
  current_hp: 18,
  ac: 12,
  speed: 9,
  proficiencies: ['arcana', 'history', 'investigation', 'insight'],
  skills: { arcana: 5, history: 5, investigation: 5, insight: 3 },
  features: [
    {
      name: 'Sculpter les sorts',
      description:
        "Sur un sort d'évocation à effet de zone, peut épargner 1 + niveau du sort créatures choisies.",
    },
    {
      name: 'Récupération arcanique',
      description:
        'Lors d’un repos court, récupère des emplacements de sort dont la somme ≤ niveau / 2 (max niveau 5).',
    },
    {
      name: 'Grimoire',
      description: '6 sorts niv. 1, 4 sorts niv. 2 connus.',
    },
  ],
  inventory: [
    { name: 'Bâton de mage', type: 'focus' },
    { name: 'Grimoire', type: 'book', description: 'Sorts connus inscrits.' },
    { name: 'Composantes (sachet)', type: 'consumable', count: 1 },
    { name: 'Robe arcanique', type: 'armor' },
    { name: 'Dague', type: 'weapon', damage: '1d4 perforant' },
  ],
});

// Le Clerc — nain, domaine de la Lumière, marteau bénit.
export const CLERC_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'clerc-lumiere',
  name: 'Le Clerc',
  description:
    'Nain à la barbe tressée, plus enclin à frapper qu’à prêcher. Sert un dieu solaire mineur. Domaine de la Lumière.',
  species: 'dwarf',
  class: 'cleric',
  subclass: 'Domaine de la Lumière',
  level: 3,
  baseAbilities: { str: 14, dex: 10, con: 14, int: 11, wis: 16, cha: 12 },
  abilities: { str: 14, dex: 10, con: 16, int: 11, wis: 16, cha: 12 },
  max_hp: 27,
  current_hp: 27,
  ac: 18,
  speed: 7.5,
  proficiencies: ['insight', 'religion', 'medicine', 'history'],
  skills: { insight: 5, religion: 2, medicine: 5, history: 0 },
  features: [
    {
      name: 'Lumière éclatante',
      description:
        "Réaction : impose un désavantage à un jet d'attaque dirigé contre un allié à 9 m (1d4 de Sagesse / repos long).",
    },
    {
      name: 'Canalisation d’énergie : éclat radieux',
      description:
        'Action : explosion lumineuse à 9 m, sauvegarde DEX ou 2d10+niv. dégâts radieux.',
    },
    {
      name: 'Soin (sort)',
      description: 'Touche un allié, restaure 1d8 + MOD SAG PV (niv. 1).',
    },
  ],
  inventory: [
    { name: 'Marteau de guerre', type: 'weapon', damage: '1d8 contondant' },
    { name: 'Bouclier blasonné', type: 'shield' },
    { name: 'Harnais d’écailles', type: 'armor' },
    { name: 'Symbole sacré (soleil)', type: 'focus' },
    { name: 'Eau bénite', type: 'consumable', count: 2 },
  ],
});

// La Voleuse — halfling roublard, école de l'assassin.
export const VOLEUSE_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'voleuse-assassin',
  name: 'La Voleuse',
  description:
    'Halfling à pas de chat, sourire trop large, lames trop bien aiguisées. Préfère le silence à la gloire. École de l’assassin.',
  species: 'halfling',
  class: 'rogue',
  subclass: 'Assassin',
  level: 3,
  baseAbilities: { str: 9, dex: 16, con: 13, int: 12, wis: 13, cha: 14 },
  abilities: { str: 9, dex: 18, con: 13, int: 12, wis: 13, cha: 14 },
  max_hp: 21,
  current_hp: 21,
  ac: 15,
  speed: 7.5,
  proficiencies: ['stealth', 'sleightOfHand', 'deception', 'perception'],
  skills: { stealth: 6, sleightOfHand: 6, deception: 4, perception: 3 },
  features: [
    {
      name: 'Attaque sournoise',
      description: '+2d6 dégâts si avantage (ou allié à 1,5 m de la cible). 1× / tour.',
    },
    {
      name: 'Action rusée',
      description: 'Action bonus : se Cacher, se Désengager ou Foncer.',
    },
    {
      name: 'Assaut foudroyant',
      description: "Au 1er tour de combat, avantage contre toute cible n'ayant pas encore agi.",
    },
  ],
  inventory: [
    { name: 'Rapière', type: 'weapon', damage: '1d8 perforant' },
    { name: 'Dagues', type: 'weapon', damage: '1d4 perforant', count: 4 },
    { name: 'Armure de cuir', type: 'armor' },
    { name: 'Outils de voleur', type: 'kit' },
    { name: 'Capuchon noir', type: 'gear' },
  ],
});

// Le Barbare — demi-orc, voie du berserker.
export const BARBARE_TEMPLATE: DndCharacterTemplate = createTemplate({
  id: 'barbare-berserker',
  name: 'Le Barbare',
  description:
    'Demi-orc taillé pour rester debout après tout le monde. Parle peu, frappe fort, encaisse encore plus. Voie du Berserker.',
  species: 'halfOrc',
  class: 'barbarian',
  subclass: 'Voie du Berserker',
  level: 3,
  baseAbilities: { str: 16, dex: 13, con: 15, int: 8, wis: 12, cha: 8 },
  abilities: { str: 18, dex: 13, con: 16, int: 8, wis: 12, cha: 8 },
  max_hp: 33,
  current_hp: 33,
  ac: 14,
  speed: 9,
  proficiencies: ['athletics', 'intimidation', 'survival', 'perception'],
  skills: { athletics: 6, intimidation: 1, survival: 3, perception: 3 },
  features: [
    {
      name: 'Rage',
      description:
        'Action bonus : +2 dégâts en mêlée, avantage aux jets de FOR, résistance aux dégâts contondants/perforants/tranchants. 3× / repos long.',
    },
    {
      name: 'Frénésie',
      description:
        'Pendant la rage, action bonus pour effectuer une attaque supplémentaire. Une fatigue à la fin.',
    },
    {
      name: 'Endurance acharnée',
      description:
        '1× / repos long : réduit à 0 PV mais pas tué net, retombe à 1 PV au lieu de KO.',
    },
  ],
  inventory: [
    { name: 'Hache à deux mains', type: 'weapon', damage: '1d12 tranchant' },
    { name: 'Javelines', type: 'weapon', damage: '1d6 perforant', count: 4 },
    { name: 'Pectoral de cuir clouté', type: 'armor' },
    { name: 'Cor de guerre', type: 'gear' },
  ],
});

export const DND_TEMPLATES: Record<string, DndCharacterTemplate> = {
  paladin: PALADIN_TEMPLATE,
  roudeuse: ROUDEUSE_TEMPLATE,
  mage: MAGE_TEMPLATE,
  clerc: CLERC_TEMPLATE,
  voleuse: VOLEUSE_TEMPLATE,
  barbare: BARBARE_TEMPLATE,
};

export function getDndTemplates(): DndCharacterTemplate[] {
  return Object.values(DND_TEMPLATES);
}

export function getDndTemplateById(id: string): DndCharacterTemplate | undefined {
  return DND_TEMPLATES[id];
}
