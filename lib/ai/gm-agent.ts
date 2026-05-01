import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, CombatEncounterRow, MessageRow } from '../db/types';
import {
  type EntityKind,
  listEntitiesForCampaign,
  searchEntities,
  upsertEntityNode,
} from '../neo4j/queries';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
import { CONDITION_TYPES, type ConditionType } from '../rules/types';
import { weaponAttack } from '../rules/weapon-attack';
import {
  activeEncounter,
  advanceTurnEncounter,
  applyDamageToCombatant,
  type Combatant,
  endCombat,
  healCombatant,
  mutateEncounter,
  startCombat,
  toggleCondition,
} from '../server/combat';
import type { InventoryItem } from '../server/inventory-actions';
import { respondAsCompanion } from './companion-agent';
import { llm } from './llm';
import type { ChatMessage, ToolCallOut, ToolResultIn } from './llm/types';
import { compactHistory } from './rolling-summary';
import { campaignIdOfSession, characterInSession, combatantBelongsToSession } from './tenant-guard';
import { GM_TOOLS, type RecordEntityInput, type RequestRollInput } from './tools';

const GM_SYSTEM_PROMPT = `Tu es "Le Conteur", MJ d'une partie de D&D 5e SRD. Style dark fantasy cozy, français, 3-6 phrases par tour, pas de markdown, pas d'emojis, italique <em>…</em> pour les paroles de PNJ. Théâtre de l'esprit (pas de grille).

Jets : TOUJOURS via l'outil request_roll avant de décrire l'issue. Jamais "Fais un jet", "Lance un dé", "Jette les dés".

Chaîne attack → damage : sur hit/crit, enchaîne IMMÉDIATEMENT request_roll(kind="damage", dice="<arme+mod>", target_combatant_id="<UUID cible>"). Le serveur APPLIQUE automatiquement les dégâts — NE RAPPELLE PAS apply_damage après. Sur crit, double les dés ("2d8+3" au lieu de "1d8+3"). Nat 20 = critique, nat 1 = complication.

Soins : pour un sort/objet de soin, utilise kind="heal" (PAS "damage") avec target_combatant_id. Ex : Soins niv 1 → request_roll(kind="heal", dice="1d8+3", target_combatant_id="<PJ>"). Le serveur remonte les PV automatiquement. Utiliser kind="damage" avec un target_combatant_id sur un allié baisserait ses PV — c'est ce que tu veux SEULEMENT si c'est un coup reçu.

PV & états : apply_damage(combatant_id, amount) pour dégâts/soins (négatif=soin). apply_condition(combatant_id, condition, add). Ne JAMAIS écrire les PV dans le texte — l'UI les affiche depuis la DB. start_combat seulement pour rencontres avec initiative.

Tours en combat (quand un bloc "Combat actif" est présent) : tu DOIS dérouler l'initiative, pas attendre que le joueur le fasse.
- Tour PNJ : tu décides son action, tu appelles request_roll(kind="attack", target_ac=…, target_combatant_id=<PJ/compagnon>), enchaînes damage si hit, narres, puis next_turn.
- Tour PJ : si le joueur a parlé tu résous, sinon tu décris l'instant et tu attends. Après résolution → next_turn.
- Tour compagnon : prompt_companion(character_id) puis next_turn quand il a fini d'agir.
- Cible à 0 PV : tu narres sa chute mais next_turn la saute naturellement (l'ordre la garde).
- Tu enchaînes les tours PNJ d'affilée jusqu'à retomber sur un PJ — pas d'attente entre deux PNJ. end_combat dès que tous les PNJ sont à 0.

Magie/repos : cast_spell(character_id, level) consomme un emplacement. trigger_rest(character_id, "short"|"long").

Butin : narre librement qui ramasse/donne/dépense quoi — un concierge post-tour met à jour bourses et inventaires. Tu peux quand même appeler grant_item/adjust_currency si un transfert doit se faire en plein tour (dépense AVANT un gain).

Ne résume pas l'action du joueur — enchaîne sur les conséquences. Conclus souvent par "Que fais-tu ?".`;

import type { Universe } from '../db/types';

export interface GmTurnInput {
  sessionId: string;
  userMessage: string;
  history: MessageRow[];
  player: CharacterRow | null;
  companions: CharacterRow[];
  /** Campaign pitch / world summary — injected in system prompt. */
  worldSummary?: string | null;
  /** Universe for the campaign (dnd5e or witcher) — affects GM style and rules. */
  universe?: Universe | null;
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
  const relevantHistory = input.history.filter(
    (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
  );
  const { summary: rollingSummary, tail } = await compactHistory(input.sessionId, relevantHistory);
  const campaignId = await campaignIdOfSession(input.sessionId).catch((err) => {
    if (process.env.NODE_ENV !== 'production') console.warn('[memory.campaignId]', err);
    return null;
  });
  const knownEntities = campaignId
    ? await listEntitiesForCampaign(campaignId, 6).catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[memory.listEntities]', err);
        return [];
      })
    : [];
  const encounter = await activeEncounter(input.sessionId).catch((err) => {
    if (process.env.NODE_ENV !== 'production') console.warn('[combat.activeEncounter]', err);
    return null;
  });

  // Per-message cap: DB allows 16 KB but shipping six full-size blocks plus
  // a 16 KB world summary on every turn ≈ 32 k tokens → ~0,50 $ / turn Opus.
  // Clipping to ~2 k chars per tail entry keeps typical turns well under
  // 8 k input tokens without losing recent context (rolling summary covers
  // everything older anyway).
  const MAX_TAIL_CHARS = 2000;
  const messages: ChatMessage[] = tail.map((m) => {
    const content = clipText(m.content, MAX_TAIL_CHARS);
    if (m.author_kind === 'gm') {
      return { role: 'assistant' as const, content };
    }
    if (m.author_kind === 'character') {
      const name = (m.author_id && companionNameById.get(m.author_id)) || 'Compagnon';
      return { role: 'user' as const, content: `(${name} dit) ${content}` };
    }
    return { role: 'user' as const, content };
  });
  if (input.userMessage && input.userMessage.trim().length > 0) {
    messages.push({ role: 'user', content: clipText(input.userMessage, MAX_TAIL_CHARS) });
  }

  // Safety: ensure at least one user message exists for the GM to respond to
  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Que fais-tu ?' });
  }

  const systemPrompt = buildSystemPrompt(
    input.player,
    input.companions,
    input.worldSummary,
    rollingSummary,
    knownEntities,
    input.universe ?? 'dnd5e',
    encounter,
  );

  if (process.env.NODE_ENV !== 'production') {
    const inputChars = systemPrompt.length + messages.reduce((n, m) => n + contentLength(m), 0);
    console.debug(`[gm] input ≈ ${Math.round(inputChars / 4)} tokens (${inputChars} chars)`);
  }

  // Two independent safety counters: reprompt retries (roll-delegation
  // safeguard) shouldn't steal budget from real tool iterations. When either
  // cap is hit we soft-close the turn with a short narrative pause rather
  // than surfacing an error to the player.
  const MAX_TOOL_ITERATIONS = 12;
  const MAX_REPROMPT_RETRIES = 2;
  let toolIterations = 0;
  let repromptRetries = 0;

  while (toolIterations < MAX_TOOL_ITERATIONS) {
    toolIterations++;
    let response: Awaited<ReturnType<ReturnType<typeof llm>['chat']>>;
    try {
      response = await llm().chat({
        role: 'gm',
        system: systemPrompt,
        messages,
        tools: GM_TOOLS,
        maxTokens: 600,
      });
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : 'LLM error' };
      return;
    }

    const fullText = response.text.trim();
    const calledRequestRoll = response.toolCalls.some((c) => c.name === 'request_roll');
    const calledPromptCompanion = response.toolCalls.some((c) => c.name === 'prompt_companion');

    // Roll-delegation safeguard — only retry a limited number of times so
    // a stubborn model can't exhaust the tool budget.
    if (hasRollDelegation(fullText) && !calledRequestRoll) {
      if (repromptRetries >= MAX_REPROMPT_RETRIES) {
        if (fullText) yield { type: 'text_delta', delta: fullText };
        yield { type: 'done' };
        return;
      }
      repromptRetries++;
      toolIterations--; // reprompt shouldn't eat the tool budget
      messages.push({ role: 'assistant', content: '(tour rejeté : jet délégué au joueur)' });
      messages.push({
        role: 'user',
        content:
          'Tu viens d\'écrire une formule qui délègue un jet au joueur (ex: "Fais un jet", "Lance un dé", "Jette les dés"). C\'est interdit. Annule cette narration et appelle request_roll MAINTENANT, puis reprends la suite en fonction du résultat.',
      });
      continue;
    }

    // Companion-without-narration safeguard. If the GM hands the mic to a
    // companion without narrating anything, the chat shows an empty
    // Conteur bubble next to the companion's reply. Reprompt to force a
    // scene description first.
    if (calledPromptCompanion && !fullText && repromptRetries < MAX_REPROMPT_RETRIES) {
      repromptRetries++;
      toolIterations--;
      messages.push({
        role: 'assistant',
        content: '(tour rejeté : compagnon invoqué sans narration)',
      });
      messages.push({
        role: 'user',
        content:
          "Tu as appelé prompt_companion sans rien narrer. Décris d'abord la scène en 2-4 phrases (ce que voit/sent/entend le joueur), PUIS appelle prompt_companion si pertinent.",
      });
      continue;
    }

    if (fullText) yield { type: 'text_delta', delta: fullText };

    if (response.stopReason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    messages.push({ role: 'assistant', content: fullText, toolCalls: response.toolCalls });
    const results: ToolResultIn[] = [];
    for (const call of response.toolCalls) {
      const result = await executeTool(call, input.sessionId);
      results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
      for (const ev of result.events) yield ev;
    }
    messages.push({ role: 'tool', results });
  }

  // Soft-close: the model got stuck in a tool loop. Give the player a
  // natural pause rather than an error banner — they can prompt again.
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[gm] tool iteration cap hit — soft-closing turn');
  }
  yield {
    type: 'text_delta',
    delta: '\n\n<em>Le Conteur reprend son souffle. Que fais-tu ?</em>',
  };
  yield { type: 'done' };
}

// --- Zod schemas for every tool input --------------------------------------
// The LLM produces these inputs. We validate before trusting them, so a
// hallucinated or prompt-injected payload can't reach the DB.

const ROLL_KINDS = [
  'attack',
  'damage',
  'heal',
  'save',
  'check',
  'initiative',
  'concentration',
] as const;
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
  // When kind='damage' and target_combatant_id is provided, the server
  // applies the damage total automatically — the GM doesn't need a
  // separate apply_damage call. Positive total = damage, negative = heal.
  target_combatant_id: z.string().min(1).max(128).optional(),
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
  weapon: z
    .object({
      damage_dice: z.string().regex(/^\s*\d*d(4|6|8|10|12|20|100)(\s*[+-]\s*\d+)?\s*$/i),
      damage_type: z.string().trim().max(40).optional(),
      ability: z.enum(['str', 'dex', 'finesse']).optional(),
      ranged: z.boolean().optional(),
    })
    .optional(),
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
  block: ToolCallOut,
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
        const entities = await searchEntities(campaignId, q);
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
      const id = crypto.randomUUID();
      try {
        await upsertEntityNode({
          id,
          campaign_id: campaignId,
          kind: input.kind as EntityKind,
          name: input.name,
          short_description: input.short_description,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[memory.record_entity]', err);
        return {
          result: { ok: false, error: 'Neo4j indisponible' },
          events: [],
        };
      }
      return {
        result: { ok: true, id },
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
  rollingSummary?: string | null,
  knownEntities?: Array<{ name: string; kind: string; short_description: string | null }>,
  universe?: Universe,
  encounter?: CombatEncounterRow | null,
): string {
  // Default to dnd5e if universe is not provided
  const effectiveUniverse = universe ?? 'dnd5e';
  const partyLines: string[] = [];
  if (player) {
    partyLines.push(
      `- Le joueur incarne ${player.name} (id="${player.id}", ${player.species} · ${player.class} niv. ${player.level}). PV ${player.current_hp}/${player.max_hp}, CA ${player.ac}.`,
    );
    const weaponLines = describeWeapons(player);
    if (weaponLines.length > 0) {
      partyLines.push(`  · Armes : ${weaponLines.join(' ; ')}`);
    }
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

  // Cap worldSummary and rollingSummary server-side at ~3000 chars — Postgres allows 16 KB but
  // shipping that every turn is wasteful. Haiku targets 80-120 words = ~600 chars, but
  // cap at 3000 to prevent token budget blowup.
  const worldBlock = worldSummary
    ? `\nCampagne en cours :\n${clipText(worldSummary.trim(), 3000)}\n`
    : '';
  const rollingBlock = rollingSummary
    ? `\nJusqu'ici dans cette veillée (résumé, les faits sont canon) :\n${clipText(rollingSummary.trim(), 3000)}\n`
    : '';
  const memoryBlock = buildMemoryBlock(knownEntities ?? []);
  const combatBlock = renderCombatBlock(encounter ?? null);

  // Build universe-specific system prompt
  const basePrompt = effectiveUniverse === 'witcher' ? GM_SYSTEM_PROMPT_WITCHER : GM_SYSTEM_PROMPT;

  return `${basePrompt}
${worldBlock}${rollingBlock}${memoryBlock}${combatBlock}
Équipe actuelle :
${partyLines.join('\n')}

Quand un compagnon est présent, pense à lui laisser la parole régulièrement via prompt_companion — décris une scène, puis passe-lui le micro (indique character_id et éventuellement un hint).`;
}

const GM_SYSTEM_PROMPT_WITCHER = `Tu es "Le Conteur", MJ d'une partie dans l'univers de The Witcher. Style sombre et réaliste, français, 3-6 phrases par tour, pas de markdown, pas d'emojis, italique <em>…</em> pour les paroles de PNJ. Théâtre de l'esprit.

Règles Witcher : utilise les termes adaptés — sorceleurs (guerriers-mages), sources (magie du chaos), signes (sorts), potions, alchimie, contrats de chasse. Les races : humains, elfes, nains, demi-elfes, halflings. Pas de classes D&D traditionnelles : les personnages sont des sorceleurs, mages, voleurs, éclaireurs, guerriers, etc.

Jets : TOUJOURS via l'outil request_roll avant de décrire l'issue. Jamais "Fais un jet", "Lance un dé", "Jette les dés".

Chaîne attack → damage : sur hit/crit, enchaîne IMMÉDIATEMENT request_roll(kind="damage", dice="<arme+mod>", target_combatant_id="<UUID cible>"). Le serveur APPLIQUE automatiquement les dégâts. Sur crit, double les dés ("2d6+3" au lieu de "1d6+3").

Soins : pour un sort/objet de soin, utilise kind="heal" avec target_combatant_id. Ex : Soins → request_roll(kind="heal", dice="1d8+3", target_combatant_id="<PJ>").

PV & états : apply_damage(combatant_id, amount) pour dégâts/soins (négatif=soin). apply_condition(combatant_id, condition, add).

Tours en combat (quand un bloc "Combat actif" est présent) : tu DOIS dérouler l'initiative.
- Tour PNJ : tu décides son action, request_roll(kind="attack", target_ac=…, target_combatant_id=<PJ/compagnon>), damage si hit, narres, next_turn.
- Tour PJ : tu résous s'il a parlé, sinon tu décris et tu attends. next_turn après résolution.
- Tour compagnon : prompt_companion(character_id), puis next_turn.
- Cible à 0 PV : narre la chute, next_turn la saute. end_combat dès que tous les PNJ sont à 0.

Magie : les "signes" sont la magie des sorceleurs. Pas de sorts traditionnels D&D. cast_spell n'est PAS utilisé — utilise des actions descriptives.

Butin : narre librement qui ramasse/donne/dépense quoi — un concierge post-tour met à jour bourses et inventaires.

Ne résume pas l'action du joueur — enchaîne sur les conséquences. Conclus souvent par "Que fais-tu ?".`;

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
  const encounter = await activeEncounter(sessionId).catch(() => null);
  const combatBlock = renderCombatBlock(encounter);
  const turn = await respondAsCompanion({
    sessionId,
    character,
    history: history ?? [],
    hint: input.hint,
    encounter,
    combatBlock,
    executeRoll,
  });
  const events: GmEvent[] = [...turn.events];
  if (turn.text) {
    events.push({
      type: 'companion',
      characterId: character.id,
      characterName: character.name,
      content: turn.text,
    });
  }
  return {
    result: { said: turn.text || '(silence)' },
    events,
  };
}

export async function executeRoll(
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
  const events: GmEvent[] = [
    {
      type: 'dice_request',
      rollId: data?.id ?? 'local',
      roll: record,
      label: input.label,
    },
  ];

  // Auto-apply damage to a named target. Tenant-guarded so a hallucinated
  // UUID can't touch another campaign. Works for NPC combatants too
  // (prefix `npc-` is allowed by combatantBelongsToSession).
  // Auto-apply damage / heal when the GM targeted a combatant. The sign is
  // derived from the kind :
  //   kind='damage' → positive (HP down)
  //   kind='heal'   → negative (HP up, clamped at max via applyDamageToCharacter)
  let applied: { target: string; newHp?: number; mode?: 'damage' | 'heal' } | null = null;
  const applyable =
    (input.kind === 'damage' || input.kind === 'heal') &&
    input.target_combatant_id &&
    roll.total !== 0;
  if (applyable) {
    const targetId = input.target_combatant_id as string;
    if (await combatantBelongsToSession(sessionId, targetId)) {
      try {
        const signed = input.kind === 'heal' ? -roll.total : roll.total;
        // Route by id shape: NPC combatants live only in the encounter row,
        // PC/companion HP lives in characters (and is mirrored in the
        // encounter combatants array). applyDamageInSession picks the
        // right path so request_roll(damage, target="npc-…") actually
        // lowers the kobold's HP.
        const res = await applyDamageInSession(sessionId, targetId, signed);
        const newHp = (res.result as { current_hp?: number } | null)?.current_hp;
        applied = { target: targetId, newHp, mode: input.kind as 'damage' | 'heal' };
        for (const ev of res.events) events.push(ev);
        if (process.env.NODE_ENV !== 'production') {
          const verb = input.kind === 'heal' ? 'healed' : 'damaged';
          console.debug(
            `[gm.${input.kind}] auto-${verb} ${roll.total} on ${targetId}${
              newHp !== undefined ? ` → ${newHp} HP` : ''
            }`,
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[gm.${input.kind}] auto-apply failed`, err);
        }
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn(`[gm.${input.kind}] target ${targetId} not in session — not applied`);
    }
  }

  return {
    result: {
      total: roll.total,
      dice: roll.dice,
      outcome: roll.outcome,
      label: input.label,
      ...(applied ? { applied } : {}),
    },
    events,
  };
}

function resolveRoll(
  input: RequestRollInput,
  advantage: 'normal' | 'advantage' | 'disadvantage',
): { dice: number[]; modifier: number; total: number; outcome: string | null } {
  const parsed = parseDiceExpression(input.dice);
  if (
    parsed.faces === 20 &&
    parsed.count === 1 &&
    input.kind !== 'damage' &&
    input.kind !== 'heal'
  ) {
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
): 'attack' | 'damage' | 'heal' | 'save' | 'check' | 'initiative' | 'concentration' {
  return kind;
}

/**
 * Detects phrasings that try to make the player roll instead of calling
 * request_roll. Matches common French variants; called on every Opus turn so
 * we can swallow that text and re-prompt.
 */
const ROLL_DELEGATION_PATTERNS: RegExp[] = [
  /\bfais(?:-moi|[- ]le)?\b[^.!?\n]*\bjet\b/i,
  /\bfaire\b[^.!?\n]*\bjet\b/i,
  /\blance(?:-moi|r|s)?\b[^.!?\n]*(\bd\d+\b|\bdé[s]?\b|\bdés\b)/i,
  /\bjette(?:-moi|r|s)?\b[^.!?\n]*(\bd\d+\b|\bdés?\b)/i,
  /\broule(?:-moi|r|s)?\b[^.!?\n]*(\bdégâts?\b|\bd\d+\b|\bdés?\b)/i,
  /\bjet\s+de\s+(force|dextérité|dexterite|constitution|intelligence|sagesse|charisme|perception|investigation|discrétion|discretion|persuasion|tromperie|intimidation|athlétisme|athletisme|acrobatie|arcanes|religion|nature|survie|médecine|medecine|représentation|representation)\b/i,
  /\bsauvegarde\s+de\s+(for|dex|con|int|sag|cha)\b/i,
  /(^|\s)(à|a)\s+toi\s+de\s+(lancer|jeter)\b/i,
];

const ENTITY_KIND_LABEL: Record<string, string> = {
  npc: 'PNJ',
  location: 'Lieu',
  faction: 'Faction',
  item: 'Objet',
  quest: 'Quête',
  event: 'Événement',
};

function buildMemoryBlock(
  entities: Array<{ name: string; kind: string; short_description: string | null }>,
): string {
  if (entities.length === 0) return '';
  const lines = entities.slice(0, 6).map((e) => {
    const kindLabel = ENTITY_KIND_LABEL[e.kind] ?? e.kind;
    const desc = e.short_description ? ` — ${e.short_description.slice(0, 100)}` : '';
    return `  · [${kindLabel}] ${e.name}${desc}`;
  });
  return `\nMémoire (sois cohérent) :\n${lines.join('\n')}\n`;
}

const COMBATANT_KIND_LABEL: Record<Combatant['kind'], string> = {
  pc: 'PJ',
  companion: 'compagnon',
  npc: 'PNJ',
};

/**
 * Render the active combat as a compact block for the GM (and companion)
 * system prompt. Without this block the model has no idea who's in
 * initiative, whose turn it is, or what target ids to pass to request_roll.
 */
export function renderCombatBlock(encounter: CombatEncounterRow | null): string {
  if (!encounter || encounter.status !== 'active') return '';
  const order = encounter.initiative_order ?? [];
  const combatants = (encounter.combatants as Combatant[]) ?? [];
  if (order.length === 0 || combatants.length === 0) return '';
  const byId = new Map(combatants.map((c) => [c.id, c]));
  const currentEntry = order[encounter.current_turn_index];
  const current = currentEntry ? byId.get(currentEntry.id) : undefined;
  const lines = order.map((entry, idx) => {
    const c = byId.get(entry.id);
    if (!c) return null;
    const cursor = idx === encounter.current_turn_index ? '▶' : ' ';
    const kind = COMBATANT_KIND_LABEL[c.kind];
    const hp = c.currentHP <= 0 ? `0/${c.maxHP} — abattu` : `${c.currentHP}/${c.maxHP} PV`;
    const conds =
      c.conditions && c.conditions.length > 0
        ? ` [${c.conditions.map((x) => x.type).join(', ')}]`
        : '';
    return `  ${cursor} ${idx + 1}. ${c.name} (${kind}, ${hp}, CA ${c.ac})${conds} — id="${c.id}"`;
  });
  const header = current
    ? `Combat actif — round ${encounter.round}, tour de ${current.name} (${COMBATANT_KIND_LABEL[current.kind]}).`
    : `Combat actif — round ${encounter.round}.`;
  return `\n${header}\nInitiative :\n${lines.filter(Boolean).join('\n')}\n`;
}

function describeWeapons(character: CharacterRow): string[] {
  const items = (character.inventory as InventoryItem[] | null) ?? [];
  const weapons = items.filter((i) => i.type === 'weapon' && i.weapon?.damageDice);
  const result: string[] = [];
  for (const w of weapons) {
    const attack = weaponAttack(character, w.weapon ?? null);
    if (!attack) continue;
    const type = attack.damageType ? ` ${attack.damageType}` : '';
    result.push(`${w.name} (att ${attack.toHit} · dmg ${attack.damage}${type})`);
  }
  return result;
}

/** Truncate text to `max` chars, preserving a trailing ellipsis hint. */
function clipText(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Best-effort char count of a ChatMessage for budget tracing. */
function contentLength(msg: ChatMessage): number {
  if (msg.role === 'tool') {
    return msg.results.reduce((n, r) => n + (r.content?.length ?? 0), 0);
  }
  return msg.content.length;
}

export function hasRollDelegation(text: string): boolean {
  if (!text || text.length < 5) return false;
  return ROLL_DELEGATION_PATTERNS.some((re) => re.test(text));
}

/**
 * Apply HP delta to whatever combatant id is given. NPC ids (`npc-…`) live
 * only in the active encounter's combatants array; PC/companion ids are
 * UUIDs against `characters` (HP also mirrored into encounter.combatants
 * when an encounter is active).
 */
async function applyDamageInSession(
  sessionId: string,
  combatantId: string,
  amount: number,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const isNpc = combatantId.startsWith('npc-');
  if (isNpc) {
    const enc = await activeEncounter(sessionId);
    if (!enc) {
      return { result: { error: 'PNJ ciblé sans rencontre active' }, events: [] };
    }
    const next = await mutateEncounter(enc.id, (e) =>
      amount >= 0
        ? applyDamageToCombatant(e, combatantId, amount)
        : healCombatant(e, combatantId, -amount),
    );
    const c = (next.combatants as Combatant[]).find((x) => x.id === combatantId);
    return {
      result: { ok: true, current_hp: c?.currentHP, max_hp: c?.maxHP },
      events: [{ type: 'combat_update' }],
    };
  }
  // PC / companion : update characters row, and mirror into encounter row
  // so the initiative panel stays in sync.
  const charResult = await applyDamageToCharacter(combatantId, amount);
  const enc = await activeEncounter(sessionId).catch(() => null);
  if (enc) {
    await mutateEncounter(enc.id, (e) =>
      amount >= 0
        ? applyDamageToCombatant(e, combatantId, amount)
        : healCombatant(e, combatantId, -amount),
    ).catch(() => {
      // Mirror failure shouldn't fail the whole roll — characters row is
      // the source of truth for PC HP outside combat.
    });
  }
  return charResult;
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

async function grantItemToCharacter(input: {
  character_id: string;
  name: string;
  qty: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
  weapon?: {
    damage_dice: string;
    damage_type?: string;
    ability?: 'str' | 'dex' | 'finesse';
    ranged?: boolean;
  };
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
  const weaponMeta = input.weapon
    ? {
        damageDice: input.weapon.damage_dice,
        damageType: input.weapon.damage_type,
        ability: input.weapon.ability,
        ranged: input.weapon.ranged,
      }
    : undefined;
  let next: InventoryItem[];
  if (existing) {
    next = items
      .map((i) =>
        i === existing ? { ...i, qty: i.qty + input.qty, weapon: weaponMeta ?? i.weapon } : i,
      )
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
        weapon: weaponMeta,
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
