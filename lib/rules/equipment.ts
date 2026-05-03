import type { Universe } from '../db/types';

/**
 * Universe-agnostic shape of an item carried by a character.
 * Compatible with the existing `inventory` JSONB column shape
 * already produced by the per-universe character templates.
 */
export interface Item {
  name: string;
  /** Loose category. Used by UI for icons / grouping. */
  type:
    | 'weapon'
    | 'shield'
    | 'armor'
    | 'gear'
    | 'consumable'
    | 'focus'
    | 'tool'
    | 'trinket'
    | 'magic';
  /** Damage expression, e.g. "1d8 tranchant". Only on weapons. */
  damage?: string;
  /** Free-form note: range, properties, flavor. */
  effect?: string;
  /** For stackable items (rations, arrows, potions). */
  count?: number;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Donjons & Dragons 5e — SRD baseline
// ─────────────────────────────────────────────────────────────────────────

export const DND_WEAPONS = {
  dagger: {
    name: 'Dague',
    type: 'weapon',
    damage: '1d4 perforant',
    effect: 'finesse, légère, lancer (6/18 m)',
  },
  shortsword: { name: 'Épée courte', type: 'weapon', damage: '1d6 perforant', effect: 'finesse' },
  longsword: {
    name: 'Épée longue',
    type: 'weapon',
    damage: '1d8 tranchant',
    effect: 'polyvalente (1d10)',
  },
  greatsword: {
    name: 'Épée à deux mains',
    type: 'weapon',
    damage: '2d6 tranchant',
    effect: 'lourde, à deux mains',
  },
  rapier: { name: 'Rapière', type: 'weapon', damage: '1d8 perforant', effect: 'finesse' },
  scimitar: {
    name: 'Cimeterre',
    type: 'weapon',
    damage: '1d6 tranchant',
    effect: 'finesse, légère',
  },
  battleaxe: {
    name: 'Hache d’armes',
    type: 'weapon',
    damage: '1d8 tranchant',
    effect: 'polyvalente (1d10)',
  },
  warhammer: {
    name: 'Marteau de guerre',
    type: 'weapon',
    damage: '1d8 contondant',
    effect: 'polyvalente (1d10)',
  },
  mace: { name: 'Masse d’armes', type: 'weapon', damage: '1d6 contondant' },
  quarterstaff: {
    name: 'Bâton',
    type: 'weapon',
    damage: '1d6 contondant',
    effect: 'polyvalent (1d8)',
  },
  spear: {
    name: 'Lance',
    type: 'weapon',
    damage: '1d6 perforant',
    effect: 'lancer (6/18 m), polyvalente',
  },
  shortbow: {
    name: 'Arc court',
    type: 'weapon',
    damage: '1d6 perforant',
    effect: 'portée 24/96 m, deux mains',
  },
  longbow: {
    name: 'Arc long',
    type: 'weapon',
    damage: '1d8 perforant',
    effect: 'portée 45/180 m, deux mains',
  },
  crossbowLight: {
    name: 'Arbalète légère',
    type: 'weapon',
    damage: '1d8 perforant',
    effect: 'portée 24/96 m, recharge',
  },
  handaxe: {
    name: 'Hachette',
    type: 'weapon',
    damage: '1d6 tranchant',
    effect: 'légère, lancer (6/18 m)',
  },
  javelin: {
    name: 'Javeline',
    type: 'weapon',
    damage: '1d6 perforant',
    effect: 'lancer (9/36 m)',
  },
  sling: { name: 'Fronde', type: 'weapon', damage: '1d4 contondant', effect: 'portée 9/36 m' },
} satisfies Record<string, Item>;

export const DND_ARMOR = {
  padded: { name: 'Armure matelassée', type: 'armor', effect: 'CA 11 + Mod.Dex' },
  leather: { name: 'Armure de cuir', type: 'armor', effect: 'CA 11 + Mod.Dex' },
  studdedLeather: { name: 'Cuir clouté', type: 'armor', effect: 'CA 12 + Mod.Dex' },
  hide: { name: 'Armure en peau', type: 'armor', effect: 'CA 12 + Mod.Dex (max +2)' },
  chainShirt: { name: 'Chemise de mailles', type: 'armor', effect: 'CA 13 + Mod.Dex (max +2)' },
  scaleMail: { name: 'Écailles', type: 'armor', effect: 'CA 14 + Mod.Dex (max +2)' },
  chainmail: { name: 'Cotte de mailles', type: 'armor', effect: 'CA 16, désavantage Discrétion' },
  splint: { name: 'Harnois à lamelles', type: 'armor', effect: 'CA 17, désavantage Discrétion' },
  plate: { name: 'Harnois complet', type: 'armor', effect: 'CA 18, désavantage Discrétion' },
  shield: { name: 'Bouclier', type: 'shield', effect: '+2 CA' },
} satisfies Record<string, Item>;

export const DND_GEAR = {
  backpack: { name: 'Sac à dos', type: 'gear' },
  bedroll: { name: 'Couchage', type: 'gear' },
  rope: { name: 'Corde de chanvre (15 m)', type: 'gear' },
  torch: { name: 'Torche', type: 'gear', count: 5 },
  rations: { name: 'Ration de voyage', type: 'consumable', count: 10 },
  waterskin: { name: 'Outre d’eau', type: 'gear' },
  tinderbox: { name: 'Briquet à amadou', type: 'gear' },
  arrows: { name: 'Carquois (20 flèches)', type: 'consumable', count: 20 },
  bolts: { name: 'Carreaux d’arbalète (20)', type: 'consumable', count: 20 },
  holySymbol: { name: 'Symbole sacré', type: 'focus' },
  arcaneFocus: { name: 'Focaliseur arcanique', type: 'focus' },
  componentPouch: { name: 'Bourse à composantes', type: 'focus' },
  thievesTools: { name: 'Outils de voleur', type: 'tool' },
  herbalismKit: { name: 'Kit d’herboristerie', type: 'tool' },
  healerKit: { name: 'Kit de soins', type: 'tool', count: 1 },
  potionHealing: {
    name: 'Potion de soins',
    type: 'consumable',
    effect: 'Récupère 2d4+2 PV',
    count: 1,
  },
  lantern: { name: 'Lanterne à capote', type: 'gear' },
  oilFlask: { name: 'Fiole d’huile', type: 'gear', count: 2 },
} satisfies Record<string, Item>;

// ─────────────────────────────────────────────────────────────────────────
// The Witcher — items propres à l'univers
// ─────────────────────────────────────────────────────────────────────────

export const WITCHER_ITEMS = {
  silverSword: {
    name: 'Épée d’argent',
    type: 'weapon',
    damage: '1d8 tranchant',
    effect: 'efficace contre les monstres (vampires, lycanthropes, spectres)',
  },
  steelSword: {
    name: 'Épée d’acier',
    type: 'weapon',
    damage: '1d8 tranchant',
    effect: 'efficace contre les humains et bêtes',
  },
  shortsword: { name: 'Épée courte', type: 'weapon', damage: '1d6 perforant', effect: 'finesse' },
  dagger: {
    name: 'Dague de chasseur',
    type: 'weapon',
    damage: '1d4 perforant',
    effect: 'finesse, lancer',
  },
  crossbow: {
    name: 'Arbalète à répétition',
    type: 'weapon',
    damage: '1d6 perforant',
    effect: 'portée 24/96 m',
  },
  recurveBow: {
    name: 'Arc recourbé',
    type: 'weapon',
    damage: '1d8 perforant',
    effect: 'portée 45/180 m',
  },
  staff: {
    name: 'Bâton de mage',
    type: 'weapon',
    damage: '1d6 contondant',
    effect: 'focaliseur magique',
  },
  leather: { name: 'Tenue de cuir renforcé', type: 'armor', effect: 'CA 12 + Mod.Dex' },
  witcherGear: { name: 'Armure de sorceleur', type: 'armor', effect: 'CA 13 + Mod.Dex (max +3)' },
  scaleMail: { name: 'Cuirasse à écailles', type: 'armor', effect: 'CA 14 + Mod.Dex (max +2)' },
  medallion: {
    name: 'Médaillon de sorceleur',
    type: 'magic',
    effect: 'vibre en présence de magie ou de monstres',
  },
  swallowPotion: {
    name: 'Potion d’Hirondelle',
    type: 'consumable',
    effect: 'régénération 1d4 PV/tour pendant 1 minute',
    count: 2,
  },
  cat: {
    name: 'Potion du Chat',
    type: 'consumable',
    effect: 'vision dans le noir 1 heure',
    count: 1,
  },
  thunderbolt: {
    name: 'Potion Coup de Tonnerre',
    type: 'consumable',
    effect: '+2 dégâts d’armes pendant 1 minute',
    count: 1,
  },
  dimeritiumBomb: {
    name: 'Bombe de Dimeritium',
    type: 'consumable',
    effect: 'dissipe magie sur 3 m',
    count: 1,
  },
  grapeshot: {
    name: 'Bombe à mitraille',
    type: 'consumable',
    effect: '2d6 perforant sur 3 m, DD 13 Dex moitié',
    count: 2,
  },
  herbs: { name: 'Sachet d’herbes alchimiques', type: 'gear' },
  whetstone: { name: 'Pierre à aiguiser', type: 'gear' },
  bestiary: {
    name: 'Bestiaire annoté',
    type: 'gear',
    effect: 'avantage à l’identification de monstres connus',
  },
  oil: { name: 'Huile de lame', type: 'consumable', count: 3 },
  lutee: { name: 'Luth de troubadour', type: 'gear' },
  alchemistKit: { name: 'Laboratoire portatif', type: 'tool' },
} satisfies Record<string, Item>;

// ─────────────────────────────────────────────────────────────────────────
// Donjon de Naheulbeuk — items dans le ton humoristique de la saga
// ─────────────────────────────────────────────────────────────────────────

export const NAHEULBEUK_ITEMS = {
  rustySword: {
    name: 'Épée rouillée',
    type: 'weapon',
    damage: '1d6 tranchant',
    effect: 'sent un peu, mais elle coupe encore',
  },
  rapierSword: {
    name: 'Rapière du dimanche',
    type: 'weapon',
    damage: '1d8 perforant',
    effect: 'finesse, classe',
  },
  warHammer: {
    name: 'Marteau de fonte',
    type: 'weapon',
    damage: '1d8 contondant',
    effect: 'forgé par un nain bourré',
  },
  twohander: {
    name: 'Latte à deux mains',
    type: 'weapon',
    damage: '2d6 tranchant',
    effect: 'lourde, faut s’accrocher',
  },
  shortbow: {
    name: 'Arc taillé maison',
    type: 'weapon',
    damage: '1d6 perforant',
    effect: 'portée 18/72 m, des fois la corde casse',
  },
  staff: {
    name: 'Bâton noueux',
    type: 'weapon',
    damage: '1d6 contondant',
    effect: 'fait office de canne aussi',
  },
  bardLute: {
    name: 'Luth dépressif',
    type: 'weapon',
    damage: '1d4 contondant',
    effect: 'résonne mal',
  },
  dagger: {
    name: 'Surin de bistrot',
    type: 'weapon',
    damage: '1d4 perforant',
    effect: 'finesse, légère, traîne dans une botte',
  },
  leather: { name: 'Cuirasse râpée', type: 'armor', effect: 'CA 11 + Mod.Dex' },
  chainmail: {
    name: 'Cotte de mailles trouée',
    type: 'armor',
    effect: 'CA 14, ferraille bruyamment',
  },
  shield: { name: 'Bouclier en bois', type: 'shield', effect: '+2 CA, sent le champignon' },
  helmet: { name: 'Casque cabossé', type: 'gear', effect: 'protège pas mais c’est joli' },
  rationPate: {
    name: 'Pâté de campagne (boîte)',
    type: 'consumable',
    effect: 'mange-le froid, c’est mieux',
    count: 5,
  },
  flask: {
    name: 'Gourde d’eau-de-vie',
    type: 'consumable',
    effect: 'soigne 1d4 PV ou rend bourré sur un 1',
    count: 2,
  },
  pipe: { name: 'Pipe en terre', type: 'gear', effect: 'utile pour réfléchir' },
  rope: { name: 'Corde élimée', type: 'gear', effect: '10 m, casse au mauvais moment' },
  torch: { name: 'Torche poisseuse', type: 'gear', count: 3 },
  spellbook: {
    name: 'Grimoire taché de café',
    type: 'focus',
    effect: 'sort 1/jour, si l’encre tient',
  },
  wand: { name: 'Baguette ébréchée', type: 'focus', effect: 'lance des étincelles aléatoires' },
  holySymbol: { name: 'Pendentif religieux', type: 'focus', effect: 'le saint a l’air mécontent' },
  thievesTools: {
    name: 'Trousseau de crochets',
    type: 'tool',
    effect: 'piqué à un voleur (lui-même)',
  },
  trinket: {
    name: 'Bibelot mystérieux',
    type: 'trinket',
    effect: 'aucun effet connu, mais il brille',
  },
  potionHealing: {
    name: 'Potion verte douteuse',
    type: 'consumable',
    effect: 'soigne 1d8+1 PV ou donne mal au ventre',
    count: 1,
  },
  rabbitFoot: {
    name: 'Patte de lapin',
    type: 'trinket',
    effect: 'porte chance, paraît-il',
  },
} satisfies Record<string, Item>;

export function getItemCatalog(universe: Universe): Record<string, Item> {
  if (universe === 'witcher') return WITCHER_ITEMS;
  if (universe === 'naheulbeuk') return NAHEULBEUK_ITEMS;
  return { ...DND_WEAPONS, ...DND_ARMOR, ...DND_GEAR };
}
