import type { Universe } from '../db/types';

/**
 * Starting spell shape persisted on `characters.spells_known`.
 * Compact on purpose — a full grimoire is out of scope for onboarding.
 */
export interface Spell {
  id: string;
  name: string;
  /** 0 = cantrip, 1 = level 1, etc. */
  level: number;
  school?: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Donjons & Dragons 5e — sorts d'ouverture par classe
// ─────────────────────────────────────────────────────────────────────────

const DND_SPELLS: Record<string, Spell[]> = {
  wizard: [
    {
      id: 'mage-hand',
      name: 'Main du mage',
      level: 0,
      school: 'Conjuration',
      description: 'Crée une main spectrale qui manipule un objet à distance (9 m).',
    },
    {
      id: 'fire-bolt',
      name: 'Trait de feu',
      level: 0,
      school: 'Évocation',
      description: '1d10 dégâts de feu à 36 m.',
    },
    {
      id: 'prestidigitation',
      name: 'Prestidigitation',
      level: 0,
      school: 'Transmutation',
      description: 'Petits effets magiques mineurs (étincelle, son, nettoyage).',
    },
    {
      id: 'magic-missile',
      name: 'Projectile magique',
      level: 1,
      school: 'Évocation',
      description: '3 traits de force, 1d4+1 chacun, touche automatique.',
    },
    {
      id: 'shield',
      name: 'Bouclier',
      level: 1,
      school: 'Abjuration',
      description: 'Réaction : +5 CA jusqu’au début du tour suivant.',
    },
    {
      id: 'detect-magic',
      name: 'Détection de la magie',
      level: 1,
      school: 'Divination',
      description: 'Sens la magie sur 9 m pendant 10 minutes (concentration).',
    },
    {
      id: 'sleep',
      name: 'Sommeil',
      level: 1,
      school: 'Enchantement',
      description: 'Endort 5d8 PV de créatures dans un rayon de 6 m.',
    },
    {
      id: 'mage-armor',
      name: 'Armure du mage',
      level: 1,
      school: 'Abjuration',
      description: 'CA 13 + Mod.Dex pendant 8 heures (sans armure).',
    },
  ],
  sorcerer: [
    {
      id: 'fire-bolt',
      name: 'Trait de feu',
      level: 0,
      school: 'Évocation',
      description: '1d10 dégâts de feu à 36 m.',
    },
    {
      id: 'mage-hand',
      name: 'Main du mage',
      level: 0,
      school: 'Conjuration',
      description: 'Crée une main spectrale.',
    },
    {
      id: 'prestidigitation',
      name: 'Prestidigitation',
      level: 0,
      school: 'Transmutation',
      description: 'Effets mineurs.',
    },
    {
      id: 'light',
      name: 'Lumière',
      level: 0,
      school: 'Évocation',
      description: 'Un objet émet une lumière vive (6 m) pendant 1 heure.',
    },
    {
      id: 'magic-missile',
      name: 'Projectile magique',
      level: 1,
      school: 'Évocation',
      description: '3 traits de force, 1d4+1 chacun.',
    },
    {
      id: 'shield',
      name: 'Bouclier',
      level: 1,
      school: 'Abjuration',
      description: 'Réaction : +5 CA.',
    },
  ],
  warlock: [
    {
      id: 'eldritch-blast',
      name: 'Décharge occulte',
      level: 0,
      school: 'Évocation',
      description: 'Trait de force 1d10 à 36 m. +1 trait à 5/11/17.',
    },
    {
      id: 'minor-illusion',
      name: 'Illusion mineure',
      level: 0,
      school: 'Illusion',
      description: 'Image ou son illusoire à 9 m.',
    },
    {
      id: 'hex',
      name: 'Maléfice',
      level: 1,
      school: 'Enchantement',
      description: 'Cible subit +1d6 dégâts nécrotiques par tes attaques (concentration, 1 heure).',
    },
    {
      id: 'armor-of-agathys',
      name: 'Armure d’Agathys',
      level: 1,
      school: 'Abjuration',
      description: '5 PV temporaires + 5 dégâts froid à qui te frappe en mêlée.',
    },
  ],
  cleric: [
    {
      id: 'sacred-flame',
      name: 'Flamme sacrée',
      level: 0,
      school: 'Évocation',
      description: 'Cible doit réussir DD Dex ou subir 1d8 dégâts radiants.',
    },
    {
      id: 'guidance',
      name: 'Conseil',
      level: 0,
      school: 'Divination',
      description: 'Cible amie : +1d4 à un test de caractéristique (concentration).',
    },
    {
      id: 'light',
      name: 'Lumière',
      level: 0,
      school: 'Évocation',
      description: 'Objet brille (6 m) pendant 1 heure.',
    },
    {
      id: 'cure-wounds',
      name: 'Soins',
      level: 1,
      school: 'Évocation',
      description: '1d8 + Mod.Sag PV restaurés au toucher.',
    },
    {
      id: 'bless',
      name: 'Bénédiction',
      level: 1,
      school: 'Enchantement',
      description: '3 alliés : +1d4 attaques et sauvegardes (concentration, 1 minute).',
    },
    {
      id: 'shield-of-faith',
      name: 'Bouclier de la foi',
      level: 1,
      school: 'Abjuration',
      description: '+2 CA à un allié (concentration, 10 minutes).',
    },
    {
      id: 'guiding-bolt',
      name: 'Trait guidé',
      level: 1,
      school: 'Évocation',
      description: '4d6 radiant + avantage au prochain attaquant.',
    },
  ],
  druid: [
    {
      id: 'druidcraft',
      name: 'Druidisme',
      level: 0,
      school: 'Transmutation',
      description: 'Petits effets : prévision météo, faire pousser une fleur.',
    },
    {
      id: 'produce-flame',
      name: 'Production de flammes',
      level: 0,
      school: 'Conjuration',
      description: 'Flamme dans la main : éclairage ou jet 1d8 feu.',
    },
    {
      id: 'goodberry',
      name: 'Baies nourricières',
      level: 1,
      school: 'Transmutation',
      description: '10 baies, chacune restaure 1 PV et nourrit pour 1 jour.',
    },
    {
      id: 'entangle',
      name: 'Enchevêtrement',
      level: 1,
      school: 'Conjuration',
      description: 'Lianes immobilisent dans une zone de 6 m (concentration).',
    },
    {
      id: 'cure-wounds',
      name: 'Soins',
      level: 1,
      school: 'Évocation',
      description: '1d8 + Mod.Sag PV.',
    },
    {
      id: 'thunderwave',
      name: 'Onde de tonnerre',
      level: 1,
      school: 'Évocation',
      description: '2d8 tonnerre dans un cube de 4,5 m, repousse de 3 m.',
    },
  ],
  bard: [
    {
      id: 'vicious-mockery',
      name: 'Moquerie cruelle',
      level: 0,
      school: 'Enchantement',
      description: 'Cible : 1d4 psychique + désavantage à sa prochaine attaque.',
    },
    {
      id: 'minor-illusion',
      name: 'Illusion mineure',
      level: 0,
      school: 'Illusion',
      description: 'Image ou son illusoire.',
    },
    {
      id: 'healing-word',
      name: 'Mot guérisseur',
      level: 1,
      school: 'Évocation',
      description: '1d4 + Mod.Cha PV à 18 m, action bonus.',
    },
    {
      id: 'dissonant-whispers',
      name: 'Murmures discordants',
      level: 1,
      school: 'Enchantement',
      description: '3d6 psychique + force de fuir.',
    },
    {
      id: 'charm-person',
      name: 'Charme-personne',
      level: 1,
      school: 'Enchantement',
      description: 'Cible amicale envers toi (jusqu’à 1 heure).',
    },
    {
      id: 'thunderwave',
      name: 'Onde de tonnerre',
      level: 1,
      school: 'Évocation',
      description: '2d8 tonnerre + repousse.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// The Witcher — signes pour le sorceleur, sorts pour le mage
// ─────────────────────────────────────────────────────────────────────────

const WITCHER_SPELLS: Record<string, Spell[]> = {
  witcher: [
    {
      id: 'igni',
      name: 'Igni',
      level: 0,
      school: 'Signe',
      description: 'Jet de flammes : 1d8 feu à 4,5 m, DD 13 Dex moitié.',
    },
    {
      id: 'aard',
      name: 'Aard',
      level: 0,
      school: 'Signe',
      description: 'Vague télékinésique : repousse de 3 m, DD 13 For ou prone.',
    },
    {
      id: 'yrden',
      name: 'Yrden',
      level: 0,
      school: 'Signe',
      description: 'Piège magique : zone de 3 m ralentit les ennemis 1 round.',
    },
    {
      id: 'quen',
      name: 'Quen',
      level: 0,
      school: 'Signe',
      description: 'Bouclier : 5 PV temporaires, ignore une attaque de mêlée.',
    },
    {
      id: 'axii',
      name: 'Axii',
      level: 0,
      school: 'Signe',
      description: 'Charme : DD 13 Sag ou cible désorientée 1 round.',
    },
  ],
  mage: [
    {
      id: 'fire-bolt',
      name: 'Trait de feu',
      level: 0,
      school: 'Évocation',
      description: '1d10 feu à 36 m.',
    },
    {
      id: 'mage-hand',
      name: 'Main du mage',
      level: 0,
      school: 'Conjuration',
      description: 'Main spectrale.',
    },
    {
      id: 'prestidigitation',
      name: 'Prestidigitation',
      level: 0,
      school: 'Transmutation',
      description: 'Petits effets.',
    },
    {
      id: 'aretuza-shield',
      name: 'Bouclier d’Aretuza',
      level: 1,
      school: 'Abjuration',
      description: 'Réaction : +5 CA.',
    },
    {
      id: 'magic-missile',
      name: 'Projectile magique',
      level: 1,
      school: 'Évocation',
      description: '3 traits de force.',
    },
    {
      id: 'detect-thoughts',
      name: 'Détection de pensées',
      level: 1,
      school: 'Divination',
      description: 'Lit les pensées de surface (concentration, 1 minute).',
    },
    {
      id: 'invisible-tracks',
      name: 'Pistage arcanique',
      level: 1,
      school: 'Divination',
      description: 'Détecte les traces magiques sur 30 m pendant 10 minutes.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Donjon de Naheulbeuk — sorts dans le ton humoristique de la saga
// ─────────────────────────────────────────────────────────────────────────

const NAHEULBEUK_SPELLS: Record<string, Spell[]> = {
  wizard: [
    {
      id: 'etincelle',
      name: 'Étincelle',
      level: 0,
      school: 'Évocation',
      description: '1d4 dégâts de feu (parfois ça fait pschitt).',
    },
    {
      id: 'lumiere-foireuse',
      name: 'Lumière foireuse',
      level: 0,
      school: 'Évocation',
      description: 'Allume une zone, clignote au mauvais moment.',
    },
    {
      id: 'main-magique',
      name: 'Main magique',
      level: 0,
      school: 'Conjuration',
      description: 'Main spectrale qui tremble un peu.',
    },
    {
      id: 'boule-de-feu-mini',
      name: 'Mini-boule de feu',
      level: 1,
      school: 'Évocation',
      description: '2d6 feu en zone 1,5 m. Souvent ça crame le grimoire aussi.',
    },
    {
      id: 'sommeil-douteux',
      name: 'Sommeil douteux',
      level: 1,
      school: 'Enchantement',
      description: 'Endort 4d8 PV de créatures. Le caster dort parfois aussi.',
    },
    {
      id: 'projectile-pourri',
      name: 'Projectile pourri',
      level: 1,
      school: 'Évocation',
      description: '2 traits 1d4+1 force. Pas glorieux.',
    },
  ],
  cleric: [
    {
      id: 'priere-rapide',
      name: 'Prière rapide',
      level: 0,
      school: 'Divination',
      description: 'Conseil divin (+1d4) au prochain test. Le dieu écoute mollement.',
    },
    {
      id: 'flamme-sacree',
      name: 'Flamme sacrée',
      level: 0,
      school: 'Évocation',
      description: '1d8 radiant. Le dieu approuve.',
    },
    {
      id: 'soin-mediocre',
      name: 'Soin médiocre',
      level: 1,
      school: 'Évocation',
      description: '1d6+Mod.Sag PV. Quand ça marche.',
    },
    {
      id: 'benediction-tiede',
      name: 'Bénédiction tiède',
      level: 1,
      school: 'Enchantement',
      description: '+1d4 à 2 alliés (concentration). Mankdebol veille.',
    },
    {
      id: 'bouclier-divin',
      name: 'Bouclier divin',
      level: 1,
      school: 'Abjuration',
      description: '+2 CA pour 10 minutes.',
    },
  ],
  druid: [
    {
      id: 'cause-mauvaise-herbe',
      name: 'Pousse de mauvaise herbe',
      level: 0,
      school: 'Transmutation',
      description: 'Fait pousser des herbes là où il faut pas.',
    },
    {
      id: 'flammes-vertes',
      name: 'Flammes vertes',
      level: 0,
      school: 'Conjuration',
      description: 'Flamme dans la main, 1d8 feu si lancée.',
    },
    {
      id: 'baies-suspectes',
      name: 'Baies suspectes',
      level: 1,
      school: 'Transmutation',
      description: '10 baies (1 PV chacune). Goût bizarre.',
    },
    {
      id: 'lianes-paresseuses',
      name: 'Lianes paresseuses',
      level: 1,
      school: 'Conjuration',
      description: 'Zone de lianes lentes (concentration).',
    },
    {
      id: 'soin-mediocre',
      name: 'Soin médiocre',
      level: 1,
      school: 'Évocation',
      description: '1d6+Mod.Sag PV.',
    },
  ],
  bard: [
    {
      id: 'remarque-vexante',
      name: 'Remarque vexante',
      level: 0,
      school: 'Enchantement',
      description: '1d4 psychique. Le mot juste fait mal.',
    },
    {
      id: 'illusion-bidon',
      name: 'Illusion bidon',
      level: 0,
      school: 'Illusion',
      description: 'Petit son ou image qui dure 1 minute.',
    },
    {
      id: 'mot-de-soutien',
      name: 'Mot de soutien',
      level: 1,
      school: 'Évocation',
      description: '1d4+Mod.Cha PV à un allié (action bonus).',
    },
    {
      id: 'chanson-deprimante',
      name: 'Chanson déprimante',
      level: 1,
      school: 'Enchantement',
      description: '3d6 psychique + désavantage au prochain jet.',
    },
  ],
  warlock: [
    {
      id: 'malefice-bizarre',
      name: 'Maléfice bizarre',
      level: 0,
      school: 'Évocation',
      description: 'Trait noir 1d10. Le pacte gronde.',
    },
    {
      id: 'illusion-bidon',
      name: 'Illusion bidon',
      level: 0,
      school: 'Illusion',
      description: 'Image ou son illusoire.',
    },
    {
      id: 'malediction-mineure',
      name: 'Malédiction mineure',
      level: 1,
      school: 'Enchantement',
      description: 'Cible : -1d4 à ses jets pendant 1 heure (concentration).',
    },
  ],
  sorcerer: [
    { id: 'etincelle', name: 'Étincelle', level: 0, school: 'Évocation', description: '1d4 feu.' },
    {
      id: 'main-magique',
      name: 'Main magique',
      level: 0,
      school: 'Conjuration',
      description: 'Main spectrale.',
    },
    {
      id: 'projectile-pourri',
      name: 'Projectile pourri',
      level: 1,
      school: 'Évocation',
      description: '2 traits 1d4+1 force.',
    },
    {
      id: 'bouclier-tremblotant',
      name: 'Bouclier tremblotant',
      level: 1,
      school: 'Abjuration',
      description: 'Réaction : +5 CA si la chance est là.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────

const SPELLS_BY_UNIVERSE: Record<Universe, Record<string, Spell[]>> = {
  dnd5e: DND_SPELLS,
  witcher: WITCHER_SPELLS,
  naheulbeuk: NAHEULBEUK_SPELLS,
};

/**
 * Returns the starting spells for a class, or [] if the class has no spells
 * at level 1 (paladin, ranger, fighter, barbarian, …).
 */
export function getStartingSpells(universe: Universe, classId: string): Spell[] {
  return SPELLS_BY_UNIVERSE[universe]?.[classId] ?? [];
}

export function isSpellcaster(universe: Universe, classId: string): boolean {
  return getStartingSpells(universe, classId).length > 0;
}
