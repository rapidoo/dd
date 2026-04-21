import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions exposed to the GM agent (claude-opus-4-7).
 * All tool execution happens server-side; the LLM only emits structured inputs.
 */

export const GM_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'request_roll',
    description:
      "Demande au joueur un jet de dés (attaque, sauvegarde, test de caractéristique, dégâts, initiative). Le serveur exécute le jet et renvoie le résultat. Utilise-le quand une action mérite d'être résolue mécaniquement.",
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['attack', 'damage', 'save', 'check', 'initiative', 'concentration'],
          description: 'Nature du jet',
        },
        label: {
          type: 'string',
          description: 'Libellé court affiché au joueur (ex. "Perception", "Sauvegarde SAG")',
        },
        dice: {
          type: 'string',
          description:
            'Expression des dés au format NdM+K, e.g. "1d20+5" pour un jet avec modificateur +5.',
        },
        dc: {
          type: 'number',
          description: 'Degré de difficulté si applicable (check, save).',
        },
        target_ac: {
          type: 'number',
          description: 'CA cible si applicable (attack).',
        },
        advantage: {
          type: 'string',
          enum: ['normal', 'advantage', 'disadvantage'],
          description: "Avantage/désavantage sur le jet. Par défaut 'normal'.",
        },
      },
      required: ['kind', 'label', 'dice'],
    },
  },
  {
    name: 'recall_memory',
    description:
      'Interroge la mémoire de campagne (graphe Neo4j) pour retrouver un PNJ, un lieu, une faction ou un événement déjà rencontré. Utilise avant de décrire un élément qui pourrait exister.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nom ou description recherchée.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'record_entity',
    description:
      'Enregistre un nouveau PNJ / lieu / faction / objet / quête notable pour le rappeler plus tard. À faire au moment où il apparaît dans la narration.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['npc', 'location', 'faction', 'item', 'quest', 'event'] },
        name: { type: 'string' },
        short_description: { type: 'string' },
      },
      required: ['kind', 'name'],
    },
  },
  {
    name: 'start_combat',
    description:
      "Démarre une rencontre : fournis la liste des PNJ ennemis. Les PJ et compagnons sont ajoutés automatiquement. L'initiative est roulée côté serveur.",
    input_schema: {
      type: 'object',
      properties: {
        npcs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              ac: { type: 'number' },
              hp: { type: 'number' },
              dex_mod: { type: 'number' },
            },
            required: ['name', 'ac', 'hp'],
          },
        },
      },
      required: ['npcs'],
    },
  },
  {
    name: 'apply_damage',
    description:
      "À APPELER IMMÉDIATEMENT dès qu'un PJ ou compagnon subit des dégâts ou est soigné, même en dehors d'un combat formel. Ne narre JAMAIS les PV dans le texte — cet outil met à jour le panneau joueur directement depuis la base. Ex: un bandit tire une flèche qui touche pour 5 → apply_damage(combatant_id=<uuid du PJ>, amount=5). Potion de soin +8 → amount=-8.",
    input_schema: {
      type: 'object',
      properties: {
        combatant_id: {
          type: 'string',
          description:
            "UUID du personnage (affiché dans la section 'Équipe actuelle' du prompt). Pas le nom.",
        },
        amount: {
          type: 'number',
          description: 'Positif = dégâts (ex: 5), négatif = soins (ex: -8). Pas de zéro.',
        },
      },
      required: ['combatant_id', 'amount'],
    },
  },
  {
    name: 'apply_condition',
    description: 'Pose ou retire une condition sur un combattant.',
    input_schema: {
      type: 'object',
      properties: {
        combatant_id: { type: 'string' },
        condition: {
          type: 'string',
          enum: [
            'prone',
            'grappled',
            'blinded',
            'deafened',
            'charmed',
            'poisoned',
            'restrained',
            'stunned',
            'unconscious',
            'incapacitated',
            'invisible',
            'paralyzed',
            'petrified',
            'frightened',
          ],
        },
        add: { type: 'boolean' },
        duration_rounds: { type: 'number' },
      },
      required: ['combatant_id', 'condition', 'add'],
    },
  },
  {
    name: 'next_turn',
    description: "Passe au combattant suivant dans l'ordre d'initiative.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'end_combat',
    description: 'Termine la rencontre en cours. À appeler une fois le combat résolu.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'grant_item',
    description:
      "Ajoute ou retire un objet de l'inventaire d'un personnage. À utiliser quand le joueur trouve un trésor, achète, consomme ou perd un objet. Le panneau de la fiche se rafraîchit automatiquement.",
    input_schema: {
      type: 'object',
      properties: {
        character_id: {
          type: 'string',
          description: 'UUID du personnage (voir section Équipe actuelle).',
        },
        name: { type: 'string', description: 'Nom lisible de l\'objet (ex. "Potion de soin").' },
        qty: {
          type: 'number',
          description:
            'Quantité positive = ajouter, négative = retirer. Les quantités négatives suppriment progressivement.',
        },
        type: {
          type: 'string',
          enum: ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc'],
          description: "Type de l'objet.",
        },
        description: {
          type: 'string',
          description: 'Description courte (effet, propriétés, origine).',
        },
        weapon: {
          type: 'object',
          description:
            'Obligatoire quand type="weapon". Permet de calculer le bonus d\'attaque sur la fiche. Omettre pour une arme purement narrative (décor, fêlée, symbolique).',
          properties: {
            damage_dice: {
              type: 'string',
              description: 'Dés de dégâts sans modificateur, ex "1d8", "2d6".',
            },
            damage_type: {
              type: 'string',
              description:
                'Type de dégâts en français : contondant, perforant, tranchant, feu, froid, foudre, poison, acide, nécrotique, radiant, force, psychique, tonnerre.',
            },
            ability: {
              type: 'string',
              enum: ['str', 'dex', 'finesse'],
              description:
                'Caractéristique : "str" (mêlée standard), "dex" (DEX forcée), "finesse" (STR ou DEX au choix, le meilleur). Laisser vide pour les armes à distance (auto DEX via ranged).',
            },
            ranged: {
              type: 'boolean',
              description: 'true pour les armes à distance (arc, arbalète) — force DEX.',
            },
          },
          required: ['damage_dice'],
        },
      },
      required: ['character_id', 'name', 'qty'],
    },
  },
  {
    name: 'adjust_currency',
    description:
      'Ajuste la bourse du personnage. Valeurs positives = gagner, négatives = dépenser. Le personnage ne peut pas aller en négatif (clampé à 0).',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        cp: { type: 'number', description: 'Cuivre' },
        sp: { type: 'number', description: 'Argent' },
        ep: { type: 'number', description: 'Électrum' },
        gp: { type: 'number', description: 'Or' },
        pp: { type: 'number', description: 'Platine' },
      },
      required: ['character_id'],
    },
  },
  {
    name: 'cast_spell',
    description:
      "Consomme un emplacement de sort du niveau demandé sur le personnage. À appeler dès qu'un PJ ou compagnon lance un sort qui coûte un emplacement (les cantrips/tours de magie ne coûtent rien : n'appelle pas l'outil pour eux). Retourne une erreur si l'emplacement est épuisé — auquel cas, nie le lancement dans la narration.",
    input_schema: {
      type: 'object',
      properties: {
        character_id: {
          type: 'string',
          description: 'UUID du personnage qui lance le sort.',
        },
        spell_level: {
          type: 'number',
          description:
            "Niveau de l'emplacement consommé (1-9). Pour un sort lancé en sur-niveau, mets le niveau effectif.",
        },
        spell_name: {
          type: 'string',
          description: 'Nom du sort, pour contexte (ex. "Éclair", "Soins").',
        },
      },
      required: ['character_id', 'spell_level'],
    },
  },
  {
    name: 'trigger_rest',
    description:
      'Déclenche un repos court (1h) ou long (8h). Repos long : PV max, tous les emplacements restaurés, exhaustion -1. Repos court : regagne 1d[DV]+modCON par dé de vie dépensé (1 ici). À utiliser quand la fiction décrit un bivouac ou une pause.',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string', description: 'UUID du personnage.' },
        kind: {
          type: 'string',
          enum: ['short', 'long'],
          description: 'short = repos court (1h), long = repos long (8h).',
        },
      },
      required: ['character_id', 'kind'],
    },
  },
  {
    name: 'prompt_companion',
    description:
      "Donne la parole à l'un des compagnons IA. Choisis quel compagnon réagit à la situation actuelle selon sa personnalité.",
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string', description: 'ID du personnage compagnon (uuid).' },
        hint: {
          type: 'string',
          description: "Brève indication au compagnon sur ce qu'on attend de lui dans cette scène.",
        },
      },
      required: ['character_id'],
    },
  },
];

export type GmToolName = 'request_roll' | 'recall_memory' | 'record_entity';

export interface RequestRollInput {
  kind: 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration';
  label: string;
  dice: string;
  dc?: number;
  target_ac?: number;
  advantage?: 'normal' | 'advantage' | 'disadvantage';
}

export interface RecallMemoryInput {
  query: string;
}

export interface RecordEntityInput {
  kind: 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';
  name: string;
  short_description?: string;
}
