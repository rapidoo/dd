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
