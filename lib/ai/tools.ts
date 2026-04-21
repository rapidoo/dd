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
