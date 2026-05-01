/**
 * Curated campaign templates derived from the scenarios under
 * /d&d_scenarios. Each template can be selected at campaign creation
 * time (setting_mode = 'module', module_id = template.id).
 *
 * Templates are read-only data; the GM agent will receive the summary +
 * tone + recommended party as extra context when the session starts.
 */

import type { Universe } from '../db/types';

export type Difficulty = 'débutant' | 'intermédiaire' | 'expert' | 'mortel';

export type Tone =
  | 'horreur'
  | 'aventure'
  | 'enquête'
  | 'intrigue'
  | 'humour'
  | 'survie'
  | 'exploration'
  | 'politique'
  | 'dungeon'
  | 'urbain'
  | 'sauvage'
  | 'haute-fantasy'
  | 'bas-fantasy'
  | 'combat';

export interface ModuleTemplate {
  id: string;
  title: string;
  tagline: string;
  summary: string;
  levelRange: string;
  difficulty: Difficulty;
  tones: Tone[];
  recommendedParty: string;
  sessionsEstimate: string;
  /** The universe this module belongs to (dnd5e or witcher). */
  universe: Universe;
  /** Path inside /d&d_scenarios (without extension) so the GM can RAG it later. */
  sourceFile: string;
}

export const MODULE_TEMPLATES: readonly ModuleTemplate[] = [
  // ============ D&D 5e Modules ============
  {
    id: 'the-forge-of-rogbrok',
    title: 'La Forge de Rogbrok',
    tagline: "Une forge naine abandonnée cache les secrets d'un héros oublié.",
    summary:
      "Un nain ivre vous glisse les coordonnées d'une ancienne forge de clan. Dans les mines, vous affrontez ours, insectes géants et kobolds, et reconstituez peu à peu l'histoire du maître-forgeron Rogbrok pour remettre la main sur son trésor.",
    levelRange: '1-2',
    difficulty: 'débutant',
    tones: ['aventure', 'dungeon', 'exploration'],
    recommendedParty:
      '4 PJ de niveau 1 : un guerrier ou barbare en front, un clerc ou paladin, un roublard pour les pièges, un mage pour les lumières et la levée de doutes.',
    sessionsEstimate: '2-3 sessions',
    universe: 'dnd5e',
    sourceFile: 'The_Forge_of_Rogbrok',
  },
  {
    id: 'grammys-country-apple-pie',
    title: 'La Tarte aux pommes de Grammy',
    tagline: 'Quête culinaire pour récupérer une recette de tarte légendaire.',
    summary:
      "Un vieux mage nostalgique vous charge de reprendre une boulangerie envahie par des gobelins. L'enjeu ? Une recette de tarte aux pommes qu'aucun adepte n'a su retrouver. Ton léger, négociation et exploration priment : on peut finir sans dégainer.",
    levelRange: '1-4',
    difficulty: 'débutant',
    tones: ['humour', 'aventure', 'exploration'],
    recommendedParty:
      '3-4 PJ flexibles ; profitez-en pour emmener un barde ou un rôdeur haut en couleur, et un roublard pour la prudence.',
    sessionsEstimate: '1-2 sessions',
    universe: 'dnd5e',
    sourceFile: 'Grammys_Country_Apple_Pie',
  },
  {
    id: 'the-scroll-thief',
    title: 'Le Voleur de parchemins',
    tagline: 'Des vols de livres rares mènent à une conspiration du Culte du Dragon.',
    summary:
      "Des codex précieux disparaissent dans les écoles de Scholar's Square. Vous enquêtez dans les bibliothèques, fouillez catacombes et égouts, puis poursuivez le voleur jusque dans les marais. Investigation progressive qui bascule en confrontation.",
    levelRange: '2-4',
    difficulty: 'intermédiaire',
    tones: ['enquête', 'intrigue', 'urbain', 'dungeon'],
    recommendedParty:
      "4-5 PJ : un roublard ou rôdeur pour la filature, un mage ou barde pour les tests d'érudition, un combattant et un soigneur pour les pics de violence.",
    sessionsEstimate: '3-4 sessions',
    universe: 'dnd5e',
    sourceFile: 'The_Scroll_Thief',
  },
  {
    id: 'challenge-of-the-frog-idol',
    title: "Le Défi de l'idole-grenouille",
    tagline: 'Un marais ancien recèle des statues divines et des secrets oubliés.',
    summary:
      "Vous traversez le Marais Noir, empruntez d'anciennes chaussées et îles perdues pour retrouver les trésors d'un culte de dieu-grenouille. Troglodytes, maîtres zombies et créatures des tourbières vous attendent.",
    levelRange: '3-6',
    difficulty: 'intermédiaire',
    tones: ['aventure', 'exploration', 'sauvage', 'dungeon'],
    recommendedParty:
      '4 PJ équilibrés avec au moins un personnage à compétence Survie et un moyen de déplacement sur terrain difficile (saut, escalade, vol).',
    sessionsEstimate: '4-5 sessions',
    universe: 'dnd5e',
    sourceFile: 'Challenge_of_the_Frog_Idol',
  },
  {
    id: 'death-house',
    title: 'La Maison de la Mort',
    tagline: "Une maison maudite où l'innocence s'éteint lentement.",
    summary:
      "À Barovia, deux enfants fantômes vous supplient de chasser un monstre de leur demeure. La maison elle-même est l'entité malveillante et vous mène vers un culte oublié. Horreur gothique, énigmes morales, choix qui comptent.",
    levelRange: '1-3',
    difficulty: 'intermédiaire',
    tones: ['horreur', 'dungeon', 'exploration', 'intrigue'],
    recommendedParty:
      '4 PJ avec un soigneur indispensable, un combattant robuste, un roublard vigilant, et un mage pour dissiper/révéler.',
    sessionsEstimate: '1-2 sessions',
    universe: 'dnd5e',
    sourceFile: 'Death_House',
  },
  {
    id: 'the-barber-of-silverymoon',
    title: 'Le Barbier de Lunargent',
    tagline: 'Des coupes impossibles et des disparitions terrorisent la ville.',
    summary:
      "Des habitants reviennent métamorphosés, la mémoire effacée, ou ne reviennent pas du tout. Un barbier surnaturel conduit des expériences sous les rues, à la solde d'une hag. Ambiance urbaine sombre, transformations horrifiques, enquête puis donjon.",
    levelRange: '4-6',
    difficulty: 'intermédiaire',
    tones: ['horreur', 'urbain', 'intrigue', 'dungeon'],
    recommendedParty:
      '4 PJ : un combattant en front, un clerc pour contrer charme et transformation, un mage contrôleur, un roublard avec Perception élevée.',
    sessionsEstimate: '3-4 sessions',
    universe: 'dnd5e',
    sourceFile: 'The_Barber_of_Silverymoon',
  },
  {
    id: 'clam-island',
    title: "L'Île de Nacre",
    tagline: "Pirates et monstres se disputent les trésors d'une île maudite.",
    summary:
      "Vous débarquez sur une île où pirates et aberrations marines s'affrontent. Vous choisissez votre camp et progressez de zone en zone, entre fouilles, embuscades et batailles ouvertes. Très orientée combat.",
    levelRange: '1-4',
    difficulty: 'intermédiaire',
    tones: ['aventure', 'combat', 'dungeon', 'sauvage'],
    recommendedParty:
      '2-4 PJ robustes : privilégiez un duo front-line + mage de zone, ou un quatuor classique. Faible en soins = courez.',
    sessionsEstimate: '4-6 sessions',
    universe: 'dnd5e',
    sourceFile: 'Clam_Island',
  },
  {
    id: 'six-faces-of-death',
    title: 'Les Six Faces de la Mort',
    tagline: "Un cube infernal du plan d'Achéron émerge pour asservir le monde.",
    summary:
      "Une île changeante apparaît en mer. Sur son rivage, le Cube 1717, ancienne station de guerre diabolique, est réveillé par un skull lord. Vous sauvez un mage kidnappé et tentez d'empêcher une conquête planaire. Campagne de haut niveau, dense en combats.",
    levelRange: '11-13',
    difficulty: 'expert',
    tones: ['horreur', 'intrigue', 'haute-fantasy', 'exploration'],
    recommendedParty:
      '4-5 PJ haut niveau équilibrés : au moins un clerc puissant, un mage lanceur de sorts de zone, un front-line tank, un contrôleur. Prévoir des résistances aux dégâts nécrotiques.',
    sessionsEstimate: '5-7 sessions',
    universe: 'dnd5e',
    sourceFile: 'Six_Faces_of_Death',
  },
  // ============ The Witcher Modules ============
  {
    id: 'le-contrat-du-village-maudit',
    title: 'Le Contrat du Village Maudit',
    tagline: 'Des disparitions nocturnes terrorisent Blackbog. Un Nekker rôde dans les caves.',
    summary:
      "Les joueurs, sorceleurs ou mercenaires, arrivent à Blackbog où le maire Thaddeus leur propose un contrat : découvrir ce qui cause les disparitions nocturnes. L'enquête mène à un Nekker et ses guerriers dans les caves sous l'église. Dilemme final : tuer le monstre ou négocier un sacrifice annuel.",
    levelRange: '1-2',
    difficulty: 'débutant',
    tones: ['horreur', 'intrigue', 'sauvage'],
    recommendedParty:
      '2-3 sorceleurs ou un groupe avec un combattant (front), un mage ou guérisseur (soins/potions), un voleur (pièges, perception).',
    sessionsEstimate: '1-2 sessions',
    universe: 'witcher',
    sourceFile: '',
  },
  {
    id: 'l-heritage-de-la-sorciere',
    title: "L'Héritage de la Sorcière",
    tagline: 'Un grimoire volé contenant des sorts interdits menace Toussaint.',
    summary:
      "Lady Elara de Toussaint engage les joueurs pour retrouver un grimoire volé par un Doppler. La quête mène à une cabane en forêt où le Doppler, capable de prendre toute apparence, compte utiliser la magie pour dominer la région. Dilemme : rendre le grimoire, le détruire, ou le garder (avec des risques).",
    levelRange: '2-3',
    difficulty: 'intermédiaire',
    tones: ['enquête', 'intrigue', 'sauvage'],
    recommendedParty:
      '3-4 personnages : un sorceleur (combat), un mage (détection de la magie, sorts), un voleur (filature, pièges), un guérisseur (potions).',
    sessionsEstimate: '2-3 sessions',
    universe: 'witcher',
    sourceFile: '',
  },
  {
    id: 'la-malediction-du-bois-de-brokilon',
    title: 'La Malédiction du Bois de Brokilon',
    tagline: 'Les dryades se pétrifient. Un sceptre druidique volé en est la cause.',
    summary:
      "Eithné, reine des dryades de Brokilon, contacte les joueurs : une malédiction transforme ses sœurs en arbres pétrifiés. La source est un sceptre druidique volé par des bandits près de la rivière Chotla. Après avoir récupéré l'artefact, les joueurs doivent décider du sort des bandits.",
    levelRange: '3-4',
    difficulty: 'intermédiaire',
    tones: ['aventure', 'exploration', 'sauvage', 'politique'],
    recommendedParty:
      '3-5 personnages : un sorceleur (front), un mage (sorts de zone), un éclaireur (navigation en forêt), un guérisseur (soins), optionnel un voleur (négociation avec les bandits).',
    sessionsEstimate: '2-3 sessions',
    universe: 'witcher',
    sourceFile: '',
  },
  {
    id: 'le-tournoi-de-la-lame-noire',
    title: 'Le Tournoi de la Lame Noire',
    tagline: 'Un tournoi organisé par le Duc Radovid V cache un piège pour capturer des sorceleurs.',
    summary:
      "Les joueurs sont invités à un tournoi à Novigrad. Mais le Duc Radovid V veut capturer des sorceleurs pour en faire des soldats. Stratégie au choix : gagner le tournoi puis s'échapper, ou saboter l'événement. Combat final contre le Duc ou ses sbires.",
    levelRange: '4-6',
    difficulty: 'intermédiaire',
    tones: ['aventure', 'combat', 'intrigue', 'urbain'],
    recommendedParty:
      '4-5 personnages : au moins un sorceleur, un mage (sorts de contrôle), un voleur (infiltration, pièges), un guérisseur (soins), optionnel un barbare (combat en arène).',
    sessionsEstimate: '2-3 sessions',
    universe: 'witcher',
    sourceFile: '',
  },
];

export function getModuleTemplate(id: string): ModuleTemplate | null {
  return MODULE_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function getModulesByUniverse(universe: Universe): ModuleTemplate[] {
  return MODULE_TEMPLATES.filter((t) => t.universe === universe);
}

export function getAllUniverses(): Universe[] {
  return Array.from(new Set(MODULE_TEMPLATES.map((t) => t.universe)));
}
