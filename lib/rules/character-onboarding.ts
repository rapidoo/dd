import type { Universe } from '../db/types';
import { rollExpression } from './dice';
import {
  DND_ARMOR,
  DND_GEAR,
  DND_WEAPONS,
  type Item,
  NAHEULBEUK_ITEMS,
  WITCHER_ITEMS,
} from './equipment';
import { defaultRandom, type Random } from './types';

/**
 * Currency the character starts the game with.
 * Stored as the `currency` JSONB column on the characters table.
 */
export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface GoldRollResult {
  /** Dice expression rolled, e.g. "5d4". */
  expression: string;
  /** Multiplier applied to the dice sum (1 for monks, 10 typically). */
  multiplier: number;
  /** Individual dice that landed. */
  dice: number[];
  /** Final currency to credit on the character. */
  currency: Currency;
  /** Human-readable label of the dominant coin (e.g. "po"). */
  coinLabel: string;
}

interface GoldFormula {
  /** Dice expression like "5d4". */
  dice: string;
  /** Sum is multiplied by this (10 in most D&D classes, 1 for monk). */
  multiplier: number;
  /** Coin slot the result lands in — D&D uses gp by default. */
  coin: keyof Currency;
}

interface ClassOnboarding {
  gold: GoldFormula;
  /** Items granted on top of the gold roll. */
  startingKit: Item[];
}

// ─────────────────────────────────────────────────────────────────────────
// Donjons & Dragons 5e — formules PHB
// ─────────────────────────────────────────────────────────────────────────

const D10 = (count: number, multiplier = 10): GoldFormula => ({
  dice: `${count}d4`,
  multiplier,
  coin: 'gp',
});

const DND_ONBOARDING: Record<string, ClassOnboarding> = {
  barbarian: {
    gold: D10(2),
    startingKit: [
      DND_WEAPONS.greatsword,
      DND_WEAPONS.handaxe,
      DND_WEAPONS.javelin,
      DND_GEAR.backpack,
      DND_GEAR.rations,
    ],
  },
  bard: {
    gold: D10(5),
    startingKit: [
      DND_WEAPONS.rapier,
      DND_WEAPONS.dagger,
      DND_ARMOR.leather,
      DND_GEAR.backpack,
      { name: 'Luth', type: 'gear', effect: 'instrument de barde' },
    ],
  },
  cleric: {
    gold: D10(5),
    startingKit: [
      DND_WEAPONS.mace,
      DND_ARMOR.scaleMail,
      DND_ARMOR.shield,
      DND_GEAR.holySymbol,
      DND_GEAR.rations,
    ],
  },
  druid: {
    gold: D10(2),
    startingKit: [
      DND_WEAPONS.scimitar,
      DND_WEAPONS.quarterstaff,
      DND_ARMOR.leather,
      DND_GEAR.herbalismKit,
      DND_GEAR.rations,
    ],
  },
  fighter: {
    gold: D10(5),
    startingKit: [
      DND_WEAPONS.longsword,
      DND_ARMOR.shield,
      DND_ARMOR.chainmail,
      DND_WEAPONS.crossbowLight,
      DND_GEAR.bolts,
      DND_GEAR.backpack,
    ],
  },
  monk: {
    // Monks roll 5d4 gp directly (no x10).
    gold: { dice: '5d4', multiplier: 1, coin: 'gp' },
    startingKit: [
      DND_WEAPONS.shortsword,
      DND_WEAPONS.dagger,
      { name: 'Dotation de moine', type: 'gear', effect: 'tenue de méditation, sandales' },
      DND_GEAR.rations,
    ],
  },
  paladin: {
    gold: D10(5),
    startingKit: [
      DND_WEAPONS.longsword,
      DND_ARMOR.shield,
      DND_ARMOR.chainmail,
      DND_WEAPONS.javelin,
      DND_GEAR.holySymbol,
    ],
  },
  ranger: {
    gold: D10(5),
    startingKit: [
      DND_WEAPONS.longbow,
      DND_GEAR.arrows,
      DND_WEAPONS.shortsword,
      DND_ARMOR.studdedLeather,
      DND_GEAR.rations,
    ],
  },
  rogue: {
    gold: D10(4),
    startingKit: [
      DND_WEAPONS.rapier,
      DND_WEAPONS.shortbow,
      DND_GEAR.arrows,
      DND_ARMOR.leather,
      DND_GEAR.thievesTools,
      DND_WEAPONS.dagger,
    ],
  },
  sorcerer: {
    gold: D10(3),
    startingKit: [
      DND_WEAPONS.dagger,
      DND_GEAR.arcaneFocus,
      DND_GEAR.componentPouch,
      DND_GEAR.backpack,
    ],
  },
  warlock: {
    gold: D10(4),
    startingKit: [
      DND_WEAPONS.dagger,
      DND_ARMOR.leather,
      DND_GEAR.arcaneFocus,
      DND_GEAR.componentPouch,
    ],
  },
  wizard: {
    gold: D10(4),
    startingKit: [
      DND_WEAPONS.quarterstaff,
      DND_GEAR.arcaneFocus,
      DND_GEAR.componentPouch,
      { name: 'Grimoire', type: 'focus', effect: 'sorts copiés' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// The Witcher — couronnes (stockées dans `gp`)
// ─────────────────────────────────────────────────────────────────────────

const D6 = (count: number, multiplier = 10): GoldFormula => ({
  dice: `${count}d6`,
  multiplier,
  coin: 'gp',
});

const WITCHER_ONBOARDING: Record<string, ClassOnboarding> = {
  witcher: {
    gold: D6(4),
    startingKit: [
      WITCHER_ITEMS.silverSword,
      WITCHER_ITEMS.steelSword,
      WITCHER_ITEMS.witcherGear,
      WITCHER_ITEMS.medallion,
      WITCHER_ITEMS.swallowPotion,
      WITCHER_ITEMS.oil,
    ],
  },
  mage: {
    gold: D6(5),
    startingKit: [
      WITCHER_ITEMS.staff,
      WITCHER_ITEMS.dagger,
      WITCHER_ITEMS.leather,
      { name: 'Grimoire d’Aretuza', type: 'focus', effect: 'sorts copiés' },
      WITCHER_ITEMS.herbs,
    ],
  },
  thief: {
    gold: D6(3),
    startingKit: [
      WITCHER_ITEMS.shortsword,
      WITCHER_ITEMS.dagger,
      WITCHER_ITEMS.leather,
      { name: 'Crochets de serrurier', type: 'tool', effect: 'pour les portes obstinées' },
      WITCHER_ITEMS.swallowPotion,
    ],
  },
  scout: {
    gold: D6(2),
    startingKit: [
      WITCHER_ITEMS.recurveBow,
      { name: 'Carquois de chasse (20)', type: 'consumable', count: 20 },
      WITCHER_ITEMS.dagger,
      WITCHER_ITEMS.leather,
      WITCHER_ITEMS.bestiary,
    ],
  },
  warrior: {
    gold: D6(3),
    startingKit: [
      WITCHER_ITEMS.steelSword,
      WITCHER_ITEMS.scaleMail,
      { name: 'Bouclier en chêne', type: 'shield', effect: '+2 CA' },
      WITCHER_ITEMS.whetstone,
    ],
  },
  alchemist: {
    gold: D6(4),
    startingKit: [
      WITCHER_ITEMS.dagger,
      WITCHER_ITEMS.alchemistKit,
      WITCHER_ITEMS.swallowPotion,
      WITCHER_ITEMS.cat,
      WITCHER_ITEMS.thunderbolt,
      WITCHER_ITEMS.grapeshot,
    ],
  },
  // Bardes du Continent — troubadours qui vivent du verbe, pas de la magie.
  bard: {
    gold: D6(3),
    startingKit: [
      WITCHER_ITEMS.lutee,
      WITCHER_ITEMS.dagger,
      WITCHER_ITEMS.shortsword,
      WITCHER_ITEMS.leather,
      { name: 'Carnet de chansons', type: 'gear', effect: 'recueil de ballades et de rumeurs' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Donjon de Naheulbeuk — pièces d'or (PO), stockées dans `gp`
// ─────────────────────────────────────────────────────────────────────────

const NAHEULBEUK_ONBOARDING: Record<string, ClassOnboarding> = {
  ranger: {
    gold: { dice: '1d6', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.shortbow,
      NAHEULBEUK_ITEMS.dagger,
      NAHEULBEUK_ITEMS.leather,
      NAHEULBEUK_ITEMS.rationPate,
      NAHEULBEUK_ITEMS.flask,
    ],
  },
  rogue: {
    gold: { dice: '2d6', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.dagger,
      NAHEULBEUK_ITEMS.thievesTools,
      NAHEULBEUK_ITEMS.leather,
      NAHEULBEUK_ITEMS.rope,
      NAHEULBEUK_ITEMS.trinket,
    ],
  },
  wizard: {
    gold: { dice: '1d4', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.staff,
      NAHEULBEUK_ITEMS.spellbook,
      NAHEULBEUK_ITEMS.wand,
      NAHEULBEUK_ITEMS.rationPate,
    ],
  },
  fighter: {
    gold: { dice: '1d6', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.rustySword,
      NAHEULBEUK_ITEMS.shield,
      NAHEULBEUK_ITEMS.chainmail,
      NAHEULBEUK_ITEMS.helmet,
      NAHEULBEUK_ITEMS.flask,
    ],
  },
  barbarian: {
    gold: { dice: '1d4', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.twohander,
      NAHEULBEUK_ITEMS.flask,
      NAHEULBEUK_ITEMS.rationPate,
      NAHEULBEUK_ITEMS.rope,
    ],
  },
  paladin: {
    gold: { dice: '2d4', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.rustySword,
      NAHEULBEUK_ITEMS.shield,
      NAHEULBEUK_ITEMS.chainmail,
      NAHEULBEUK_ITEMS.holySymbol,
      NAHEULBEUK_ITEMS.potionHealing,
    ],
  },
  bard: {
    gold: { dice: '1d4', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.bardLute,
      NAHEULBEUK_ITEMS.rapierSword,
      NAHEULBEUK_ITEMS.leather,
      NAHEULBEUK_ITEMS.pipe,
      NAHEULBEUK_ITEMS.flask,
    ],
  },
  cleric: {
    gold: { dice: '2d4', multiplier: 10, coin: 'gp' },
    startingKit: [
      NAHEULBEUK_ITEMS.warHammer,
      NAHEULBEUK_ITEMS.shield,
      NAHEULBEUK_ITEMS.chainmail,
      NAHEULBEUK_ITEMS.holySymbol,
      NAHEULBEUK_ITEMS.potionHealing,
    ],
  },
};

const ONBOARDING_BY_UNIVERSE: Record<Universe, Record<string, ClassOnboarding>> = {
  dnd5e: DND_ONBOARDING,
  witcher: WITCHER_ONBOARDING,
  naheulbeuk: NAHEULBEUK_ONBOARDING,
};

const DEFAULT_FALLBACK: ClassOnboarding = {
  gold: { dice: '4d4', multiplier: 10, coin: 'gp' },
  startingKit: [DND_WEAPONS.dagger, DND_GEAR.backpack, DND_GEAR.rations],
};

const COIN_LABELS: Record<Universe, string> = {
  dnd5e: 'po',
  witcher: 'couronnes',
  naheulbeuk: 'PO',
};

export function getCoinLabel(universe: Universe): string {
  return COIN_LABELS[universe];
}

export function getGoldFormula(universe: Universe, classId: string): GoldFormula {
  return (ONBOARDING_BY_UNIVERSE[universe]?.[classId] ?? DEFAULT_FALLBACK).gold;
}

export function getStartingKit(universe: Universe, classId: string): Item[] {
  return (ONBOARDING_BY_UNIVERSE[universe]?.[classId] ?? DEFAULT_FALLBACK).startingKit;
}

export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

export function rollStartingGold(
  universe: Universe,
  classId: string,
  rng: Random = defaultRandom,
): GoldRollResult {
  const formula = getGoldFormula(universe, classId);
  const result = rollExpression(formula.dice, rng);
  const total = result.total * formula.multiplier;
  const currency = emptyCurrency();
  currency[formula.coin] = total;
  const expression =
    formula.multiplier === 1 ? formula.dice : `${formula.dice} × ${formula.multiplier}`;
  return {
    expression,
    multiplier: formula.multiplier,
    dice: result.dice,
    currency,
    coinLabel: COIN_LABELS[universe],
  };
}
