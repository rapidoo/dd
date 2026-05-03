/**
 * Pre-configured character templates for the Naheulbeuk universe (Terre de Fangh).
 * These are the seven canonical members of the Compagnie d'Aventuriers,
 * plus Théo de Reuk (the recurring paladin) and Reivax (Zangdar's sbire).
 *
 * Sourced from Naheulbeuk_Bible_DnD5e.md §III (races) and §VI (classes).
 */

import type { CharacterRow } from '../db/types';

export interface NaheulbeukCharacterTemplate {
  id: string;
  name: string;
  description: string;
  species: string;
  class: string;
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
  /** Tic de langage favori (cf. fiche annexe D). */
  tic?: string;
  /** Juron favori (Table XI.6). */
  juron?: string;
  /** Patron divin éventuel (Partie IV). */
  patron?: string;
}

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function createTemplate(
  template: Omit<NaheulbeukCharacterTemplate, 'abilityModifiers'>,
): NaheulbeukCharacterTemplate {
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

// Le Ranger — chef autoproclamé, séducteur infatigable, fumeur de pipe.
export const RANGER_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'le-ranger',
  name: 'Le Ranger',
  description:
    'Chef autoproclamé de la Compagnie. Fumeur de pipe, draggueur infatigable, vaguement competent. Ecole de Loubet.',
  species: 'human',
  class: 'ranger',
  subclass: 'École de Loubet',
  level: 3,
  baseAbilities: { str: 12, dex: 16, con: 13, int: 11, wis: 14, cha: 13 },
  abilities: { str: 13, dex: 17, con: 14, int: 12, wis: 15, cha: 14 },
  max_hp: 25,
  current_hp: 25,
  ac: 14,
  speed: 9,
  proficiencies: ['survival', 'perception', 'persuasion', 'animalHandling'],
  skills: { survival: 4, perception: 4, persuasion: 4, animalHandling: 4 },
  features: [
    {
      name: 'Voix de chef',
      description: '1/repos court : un allié à 9 m fait un jet de Persuasion avec avantage.',
    },
    {
      name: 'Cigarette tactique',
      description:
        "Pendant un repos court, fume une clope : ses alliés gagnent +1 Charisme jusqu'au prochain combat.",
    },
    {
      name: 'Drague systématique',
      description:
        'Avantage aux jets de Persuasion face à toute personne séduisable. Désavantage si conjoint présent.',
    },
  ],
  inventory: [
    { name: 'Arc long', type: 'arme', damage: '1d8+3', description: 'Arc en bois de fanghien' },
    { name: 'Épée courte', type: 'arme', damage: '1d6+3' },
    { name: 'Armure de cuir', type: 'armure', description: 'CA 11 + DEX = 14' },
    {
      name: 'Pipe Fumante',
      type: 'objet',
      description: '+1 CHA et 1 PV temporaire/bouffée (max 3)',
    },
    { name: 'Ration douteuse', type: 'consommable', count: 5 },
  ],
  tic: '« Bon, on fait un truc ou on fait pas un truc ? »',
  juron: 'Par les couilles de Reuk !',
  patron: 'Boa, dieu des Voies',
});

// Le Voleur — petits doigts, grande lâcheté, sens commercial développé.
export const VOLEUR_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'le-voleur',
  name: 'Le Voleur',
  description:
    "Roublard adepte du reflux d'estomac stratégique. Connait la valeur de revente de tout d'un coup d'oeil. Mort souvent, ressuscité parfois. Ecole de Noghall.",
  species: 'halfling',
  class: 'rogue',
  subclass: 'École de Noghall',
  level: 3,
  baseAbilities: { str: 8, dex: 17, con: 12, int: 13, wis: 10, cha: 14 },
  abilities: { str: 8, dex: 19, con: 13, int: 13, wis: 10, cha: 15 },
  max_hp: 20,
  current_hp: 20,
  ac: 14,
  speed: 7.5,
  proficiencies: ['stealth', 'sleightOfHand', 'deception', 'perception'],
  skills: { stealth: 6, sleightOfHand: 6, deception: 4, perception: 2 },
  features: [
    {
      name: "Reflux d'estomac stratégique",
      description:
        '1/jour : feindre un malaise pour éviter une corvée ou un combat (Représentation vs Perception passive).',
    },
    {
      name: 'Inventaire douteux',
      description:
        '1/session : "découvre" dans son sac un objet utile valant moins de 5 PO (corde, pince-monseigneur, miroir, ration).',
    },
    {
      name: 'Estimation cupide',
      description: "Connait la valeur de revente exacte d'un objet d'un seul coup d'oeil.",
    },
    {
      name: 'Chance hobbite',
      description: 'Relance un 1 sur d20 (1/round). Avantage aux JdS contre la peur.',
    },
  ],
  inventory: [
    { name: 'Dague +1', type: 'arme', damage: '1d4+5', description: 'Tranchante, ouvragée' },
    { name: 'Arbalète légère', type: 'arme', damage: '1d8+4' },
    { name: 'Armure de cuir', type: 'armure' },
    { name: 'Outils de voleur', type: 'objet' },
    { name: 'Pince-monseigneur', type: 'objet' },
  ],
  tic: "« C'est pas moi, j'étais derrière. »",
  juron: 'Bordel de planches !',
  patron: 'Khel, dieu des Bons Conseils',
});

// La Magicienne — diplômée mais traumatisée par les sorts qui foirent.
export const MAGICIENNE_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'la-magicienne',
  name: 'La Magicienne',
  description:
    "Diplomee de l'Academie de la Tour de la Connaissance. Allergique a sa propre magie. Crise existentielle a chaque sort rate. Ecole de Kjaniouf.",
  species: 'elf',
  class: 'wizard',
  subclass: 'École de Kjaniouf (Évocation)',
  level: 3,
  baseAbilities: { str: 8, dex: 14, con: 11, int: 17, wis: 13, cha: 12 },
  abilities: { str: 8, dex: 16, con: 11, int: 17, wis: 13, cha: 13 },
  max_hp: 16,
  current_hp: 16,
  ac: 13,
  speed: 9,
  proficiencies: ['arcana', 'history', 'investigation', 'perception'],
  skills: { arcana: 5, history: 5, investigation: 5, perception: 1 },
  features: [
    {
      name: 'Allergie magique',
      description:
        'Sur un sort de niveau 2+ : JdS CON DD 10+niveau, sinon réaction physique embarrassante (urticaire, voix de canard, éternuements).',
    },
    {
      name: 'Études prestigieuses',
      description: "Maîtrise d'Histoire et Arcanes, plus une langue ancienne supplémentaire.",
    },
    {
      name: 'Crise existentielle',
      description:
        'Si un sort foire critique : JdS SAG DD 12 ou pleure 1d4 rounds (concentration impossible).',
    },
    {
      name: 'Snobisme cultivé (elfe)',
      description:
        'Maîtrise de deux compétences artistiques. Désavantage à Athlétisme si ça salit.',
    },
  ],
  inventory: [
    { name: 'Bâton de magicien', type: 'arme', damage: '1d6', description: 'Focaliseur arcanique' },
    { name: 'Robe de mage', type: 'armure', description: 'CA 10 + DEX + INT bonus' },
    { name: 'Grimoire', type: 'objet', description: 'Tous les sorts connus' },
    {
      name: 'Composantes magiques',
      type: 'objet',
      description: 'Aile de papillon, sang de salamandre, etc.',
    },
    { name: 'Parchemin de Boule de Feu mineure', type: 'consommable' },
  ],
  tic: '« Je vais tenter un sort... vous voulez vraiment ? »',
  juron: 'Foutre de magicien raté !',
  patron: 'Tzinntch, dieu du Changement',
});

// Le Nain — barbu, alcoolique, susceptible, fier de sa hache.
export const NAIN_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'le-nain',
  name: 'Le Nain',
  description:
    "Gloin fils d'Ulrim fils de Bolzog. Hache toujours pretes, biere toujours proche. Hait les elfes par tradition, sauf quand il a bu.",
  species: 'dwarf',
  class: 'fighter',
  subclass: 'Style « Hache de Combat »',
  level: 3,
  baseAbilities: { str: 16, dex: 12, con: 16, int: 10, wis: 11, cha: 9 },
  abilities: { str: 17, dex: 12, con: 18, int: 10, wis: 11, cha: 9 },
  max_hp: 32,
  current_hp: 32,
  ac: 16,
  speed: 7.5,
  proficiencies: ['athletics', 'intimidation', 'survival', 'perception'],
  skills: { athletics: 5, intimidation: 1, survival: 2, perception: 2 },
  features: [
    {
      name: 'Charge tonitruante',
      description:
        '+1d6 dégâts si déplacement ≥ 3 m droit avant attaque. Ne peut pas se taire pendant la charge.',
    },
    {
      name: 'Râleur tactique',
      description:
        '"Engueule" un allié comme action bonus : +1 aux attaques pour 1 round, mais 5 min de remontrances après.',
    },
    {
      name: "Estomac d'acier nain",
      description:
        'Peut boire 5 chopes/soirée sans malus. La 6e déclenche des chants paillards involontaires.',
    },
    {
      name: 'Résilience naine',
      description: 'Avantage aux JdS contre poison, résistance aux dégâts de poison.',
    },
    {
      name: 'Antipathie elfique',
      description: 'Désavantage Charisme face aux elfes, sauf si bu (+2 Charisme situationnel).',
    },
  ],
  inventory: [
    { name: 'Hache à deux mains', type: 'arme', damage: '1d12+3', description: 'Hache de famille' },
    { name: 'Cotte de mailles', type: 'armure', description: 'CA 16' },
    { name: 'Gourde de gnôle naine', type: 'consommable', description: 'Bière noire de Belrog' },
    { name: 'Borduck', type: 'consommable', description: 'Saucisse naine très grasse', count: 3 },
  ],
  tic: '« On va dire que ça ira. »',
  juron: 'Par la barbe de Brorne et ses chaussettes !',
  patron: 'Brorne, dieu de la Forge',
});

// L'Elfe — naïve, vaniteuse, snob, archère.
export const ELFE_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'l-elfe',
  name: "L'Elfe",
  description:
    "Archere snob d'Ozcornil. Naive, vaniteuse, perpetuellement preoccupee par sa coiffure et l'odeur de son armure. Ecole de Sylvalon.",
  species: 'elf',
  class: 'ranger',
  subclass: 'École de Sylvalon (Archer)',
  level: 3,
  baseAbilities: { str: 10, dex: 17, con: 12, int: 13, wis: 14, cha: 14 },
  abilities: { str: 10, dex: 19, con: 12, int: 14, wis: 14, cha: 15 },
  max_hp: 22,
  current_hp: 22,
  ac: 14,
  speed: 9,
  proficiencies: ['perception', 'stealth', 'nature', 'performance'],
  skills: { perception: 4, stealth: 6, nature: 3, performance: 4 },
  features: [
    {
      name: 'Discrimination olfactive',
      description:
        'Détecte au flair toute substance impure (1 km). Ne supporte ni nain, ni ogre, ni humain mal lavé.',
    },
    {
      name: 'Discours snob',
      description:
        '1/scène : humilie verbalement (Intimidation vs SAG). Réussite = désavantage à la prochaine action de la cible.',
    },
    {
      name: 'Soin de la chevelure',
      description:
        "Si pas brossée pendant un repos long : -1 Charisme jusqu'au prochain repos long.",
    },
    {
      name: 'Lignée féerique',
      description: 'Avantage aux JdS contre charme, immunité au sommeil magique.',
    },
  ],
  inventory: [
    {
      name: 'Arc long elfique',
      type: 'arme',
      damage: '1d8+4',
      description: 'Bois sculpté de Sylvalon',
    },
    { name: 'Épée courte', type: 'arme', damage: '1d6+4' },
    { name: 'Armure de cuir', type: 'armure' },
    { name: 'Brosse à cheveux en argent', type: 'objet', description: 'Indispensable' },
    { name: "Larmes d'elfe", type: 'composante', count: 6 },
  ],
  tic: "« Mais c'est dégoûtant ! »",
  juron: "Sang de gobelin et morve d'elfe !",
  patron: 'Gladeulfeurha, déesse de la Beauté',
});

// L'Ogre — Voie du Glouton, frappe gourmande.
export const OGRE_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'l-ogre',
  name: "L'Ogre",
  description:
    'Barbare gentil et lent, toujours en train de chercher quelque chose a grignoter. Cervelle modeste mais coeur sur la main. Voie du Glouton.',
  species: 'ogre',
  class: 'barbarian',
  subclass: 'Voie du Glouton',
  level: 3,
  baseAbilities: { str: 18, dex: 11, con: 16, int: 6, wis: 9, cha: 8 },
  abilities: { str: 20, dex: 11, con: 17, int: 6, wis: 9, cha: 8 },
  max_hp: 38,
  current_hp: 38,
  ac: 14,
  speed: 9,
  proficiencies: ['athletics', 'intimidation', 'animalHandling', 'survival'],
  skills: { athletics: 7, intimidation: 1, animalHandling: -1, survival: -1 },
  features: [
    {
      name: 'Voie du Glouton',
      description:
        'Repas conséquent en repos court (4 portions humaines) = +1 dé de vie supplémentaire récupéré.',
    },
    {
      name: 'Frappe gourmande',
      description:
        "En rage, +2 dégâts à toute attaque non armée. Le poing d'ogre est une arme de mêlée.",
    },
    {
      name: 'Estomac universel',
      description:
        'Avantage aux JdS contre poison ingéré. Peut digérer métal, verre, petites pierres.',
    },
    {
      name: "Carrure d'ogre",
      description: 'Compté comme G pour porter, soulever, pousser. Coup de poing : 1d6 + FOR.',
    },
    {
      name: 'Cervelle modeste',
      description: "Désavantage aux jets d'INT pure (sauf si la question concerne la nourriture).",
    },
  ],
  inventory: [
    { name: "Massue d'ogre", type: 'arme', damage: '2d6+5', description: "Tronc d'arbre arraché" },
    { name: 'Peau épaisse', type: 'armure', description: 'CA naturelle' },
    {
      name: 'Sac de provisions XXL',
      type: 'objet',
      description: 'Contient 8 jambons, 12 pains, 2 fromages',
    },
    { name: 'Os à mâcher', type: 'objet', description: 'Sentimental' },
  ],
  tic: '« On mange ? »',
  juron: "Tripaille d'ogre constipé !",
  patron: 'Hashpout, déesse de la Moisson',
});

// Le Barbare — humain de Khor, hache à deux mains de famille.
export const BARBARE_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'le-barbare',
  name: 'Le Barbare',
  description:
    "Humain barbare des Plaines de Khor. Brut, muscle, plus fin qu'il n'en a l'air (mais a peine). Voie du Pillard de Khor.",
  species: 'human',
  class: 'barbarian',
  subclass: 'Voie du Pillard de Khor',
  level: 3,
  baseAbilities: { str: 17, dex: 14, con: 15, int: 9, wis: 12, cha: 11 },
  abilities: { str: 18, dex: 15, con: 16, int: 10, wis: 13, cha: 12 },
  max_hp: 35,
  current_hp: 35,
  ac: 14,
  speed: 9,
  proficiencies: ['athletics', 'intimidation', 'survival', 'animalHandling'],
  skills: { athletics: 6, intimidation: 3, survival: 3, animalHandling: 3 },
  features: [
    {
      name: 'Cri de guerre',
      description:
        "En entrant en rage : action bonus, ennemis à 6 m font JdS SAG DD 12 ou Effrayés jusqu'à fin du prochain tour.",
    },
    {
      name: 'Hache à deux mains de famille',
      description: "Arme magique +1 tant qu'elle n'est pas perdue ou gagée à un cabaret.",
    },
    {
      name: 'Tatouages tribaux',
      description: '+1 Charisme face aux autres barbares ; -1 face aux gens raffinés.',
    },
    {
      name: 'Polyvalence humaine',
      description: "Maîtrise d'un outil et d'une langue supplémentaires.",
    },
  ],
  inventory: [
    {
      name: 'Hache à deux mains de famille +1',
      type: 'arme',
      damage: '1d12+5',
      description: 'Transmission ancestrale',
    },
    { name: 'Armure de cuir clouté', type: 'armure', description: 'CA 12 + DEX = 14' },
    { name: 'Pendentif tribal', type: 'objet', description: 'Sentimental' },
    { name: "Gourde d'hydromel", type: 'consommable' },
  ],
  tic: '« KHOOOOR ! »',
  juron: 'Tonnerre de Khornettoh !',
  patron: 'Khornettoh-le-Sanglant, dieu de la Guerre',
});

// Théo de Reuk — paladin compétent (rare).
export const THEO_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'theo-de-reuk',
  name: 'Théo de Reuk de Mortebranche',
  description:
    "Jeune chevalier compétent, intègre, légèrement ridicule par excès de droiture. Étoile montante de l'Ordre des Paladins de Reuk. Serment de Reuk.",
  species: 'human',
  class: 'paladin',
  subclass: 'Serment de Reuk',
  level: 4,
  baseAbilities: { str: 16, dex: 11, con: 14, int: 11, wis: 12, cha: 16 },
  abilities: { str: 17, dex: 12, con: 15, int: 12, wis: 13, cha: 17 },
  max_hp: 36,
  current_hp: 36,
  ac: 18,
  speed: 9,
  proficiencies: ['athletics', 'persuasion', 'religion', 'insight'],
  skills: { athletics: 5, persuasion: 5, religion: 3, insight: 3 },
  features: [
    {
      name: 'Serment de Reuk',
      description:
        'Doit dire la vérité, secourir les faibles, éviter les querelles inutiles. Transgression = perd ses sorts 1 jour.',
    },
    {
      name: 'Imposition des mains tarifée',
      description:
        "Soigne autant qu'un paladin standard. Accepte les dons (ne refuse jamais une offrande de 5 PO).",
    },
    {
      name: "Aura d'autorité tranquille",
      description: "PNJ humain non hostile a tendance à le respecter d'instinct (+2 social).",
    },
    {
      name: 'Châtiment divin',
      description: 'Dépense un emplacement de sort pour ajouter 2d8 dégâts radiants à une attaque.',
    },
  ],
  inventory: [
    { name: 'Épée longue de Reuk', type: 'arme', damage: '1d8+3', description: 'Lame bénie' },
    {
      name: 'Bouclier solaire',
      type: 'armure',
      description: '+2 CA, gravé du soleil à neuf rayons',
    },
    { name: 'Cotte de mailles +1', type: 'armure', description: 'CA 16+1' },
    { name: 'Symbole sacré de Reuk', type: 'objet', description: 'Médaillon en or' },
  ],
  tic: '« Que la lumière de Reuk vous éclaire. »',
  juron: 'Par les neuf rayons du Père-Tout-Puissant !',
  patron: 'Reuk, le Père-Tout-Puissant',
});

// Belzébith — demi-démone barde (PNJ allié).
export const BELZEBITH_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'belzebith',
  name: 'Belzébith',
  description:
    "Demi-demone barde des cabarets d'Alaykjdu. Voix d'or, cornes peintes en dore, persecutee par un fan louche.",
  species: 'halfDemon',
  class: 'bard',
  subclass: 'École de Loquence',
  level: 4,
  baseAbilities: { str: 9, dex: 14, con: 12, int: 13, wis: 11, cha: 18 },
  abilities: { str: 10, dex: 14, con: 12, int: 14, wis: 11, cha: 19 },
  max_hp: 28,
  current_hp: 28,
  ac: 13,
  speed: 9,
  proficiencies: ['performance', 'persuasion', 'deception', 'history'],
  skills: { performance: 6, persuasion: 6, deception: 6, history: 4 },
  features: [
    {
      name: 'Résistance infernale',
      description: 'Résistance aux dégâts de feu.',
    },
    {
      name: 'Marque démoniaque',
      description: 'Connaît Flamme sacrée. Mains brûlantes 1/repos long.',
    },
    {
      name: 'Inspiration bardique',
      description: "1d8 d'inspiration à un allié (Charisme/repos court).",
    },
    {
      name: 'Réputation lourde',
      description: 'Désavantage aux jets de Persuasion face à un PNJ humain non averti.',
    },
  ],
  inventory: [
    {
      name: "Luth d'Alaykjdu",
      type: 'instrument',
      description: 'Bois de cornichon, cordes en boyau de troll',
    },
    { name: 'Rapière', type: 'arme', damage: '1d8+2' },
    { name: 'Robe de scène', type: 'armure', description: 'CA 11 + DEX = 13' },
    { name: 'Carnet de paroles', type: 'objet', description: 'Recueil de chansons subversives' },
  ],
  tic: '« Une chanson, mes amours ? »',
  juron: 'Par la grosse fesse de Niourgl !',
  patron: 'Niourgl, dieu des Plaisirs Excessifs',
});

// Reivax — sbire de Zangdar, peut s'allier ou trahir.
export const REIVAX_TEMPLATE: NaheulbeukCharacterTemplate = createTemplate({
  id: 'reivax',
  name: 'Reivax',
  description:
    "Sbire-conseiller-souffre-douleur de Zangdar. Begue, lache, surprenant survivant. Peut s'allier, trahir, redevenir sbire, tout cela dans la meme session.",
  species: 'human',
  class: 'wizard',
  subclass: null,
  level: 2,
  baseAbilities: { str: 8, dex: 13, con: 11, int: 14, wis: 11, cha: 9 },
  abilities: { str: 9, dex: 14, con: 12, int: 15, wis: 12, cha: 10 },
  max_hp: 14,
  current_hp: 14,
  ac: 12,
  speed: 9,
  proficiencies: ['arcana', 'history', 'deception', 'investigation'],
  skills: { arcana: 4, history: 4, deception: 2, investigation: 4 },
  features: [
    {
      name: 'Soumission opportuniste',
      description: 'Si réduit à <10 PV, peut se rendre et trahir Zangdar.',
    },
    {
      name: 'Lancer de sorts mineur',
      description: 'Connait projectile magique, charme-personne (1/jour).',
    },
  ],
  inventory: [
    { name: 'Dague mal aiguisée', type: 'arme', damage: '1d4+1' },
    { name: 'Robe rapiécée', type: 'armure', description: 'CA 10 + DEX = 12' },
    { name: 'Carnet de notes du Maître', type: 'objet', description: 'Compromettant pour Zangdar' },
  ],
  tic: '« Mais... mais... Maître Zangdar a dit que... »',
  juron: 'Krwallak !',
  patron: 'Mankdebol, dieu de la Loose',
});

export const NAHEULBEUK_TEMPLATES: Record<string, NaheulbeukCharacterTemplate> = {
  ranger: RANGER_TEMPLATE,
  voleur: VOLEUR_TEMPLATE,
  magicienne: MAGICIENNE_TEMPLATE,
  nain: NAIN_TEMPLATE,
  elfe: ELFE_TEMPLATE,
  ogre: OGRE_TEMPLATE,
  barbare: BARBARE_TEMPLATE,
  theo: THEO_TEMPLATE,
  belzebith: BELZEBITH_TEMPLATE,
  reivax: REIVAX_TEMPLATE,
};

export function getNaheulbeukTemplates(): NaheulbeukCharacterTemplate[] {
  return Object.values(NAHEULBEUK_TEMPLATES);
}

export function getNaheulbeukTemplateById(id: string): NaheulbeukCharacterTemplate | undefined {
  return Object.values(NAHEULBEUK_TEMPLATES).find((t) => t.id === id);
}

export function templateToCharacterRow(
  template: NaheulbeukCharacterTemplate,
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
    features: template.features.map((f) => ({ name: f.name, description: f.description })),
    inventory: template.inventory,
    persona: {
      templateId: template.id,
      description: template.description,
      tic: template.tic,
      juron: template.juron,
      patron: template.patron,
    },
  };
}
