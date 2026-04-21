import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions exposed to the GM agent. All tool execution happens
 * server-side; the LLM only emits structured inputs. Descriptions are
 * kept terse — the main rules live in the GM system prompt.
 */

export const GM_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'request_roll',
    description:
      "Jette un dé côté serveur (attaque, dégâts, save, check, initiative, concentration). À APPELER AVANT de décrire l'issue.",
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['attack', 'damage', 'save', 'check', 'initiative', 'concentration'],
        },
        label: { type: 'string', description: 'Ex: "Perception", "Sauvegarde SAG".' },
        dice: { type: 'string', description: 'Ex: "1d20+5", "2d6+3".' },
        dc: { type: 'number' },
        target_ac: { type: 'number' },
        advantage: { type: 'string', enum: ['normal', 'advantage', 'disadvantage'] },
      },
      required: ['kind', 'label', 'dice'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Recherche une entité déjà enregistrée dans la mémoire de campagne.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'record_entity',
    description: 'Enregistre un PNJ/lieu/faction/objet/quête/événement notable.',
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
    description: 'Démarre une rencontre. Fournis les PNJ ennemis ; PJ + compagnons ajoutés auto.',
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
      'Applique dégâts (positif) ou soins (négatif) à un combattant. Jamais de PV dans le texte.',
    input_schema: {
      type: 'object',
      properties: {
        combatant_id: { type: 'string', description: 'UUID (section Équipe).' },
        amount: { type: 'number', description: '>0 = dégâts, <0 = soins.' },
      },
      required: ['combatant_id', 'amount'],
    },
  },
  {
    name: 'apply_condition',
    description: 'Pose ou retire une condition.',
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
    description: "Combattant suivant dans l'initiative.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'end_combat',
    description: 'Termine la rencontre.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'grant_item',
    description:
      "Ajoute/retire un objet (qty positif/négatif). Le concierge post-tour le fait aussi depuis la narration — n'appelle que pour un transfert en plein tour.",
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        name: { type: 'string' },
        qty: { type: 'number' },
        type: {
          type: 'string',
          enum: ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc'],
        },
        description: { type: 'string' },
        weapon: {
          type: 'object',
          description: 'Si type="weapon" avec stats connues.',
          properties: {
            damage_dice: { type: 'string' },
            damage_type: { type: 'string' },
            ability: { type: 'string', enum: ['str', 'dex', 'finesse'] },
            ranged: { type: 'boolean' },
          },
          required: ['damage_dice'],
        },
      },
      required: ['character_id', 'name', 'qty'],
    },
  },
  {
    name: 'adjust_currency',
    description: 'Bourse : positif = gagne, négatif = dépense (clampé ≥ 0).',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        cp: { type: 'number' },
        sp: { type: 'number' },
        ep: { type: 'number' },
        gp: { type: 'number' },
        pp: { type: 'number' },
      },
      required: ['character_id'],
    },
  },
  {
    name: 'cast_spell',
    description: 'Consomme un emplacement. Pas pour les cantrips.',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        spell_level: { type: 'number' },
        spell_name: { type: 'string' },
      },
      required: ['character_id', 'spell_level'],
    },
  },
  {
    name: 'trigger_rest',
    description: 'Repos court (1h) ou long (8h).',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        kind: { type: 'string', enum: ['short', 'long'] },
      },
      required: ['character_id', 'kind'],
    },
  },
  {
    name: 'prompt_companion',
    description: 'Donne la parole à un compagnon IA.',
    input_schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        hint: { type: 'string' },
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
