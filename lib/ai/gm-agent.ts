import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow } from '../db/types';
import { type EntityKind, recallEntities, upsertEntity } from '../neo4j/queries';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
import { CONDITION_TYPES, type ConditionType } from '../rules/types';
import {
  activeEncounter,
  advanceTurnEncounter,
  applyDamageToCombatant,
  endCombat,
  healCombatant,
  mutateEncounter,
  startCombat,
  toggleCondition,
} from '../server/combat';
import { anthropic, MODELS } from './claude';
import { respondAsCompanion } from './companion-agent';
import { campaignIdOfSession, characterInSession, combatantBelongsToSession } from './tenant-guard';
import { GM_TOOLS, type RecordEntityInput, type RequestRollInput } from './tools';

const GM_SYSTEM_PROMPT = `Tu es "Le Conteur", Maître du Donjon d'une partie de Donjons & Dragons 5e (SRD 5.1).

Ton rôle :
- Narre l'histoire dans un style "dark fantasy cozy" : cuir vieilli, parchemin, bougies, chaleur — mais pas glauque. Voix grave et patiente. Tu laisses respirer les silences.
- Décris les lieux avec sobriété, les PNJ avec une petite excentricité, les scènes avec une image marquante.
- Respecte les règles SRD. Pour tout jet important (combat, sauvegarde, test non trivial), utilise l'outil request_roll plutôt que de deviner le résultat.
- Reste en français. Ton joueur est francophone.
- Ne résume pas ce que le joueur vient de faire — enchaîne directement sur les conséquences.
- Conclus souvent par une question ouverte : "Que fais-tu ?" pour laisser la main au joueur.

Jets de dés — RÈGLE ABSOLUE :
- Dès qu'un jet mérite d'être résolu, appelle request_roll. Ne donne JAMAIS le chiffre dans la narration avant de l'avoir obtenu via l'outil.
- Chaîne ATTAQUE → DÉGÂTS : quand request_roll(kind=attack) renvoie un hit ou un crit, appelle IMMÉDIATEMENT request_roll(kind=damage, dice=<dés de l'arme + mod>) avant de décrire la blessure. Exemples : hache à une main "1d8+3", épée courte en furtivité "1d6+2d6+2", éclair lancé en niv. 3 "8d6". Sur un crit, double les dés dans l'expression (ex "2d8+3" au lieu de "1d8+3").
- N'écris jamais "Roule les dégâts" au joueur : c'est ton rôle d'appeler l'outil. Le joueur ne roule pas les dés lui-même.
- Ne décris JAMAIS le résultat d'une action à risque avant d'avoir appelé l'outil (pas de "la flèche te touche" avant l'attack roll).

Contexte mécanique :
- Théâtre de l'esprit : pas de grille tactique. Décris les distances en langage naturel ("à trois pas", "au fond de la salle").
- Les jets critiques (nat 20) font réussir et amplifier ; les nat 1 font rater et compliquer.

Gestion des PV et des états — RÈGLE ABSOLUE :
- NE JAMAIS écrire des points de vie dans la narration (pas de "PV 7/12", pas de "il te reste X points de vie"). L'interface affiche les PV en direct depuis la base.
- Quand un PJ ou un compagnon subit des dégâts : appelle IMMÉDIATEMENT apply_damage(combatant_id, amount). Positif = dégâts, négatif = soins. L'id du personnage apparaît dans la section Équipe ci-dessous.
- Pour un état (à terre, effrayé, paralysé, etc.) : apply_condition(combatant_id, condition, add=true).
- Ces outils fonctionnent même hors combat formel — ils mettent le personnage à jour directement.
- Réserve start_combat pour de vraies rencontres qui demandent un ordre d'initiative strict.

Magie et repos :
- Quand un PJ ou compagnon lance un SORT qui coûte un emplacement (pas les cantrips niv. 0) : appelle cast_spell(character_id, spell_level, spell_name). Si l'outil renvoie "Aucun emplacement disponible", fais échouer le sort dans la fiction.
- Quand la fiction décrit un bivouac, une veille, une nuit de sommeil : appelle trigger_rest(character_id, kind). Repos court (1h, petite pause) = "short" → regagne 1d[DV]+CON. Repos long (8h, nuit complète) = "long" → PV max, tous les emplacements restaurés, exhaustion -1.

Format des réponses :
- Narration courte (3-6 phrases maximum par message)
- Pas de markdown (ni **gras**, ni listes, ni titres ##)
- Pas d'emojis
- Italique en HTML <em>...</em> uniquement pour les paroles d'un PNJ
`;

export interface GmTurnInput {
  sessionId: string;
  userMessage: string;
  history: MessageRow[];
  player: CharacterRow | null;
  companions: CharacterRow[];
  /** Campaign pitch / world summary — injected in system prompt. */
  worldSummary?: string | null;
}

export type GmEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'dice_request'; rollId: string; roll: DiceRollRecord; label: string }
  | { type: 'memory_recalled'; query: string; result: string }
  | { type: 'entity_recorded'; kind: string; name: string }
  | { type: 'companion'; characterId: string; characterName: string; content: string }
  | { type: 'combat_started'; combatId: string }
  | { type: 'combat_ended' }
  | { type: 'combat_update' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface DiceRollRecord {
  id?: string;
  kind: string;
  /** Human-readable label chosen by the GM, e.g. "Perception", "Sauvegarde SAG". */
  label: string;
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
  outcome: string | null;
  advantage: 'normal' | 'advantage' | 'disadvantage';
  /** DC for saves/checks. */
  dc?: number;
  /** Target AC for attacks. */
  targetAC?: number;
}

/**
 * Run the GM orchestration loop. Streams text deltas and tool results as
 * structured events. Caller persists the final message once the generator
 * yields { type: 'done' }.
 */
export async function* runGmTurn(input: GmTurnInput): AsyncGenerator<GmEvent> {
  const companionNameById = new Map(input.companions.map((c) => [c.id, c.name]));
  const messages: Anthropic.Messages.MessageParam[] = input.history
    .filter(
      (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
    )
    .map((m) => {
      if (m.author_kind === 'gm') {
        return { role: 'assistant' as const, content: m.content };
      }
      if (m.author_kind === 'character') {
        const name = (m.author_id && companionNameById.get(m.author_id)) || 'Compagnon';
        return { role: 'user' as const, content: `(${name} dit) ${m.content}` };
      }
      return { role: 'user' as const, content: m.content };
    });
  if (input.userMessage && input.userMessage.trim().length > 0) {
    messages.push({ role: 'user', content: input.userMessage });
  }

  const systemPrompt = buildSystemPrompt(input.player, input.companions, input.worldSummary);

  let safety = 0;
  while (safety < 6) {
    safety++;
    let response: Anthropic.Messages.Message;
    try {
      response = await anthropic().messages.create({
        model: MODELS.GM,
        max_tokens: 1024,
        system: systemPrompt,
        tools: GM_TOOLS,
        messages,
      });
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : 'LLM error' };
      return;
    }

    for (const block of response.content) {
      if (block.type === 'text') {
        yield { type: 'text_delta', delta: block.text };
      }
    }

    if (response.stop_reason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    // Run every tool call, then loop.
    const assistantContent: Anthropic.Messages.ContentBlockParam[] = response.content;
    messages.push({ role: 'assistant', content: assistantContent });
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block, input.sessionId);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result.result),
      });
      for (const ev of result.events) yield ev;
    }
    messages.push({ role: 'user', content: toolResults });
  }
  yield { type: 'error', message: 'Too many tool iterations' };
}

// --- Zod schemas for every tool input --------------------------------------
// The LLM produces these inputs. We validate before trusting them, so a
// hallucinated or prompt-injected payload can't reach the DB.

const ROLL_KINDS = ['attack', 'damage', 'save', 'check', 'initiative', 'concentration'] as const;
const ADVANTAGE = ['normal', 'advantage', 'disadvantage'] as const;
const ENTITY_KINDS = ['npc', 'location', 'faction', 'item', 'quest', 'event'] as const;
const ITEM_TYPES = ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc'] as const;

const rollSchema = z.object({
  kind: z.enum(ROLL_KINDS),
  label: z.string().trim().min(1).max(80),
  dice: z.string().regex(/^\s*\d*d(4|6|8|10|12|20|100)(\s*[+-]\s*\d+)?\s*$/i),
  dc: z.number().int().min(1).max(40).optional(),
  target_ac: z.number().int().min(1).max(40).optional(),
  advantage: z.enum(ADVANTAGE).optional(),
});

const recallSchema = z.object({ query: z.string().min(1).max(200) });

const recordEntitySchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().trim().min(1).max(120),
  short_description: z.string().trim().max(400).optional(),
});

const combatantIdSchema = z.string().min(1).max(128);
const characterIdSchema = z.string().uuid();

const startCombatSchema = z.object({
  npcs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        ac: z.number().int().min(5).max(30),
        hp: z.number().int().min(1).max(999),
        dex_mod: z.number().int().min(-5).max(10).optional(),
      }),
    )
    .min(0)
    .max(12),
});

const applyDamageSchema = z.object({
  combatant_id: combatantIdSchema,
  amount: z.number().int().min(-999).max(999),
});

const applyConditionSchema = z.object({
  combatant_id: combatantIdSchema,
  condition: z.enum(CONDITION_TYPES as unknown as [string, ...string[]]),
  add: z.boolean(),
  duration_rounds: z.number().int().min(1).max(100).optional(),
});

const grantItemSchema = z.object({
  character_id: characterIdSchema,
  name: z.string().trim().min(1).max(80),
  qty: z.number().int().min(-999).max(999),
  type: z.enum(ITEM_TYPES).optional(),
  description: z.string().trim().max(400).optional(),
});

const adjustCurrencySchema = z.object({
  character_id: characterIdSchema,
  cp: z.number().int().min(-99999).max(99999).optional(),
  sp: z.number().int().min(-99999).max(99999).optional(),
  ep: z.number().int().min(-99999).max(99999).optional(),
  gp: z.number().int().min(-99999).max(99999).optional(),
  pp: z.number().int().min(-99999).max(99999).optional(),
});

const promptCompanionSchema = z.object({
  character_id: characterIdSchema,
  hint: z.string().trim().max(400).optional(),
});

const castSpellSchema = z.object({
  character_id: characterIdSchema,
  spell_level: z.number().int().min(1).max(9),
  spell_name: z.string().trim().max(80).optional(),
});

const triggerRestSchema = z.object({
  character_id: characterIdSchema,
  kind: z.enum(['short', 'long']),
});

/**
 * Parse an LLM-provided tool input with Zod. Returns the parsed value or an
 * error payload that can be fed back to the LLM without crashing the turn.
 */
function parseToolInput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; result: unknown } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    result: {
      error: 'Invalid tool input',
      details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    },
  };
}

async function executeTool(
  block: Anthropic.Messages.ToolUseBlock,
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  switch (block.name) {
    case 'request_roll': {
      const p = parseToolInput(rollSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executeRoll(p.data as RequestRollInput, sessionId);
    }
    case 'recall_memory': {
      const p = parseToolInput(recallSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const q = p.data.query;
      const campaignId = await campaignIdOfSession(sessionId);
      if (!campaignId) return { result: { context: 'Session invalide.' }, events: [] };
      try {
        const entities = await recallEntities(campaignId, q);
        const context =
          entities.length === 0
            ? 'Aucune entité correspondante en mémoire.'
            : entities
                .map((e) => `- ${e.kind} "${e.name}": ${e.short_description ?? '(pas de résumé)'}`)
                .join('\n');
        return {
          result: { entities, context },
          events: [{ type: 'memory_recalled', query: q, result: String(entities.length) }],
        };
      } catch (err) {
        return {
          result: {
            context: 'Mémoire momentanément indisponible.',
            error: err instanceof Error ? err.message : 'neo4j error',
          },
          events: [],
        };
      }
    }
    case 'record_entity': {
      const p = parseToolInput(recordEntitySchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input: RecordEntityInput = p.data;
      const campaignId = await campaignIdOfSession(sessionId);
      if (!campaignId) return { result: { ok: false, error: 'Session invalide.' }, events: [] };
      const supabase = createSupabaseServiceClient();
      const { data: row } = await supabase
        .from('entities')
        .insert({
          campaign_id: campaignId,
          kind: input.kind,
          name: input.name,
          short_description: input.short_description ?? null,
        })
        .select('*')
        .single();
      try {
        if (row) {
          await upsertEntity({
            id: row.id,
            campaign_id: campaignId,
            kind: input.kind as EntityKind,
            name: input.name,
            short_description: input.short_description,
          });
        }
      } catch (err) {
        console.warn('Neo4j upsert failed, continuing', err);
      }
      return {
        result: { ok: true, id: row?.id },
        events: [{ type: 'entity_recorded', kind: input.kind, name: input.name }],
      };
    }
    case 'grant_item': {
      const p = parseToolInput(grantItemSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await characterInSession(sessionId, input.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await grantItemToCharacter(input);
    }
    case 'adjust_currency': {
      const p = parseToolInput(adjustCurrencySchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await characterInSession(sessionId, input.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await adjustCharacterCurrency(input);
    }
    case 'cast_spell': {
      const p = parseToolInput(castSpellSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      if (!(await characterInSession(sessionId, p.data.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await castSpellOnCharacter(p.data.character_id, p.data.spell_level);
    }
    case 'trigger_rest': {
      const p = parseToolInput(triggerRestSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      if (!(await characterInSession(sessionId, p.data.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await triggerRestOnCharacter(p.data.character_id, p.data.kind);
    }
    case 'prompt_companion': {
      const p = parseToolInput(promptCompanionSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await characterInSession(sessionId, input.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return executeCompanion(input, sessionId);
    }
    case 'start_combat': {
      const p = parseToolInput(startCombatSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      const supabase = createSupabaseServiceClient();
      const { data: session } = await supabase
        .from('sessions')
        .select('campaign_id')
        .eq('id', sessionId)
        .single();
      if (!session) return { result: { error: 'Session introuvable' }, events: [] };
      const { data: characters } = await supabase
        .from('characters')
        .select('*')
        .eq('campaign_id', session.campaign_id);
      const combat = await startCombat({
        sessionId,
        npcs: input.npcs.map((n) => ({
          name: n.name,
          ac: n.ac,
          hp: n.hp,
          dexMod: n.dex_mod,
        })),
        characters: (characters ?? []) as CharacterRow[],
      });
      return {
        result: {
          combat_id: combat.id,
          round: combat.round,
          order: combat.initiative_order,
          combatants: combat.combatants,
        },
        events: [{ type: 'combat_started', combatId: combat.id }],
      };
    }
    case 'apply_damage': {
      const p = parseToolInput(applyDamageSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await combatantBelongsToSession(sessionId, input.combatant_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      const enc = await activeEncounter(sessionId);
      if (enc) {
        const next = await mutateEncounter(enc.id, (e) =>
          input.amount >= 0
            ? applyDamageToCombatant(e, input.combatant_id, input.amount)
            : healCombatant(e, input.combatant_id, -input.amount),
        );
        return {
          result: { combatants: next.combatants },
          events: [{ type: 'combat_update' }],
        };
      }
      // No active encounter — operate directly on the character row.
      return await applyDamageToCharacter(input.combatant_id, input.amount);
    }
    case 'apply_condition': {
      const p = parseToolInput(applyConditionSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = {
        ...p.data,
        condition: p.data.condition as ConditionType,
      };
      if (!(await combatantBelongsToSession(sessionId, input.combatant_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      const enc = await activeEncounter(sessionId);
      if (enc) {
        const next = await mutateEncounter(enc.id, (e) =>
          toggleCondition(e, input.combatant_id, input.condition, input.add, input.duration_rounds),
        );
        return {
          result: { combatants: next.combatants },
          events: [{ type: 'combat_update' }],
        };
      }
      return await toggleConditionOnCharacter(
        input.combatant_id,
        input.condition,
        input.add,
        input.duration_rounds,
      );
    }
    case 'next_turn': {
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      const next = await mutateEncounter(enc.id, advanceTurnEncounter);
      return {
        result: { round: next.round, current_turn_index: next.current_turn_index },
        events: [{ type: 'combat_update' }],
      };
    }
    case 'end_combat': {
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      await endCombat(enc.id);
      return { result: { ok: true }, events: [{ type: 'combat_ended' }] };
    }
    default:
      return { result: { error: `Unknown tool: ${block.name}` }, events: [] };
  }
}

function buildSystemPrompt(
  player: CharacterRow | null,
  companions: CharacterRow[],
  worldSummary?: string | null,
): string {
  const partyLines: string[] = [];
  if (player) {
    partyLines.push(
      `- Le joueur incarne ${player.name} (${player.species} · ${player.class} niv. ${player.level}). PV ${player.current_hp}/${player.max_hp}, CA ${player.ac}.`,
    );
  }
  if (companions.length > 0) {
    partyLines.push(
      "- Compagnons IA autour du feu (utilise l'outil prompt_companion pour leur donner la parole) :",
    );
    for (const c of companions) {
      const persona =
        typeof c.persona === 'object' && c.persona && 'notes' in c.persona
          ? String((c.persona as { notes?: unknown }).notes ?? '')
          : '';
      partyLines.push(
        `  · id="${c.id}" — ${c.name} (${c.species} ${c.class} niv. ${c.level})${persona ? ` — ${persona}` : ''}`,
      );
    }
  } else {
    partyLines.push(
      "- Le joueur n'a pas encore de compagnon IA. Si la situation s'y prête, tu peux évoquer qu'il est seul, mais NE propose PAS d'en introduire : c'est le joueur qui en recrute via la page Équipe.",
    );
  }

  const worldBlock = worldSummary ? `\nCampagne en cours :\n${worldSummary.trim()}\n` : '';

  return `${GM_SYSTEM_PROMPT}
${worldBlock}
Équipe actuelle :
${partyLines.join('\n')}

Quand un compagnon est présent, pense à lui laisser la parole régulièrement via prompt_companion — décris une scène, puis passe-lui le micro (indique character_id et éventuellement un hint).`;
}

async function executeCompanion(
  input: { character_id: string; hint?: string },
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) {
    return { result: { error: 'Compagnon introuvable' }, events: [] };
  }
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const text = await respondAsCompanion({
    sessionId,
    character,
    history: history ?? [],
    hint: input.hint,
  });
  return {
    result: { said: text || '(silence)' },
    events: text
      ? [
          {
            type: 'companion',
            characterId: character.id,
            characterName: character.name,
            content: text,
          },
        ]
      : [],
  };
}

async function executeRoll(
  input: RequestRollInput,
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const advantage = input.advantage ?? 'normal';
  const roll = resolveRoll(input, advantage);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('dice_rolls')
    .insert({
      session_id: sessionId,
      roll_kind: mapRollKind(input.kind),
      expression: input.dice,
      raw_dice: roll.dice,
      modifier: roll.modifier,
      total: roll.total,
      advantage,
      dc: input.dc ?? null,
      target_ac: input.target_ac ?? null,
      outcome: roll.outcome,
      context: { label: input.label },
    })
    .select('*')
    .single();

  const record: DiceRollRecord = {
    id: data?.id,
    kind: input.kind,
    label: input.label,
    expression: input.dice,
    dice: roll.dice,
    modifier: roll.modifier,
    total: roll.total,
    outcome: roll.outcome,
    advantage,
    ...(input.dc !== undefined ? { dc: input.dc } : {}),
    ...(input.target_ac !== undefined ? { targetAC: input.target_ac } : {}),
  };
  return {
    result: {
      total: roll.total,
      dice: roll.dice,
      outcome: roll.outcome,
      label: input.label,
    },
    events: [
      {
        type: 'dice_request',
        rollId: data?.id ?? 'local',
        roll: record,
        label: input.label,
      },
    ],
  };
}

function resolveRoll(
  input: RequestRollInput,
  advantage: 'normal' | 'advantage' | 'disadvantage',
): { dice: number[]; modifier: number; total: number; outcome: string | null } {
  const parsed = parseDiceExpression(input.dice);
  if (parsed.faces === 20 && parsed.count === 1 && input.kind !== 'damage') {
    const d20 = rollD20(parsed.modifier, advantage);
    const nat = d20.roll;
    const outcome =
      input.kind === 'attack'
        ? nat === 20
          ? 'crit'
          : nat === 1
            ? 'fumble'
            : input.target_ac !== undefined && d20.total >= input.target_ac
              ? 'hit'
              : 'miss'
        : input.dc !== undefined
          ? d20.total >= input.dc
            ? 'success'
            : 'failure'
          : null;
    return {
      dice: d20.rawRolls,
      modifier: parsed.modifier,
      total: d20.total,
      outcome,
    };
  }
  const r = rollExpression(input.dice);
  return { dice: r.dice, modifier: r.modifier, total: r.total, outcome: null };
}

function mapRollKind(
  kind: RequestRollInput['kind'],
): 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration' {
  return kind;
}

async function applyDamageToCharacter(
  characterId: string,
  amount: number,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, current_hp, max_hp, temp_hp')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  if (amount >= 0) {
    // Damage — absorb temp first.
    let remaining = amount;
    let temp = character.temp_hp;
    if (temp > 0) {
      const absorbed = Math.min(temp, remaining);
      temp -= absorbed;
      remaining -= absorbed;
    }
    const newCurrent = Math.max(0, character.current_hp - remaining);
    await supabase
      .from('characters')
      .update({ current_hp: newCurrent, temp_hp: temp })
      .eq('id', characterId);
    return {
      result: { ok: true, current_hp: newCurrent, max_hp: character.max_hp },
      events: [{ type: 'combat_update' }],
    };
  }
  const newCurrent = Math.min(character.max_hp, character.current_hp + -amount);
  await supabase.from('characters').update({ current_hp: newCurrent }).eq('id', characterId);
  return {
    result: { ok: true, current_hp: newCurrent, max_hp: character.max_hp },
    events: [{ type: 'combat_update' }],
  };
}

async function toggleConditionOnCharacter(
  characterId: string,
  condition: ConditionType,
  add: boolean,
  durationRounds?: number,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, conditions')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const existing = (character.conditions as Array<{ type: string; durationRounds?: number }>) ?? [];
  const next = add
    ? existing.some((c) => c.type === condition)
      ? existing.map((c) => (c.type === condition ? { ...c, durationRounds } : c))
      : [...existing, { type: condition, durationRounds }]
    : existing.filter((c) => c.type !== condition);
  await supabase.from('characters').update({ conditions: next }).eq('id', characterId);
  return {
    result: { ok: true, conditions: next },
    events: [{ type: 'combat_update' }],
  };
}

interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
}

async function grantItemToCharacter(input: {
  character_id: string;
  name: string;
  qty: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
}): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, inventory')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const items = (character.inventory as InventoryItem[]) ?? [];
  const type = input.type ?? 'misc';
  const existing = items.find(
    (i) => i.name.toLowerCase() === input.name.toLowerCase() && (i.type ?? 'misc') === type,
  );
  let next: InventoryItem[];
  if (existing) {
    next = items
      .map((i) => (i === existing ? { ...i, qty: i.qty + input.qty } : i))
      .filter((i) => i.qty > 0);
  } else if (input.qty > 0) {
    next = [
      ...items,
      {
        id: `i-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: input.name,
        qty: input.qty,
        type,
        description: input.description,
      },
    ];
  } else {
    next = items;
  }
  await supabase.from('characters').update({ inventory: next }).eq('id', input.character_id);
  return {
    result: { ok: true, inventory: next },
    events: [{ type: 'combat_update' }],
  };
}

async function adjustCharacterCurrency(input: {
  character_id: string;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, currency')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const current = (character.currency as {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  }) ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const next = {
    cp: Math.max(0, current.cp + (input.cp ?? 0)),
    sp: Math.max(0, current.sp + (input.sp ?? 0)),
    ep: Math.max(0, current.ep + (input.ep ?? 0)),
    gp: Math.max(0, current.gp + (input.gp ?? 0)),
    pp: Math.max(0, current.pp + (input.pp ?? 0)),
  };
  await supabase.from('characters').update({ currency: next }).eq('id', input.character_id);
  return {
    result: { ok: true, currency: next },
    events: [{ type: 'combat_update' }],
  };
}

// --- Spell slot consumption + rest --------------------------------------

async function castSpellOnCharacter(
  characterId: string,
  spellLevel: number,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, spell_slots')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const slots = (character.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
  const slot = slots[String(spellLevel)];
  if (!slot || slot.used >= slot.max) {
    return {
      result: {
        ok: false,
        error: `Aucun emplacement de niveau ${spellLevel} disponible. Le sort ne peut pas être lancé.`,
      },
      events: [],
    };
  }
  const next = { ...slots, [spellLevel]: { ...slot, used: slot.used + 1 } };
  await supabase.from('characters').update({ spell_slots: next }).eq('id', characterId);
  return {
    result: {
      ok: true,
      spell_level: spellLevel,
      remaining: slot.max - (slot.used + 1),
      out_of: slot.max,
    },
    events: [{ type: 'combat_update' }],
  };
}

async function triggerRestOnCharacter(
  characterId: string,
  kind: 'short' | 'long',
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, con, current_hp, max_hp, spell_slots, exhaustion, class')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };

  if (kind === 'long') {
    const slots = (character.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
    const restoredSlots: Record<string, { max: number; used: number }> = {};
    for (const [lvl, s] of Object.entries(slots)) {
      restoredSlots[lvl] = { max: s.max, used: 0 };
    }
    const nextExhaustion = Math.max(0, character.exhaustion - 1);
    await supabase
      .from('characters')
      .update({
        current_hp: character.max_hp,
        spell_slots: restoredSlots,
        exhaustion: nextExhaustion,
      })
      .eq('id', characterId);
    return {
      result: {
        ok: true,
        kind: 'long',
        current_hp: character.max_hp,
        exhaustion: nextExhaustion,
        slots_restored: true,
      },
      events: [{ type: 'combat_update' }],
    };
  }

  // Short rest: regain 1 hit die. Class → hit die faces.
  const classFaces: Record<string, number> = {
    barbarian: 12,
    bard: 8,
    cleric: 8,
    druid: 8,
    fighter: 10,
    monk: 8,
    paladin: 10,
    ranger: 10,
    rogue: 8,
    sorcerer: 6,
    warlock: 8,
    wizard: 6,
  };
  const faces = classFaces[character.class] ?? 8;
  const roll = 1 + Math.floor(Math.random() * faces);
  const conMod = Math.floor((character.con - 10) / 2);
  const gained = Math.max(1, roll + conMod);
  const newHP = Math.min(character.max_hp, character.current_hp + gained);
  await supabase.from('characters').update({ current_hp: newHP }).eq('id', characterId);
  return {
    result: {
      ok: true,
      kind: 'short',
      hit_die_rolled: `d${faces}`,
      roll,
      con_mod: conMod,
      hp_gained: gained,
      current_hp: newHP,
    },
    events: [{ type: 'combat_update' }],
  };
}
