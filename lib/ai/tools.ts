import type { ToolDef } from './llm/types';

/**
 * Tool definitions exposed to the GM agent. Provider-agnostic — adapters
 * translate `inputSchema` to Anthropic `input_schema` or Ollama OpenAI-style
 * `parameters`. Rules live in the GM system prompt, descriptions stay terse.
 */

export const GM_TOOLS: ToolDef[] = [
  {
    name: 'request_roll',
    description:
      "Jette un dé côté serveur (attaque, dégâts, soins, save, check, initiative, concentration). À APPELER AVANT de décrire l'issue. Quand kind='damage' ou kind='heal' ET target_combatant_id est fourni, le serveur applique automatiquement le résultat au combattant (damage = PV -total, heal = PV +total) — pas besoin d'appeler apply_damage séparément.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['attack', 'damage', 'heal', 'save', 'check', 'initiative', 'concentration'],
        },
        label: { type: 'string', description: 'Ex: "Perception", "Sauvegarde SAG".' },
        dice: { type: 'string', description: 'Ex: "1d20+5", "2d6+3".' },
        dc: { type: 'number' },
        target_ac: { type: 'number' },
        advantage: { type: 'string', enum: ['normal', 'advantage', 'disadvantage'] },
        target_combatant_id: {
          type: 'string',
          description:
            "OBLIGATOIRE quand kind='damage' : UUID du combattant qui encaisse (PJ/compagnon de la section Équipe, ou npc-* en combat). Le serveur applique automatiquement les dégâts — ne rappelle PAS apply_damage après.",
        },
      },
      required: ['kind', 'label', 'dice'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Recherche une entité déjà enregistrée dans la mémoire de campagne.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'record_entity',
    description: 'Enregistre un PNJ/lieu/faction/objet/quête/événement notable.',
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
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
    name: 'grant_item',
    description:
      "Ajoute/retire un objet (qty positif/négatif). Le concierge post-tour le fait aussi depuis la narration — n'appelle que pour un transfert en plein tour.",
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        hint: { type: 'string' },
      },
      required: ['character_id'],
    },
  },
  {
    name: 'pass_turn',
    description:
      'Passe le tour du combattant courant sans action (joueur qui décline, PNJ stunned/incapacitated, compagnon qui temporise). Le serveur avance le curseur vers le combattant suivant. À utiliser UNIQUEMENT en combat actif.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Optionnel — pourquoi le tour est passé (ex. "joueur attend", "gobelin paralysé").',
        },
      },
      required: [],
    },
  },
];

/**
 * Narrator (story / out-of-combat) tools — superset, every tool the narrator
 * can invoke. Alias for GM_TOOLS while the rename is in progress.
 */
export const NARRATOR_TOOLS: ToolDef[] = GM_TOOLS;

/**
 * NPC turn tools — minimal set the npc-agent can invoke during its own turn:
 * resolve attack/damage/save rolls, apply conditions to its target, or pass
 * if incapacitated. No start_combat, no prompt_companion, no inventory tools.
 */
export const NPC_TOOLS: ToolDef[] = GM_TOOLS.filter((t) =>
  ['request_roll', 'apply_condition', 'pass_turn'].includes(t.name),
);

/**
 * Tools exposed to a companion agent during its own turn. Companions roll
 * their own attacks/damages and can pass if needed; state-mutating tools
 * (start_combat, prompt_companion, grant_item, …) stay narrator-only so the
 * companion can't escape its own turn.
 */
export const COMPANION_TOOLS: ToolDef[] = GM_TOOLS.filter((t) =>
  ['request_roll', 'pass_turn'].includes(t.name),
);

export type GmToolName = 'request_roll' | 'recall_memory' | 'record_entity';

export interface RequestRollInput {
  kind: 'attack' | 'damage' | 'heal' | 'save' | 'check' | 'initiative' | 'concentration';
  label: string;
  dice: string;
  dc?: number;
  target_ac?: number;
  advantage?: 'normal' | 'advantage' | 'disadvantage';
  target_combatant_id?: string;
}

export interface RecallMemoryInput {
  query: string;
}

export interface RecordEntityInput {
  kind: 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';
  name: string;
  short_description?: string;
}
