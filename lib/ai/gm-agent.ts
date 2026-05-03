import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow, Universe } from '../db/types';
import {
  type EntityKind,
  listEntitiesForCampaign,
  searchEntities,
  upsertEntityNode,
} from '../neo4j/queries';
import { CONDITION_TYPES, type ConditionType } from '../rules/types';
import { weaponAttack } from '../rules/weapon-attack';
import {
  advanceUntilNextActor,
  applyDamageToParticipant,
  type CombatState,
  getActiveCombatState,
  type Participant,
  startEncounter,
} from '../server/combat-loop';
import type { InventoryItem } from '../server/inventory-actions';
import { respondAsCompanion } from './companion-agent';
import type { DiceRollRecord, GmEvent } from './events';
import { llm } from './llm';
import type { ChatMessage, ToolCallOut, ToolResultIn } from './llm/types';
import { compactHistory } from './rolling-summary';
import { hasTextualToolCall, sanitizeNarration } from './sanitize';
import { campaignIdOfSession, characterInSession, combatantBelongsToSession } from './tenant-guard';
import {
  applyConditionSchema,
  executeApplyCondition,
  executePassTurn,
  executeRoll,
  nextActorInfo,
  parseToolInput,
  passTurnSchema,
  rollSchema,
} from './tool-executors';
import { GM_TOOLS, type RecordEntityInput, type RequestRollInput } from './tools';
import { getGmPrompt, getUniverseConfig } from './universe';

// Re-export types for backwards compatibility while the rename is in progress.
export type { DiceRollRecord, GmEvent };
export { executeRoll };

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
  const combatState = await getActiveCombatState(input.sessionId).catch((err) => {
    if (process.env.NODE_ENV !== 'production') console.warn('[combat.getActiveCombatState]', err);
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
    combatState,
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
        if (fullText) {
          const cleaned = sanitizeNarration(fullText);
          if (cleaned) yield { type: 'text_delta', delta: cleaned };
        }
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

    // Textual tool-call safeguard. Local models (gemma4) sometimes write
    // `start_combat(npcs=[...])`, `request_roll{...}`, or a JSON blob in the
    // narration instead of emitting a structured tool_call. The combat would
    // never actually start. Detect, reprompt, and retry up to MAX_REPROMPT.
    if (response.toolCalls.length === 0 && hasTextualToolCall(fullText)) {
      if (repromptRetries < MAX_REPROMPT_RETRIES) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[gm] textual tool-call detected — reprompting');
        }
        repromptRetries++;
        toolIterations--;
        messages.push({
          role: 'assistant',
          content: "(tour rejeté : outil écrit en texte au lieu d'un tool_call)",
        });
        messages.push({
          role: 'user',
          content:
            'Tu as écrit le nom d\'un outil dans la narration (ex: "start_combat(...)" ou "next_turn"). C\'est interdit — le joueur le voit en clair et le serveur n\'exécute rien. Reprends ce tour : invoque l\'outil via le canal tool_calls structuré, et laisse la narration en texte naturel uniquement.',
        });
        continue;
      }
      // Retries exhausted on a stubborn model. Don't let the combat stall:
      // sanitize whatever prose we have, advance the cursor so the next
      // combatant gets a chance, and close the turn cleanly.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[gm] textual tool-call retries exhausted — advancing combat cursor');
      }
      const cleaned = sanitizeNarration(fullText);
      if (cleaned) yield { type: 'text_delta', delta: cleaned };
      try {
        const adv = await advanceUntilNextActor(input.sessionId);
        if (adv.state) yield { type: 'combat_state', state: adv.state };
        if (adv.ended) yield { type: 'combat_ended' };
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[gm.advance] fallback advance failed', err);
        }
      }
      yield { type: 'done' };
      return;
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

    if (fullText) {
      const cleaned = sanitizeNarration(fullText);
      if (cleaned) yield { type: 'text_delta', delta: cleaned };
    }

    if (response.stopReason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    messages.push({ role: 'assistant', content: fullText, toolCalls: response.toolCalls });
    const results: ToolResultIn[] = [];
    for (const call of response.toolCalls) {
      const result = await executeTool(call, input.sessionId, input.universe ?? null);
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

// --- Narrator-only tool schemas --------------------------------------------
// Shared schemas (rollSchema, applyConditionSchema, passTurnSchema) live in
// tool-executors.ts and are imported above.

const ENTITY_KINDS = ['npc', 'location', 'faction', 'item', 'quest', 'event'] as const;
const ITEM_TYPES = ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc'] as const;

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

async function executeTool(
  block: ToolCallOut,
  sessionId: string,
  universe: Universe | null,
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
      return executeCompanion(input, sessionId, universe);
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
      const initial = await startEncounter({
        sessionId,
        npcs: input.npcs.map((n) => ({
          name: n.name,
          ac: n.ac,
          hp: n.hp,
          dexMod: n.dex_mod,
        })),
        characters: (characters ?? []) as CharacterRow[],
      });
      // Server-authoritative loop: immediately advance to the first acting
      // combatant (skipping any KO at the head, which shouldn't happen on
      // start but defensive-by-default).
      const advanced = await advanceFromStart(sessionId, initial);
      return {
        result: {
          combat_id: advanced.state?.combatId ?? initial.combatId,
          round: advanced.state?.round ?? initial.round,
          current_actor: currentActorId(advanced.state ?? initial),
          ended: advanced.ended,
        },
        events: [
          { type: 'combat_started', combatId: initial.combatId },
          { type: 'combat_state', state: advanced.state ?? initial },
          ...(advanced.ended ? ([{ type: 'combat_ended' }] as GmEvent[]) : []),
        ],
      };
    }
    case 'apply_damage': {
      const p = parseToolInput(applyDamageSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await combatantBelongsToSession(sessionId, input.combatant_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      const dmg = await applyDamageToParticipant(sessionId, input.combatant_id, input.amount);
      if (!dmg.ok) return { result: { error: dmg.error }, events: [] };
      const events: GmEvent[] = [];
      if (dmg.state) events.push({ type: 'combat_state', state: dmg.state });
      // After NPC damage, give the cursor a chance to advance (skip dead, auto-end).
      let lastState: CombatState | null = dmg.state ?? null;
      const targetEntry = dmg.state?.participants.find((p) => p.id === input.combatant_id);
      if (targetEntry?.kind === 'npc' && targetEntry.currentHP <= 0) {
        const adv = await advanceUntilNextActor(sessionId);
        if (adv.state) {
          events.push({ type: 'combat_state', state: adv.state });
          lastState = adv.state;
        }
        if (adv.ended) events.push({ type: 'combat_ended' });
      }
      return {
        result: {
          ok: true,
          current_hp: dmg.currentHP,
          max_hp: dmg.maxHP,
          next_actor: nextActorInfo(lastState),
        },
        events,
      };
    }
    case 'apply_condition': {
      const p = parseToolInput(applyConditionSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executeApplyCondition(sessionId, {
        ...p.data,
        condition: p.data.condition as ConditionType,
      });
    }
    case 'pass_turn': {
      const p = parseToolInput(passTurnSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executePassTurn(sessionId);
    }
    default:
      return { result: { error: `Unknown tool: ${block.name}` }, events: [] };
  }
}

function currentActorId(state: CombatState): string | null {
  const actor = state.participants.find((p) => p.isCurrent);
  return actor?.id ?? null;
}

async function advanceFromStart(
  sessionId: string,
  initial: CombatState,
): Promise<{ ended: boolean; state: CombatState | null }> {
  // If the very first slot is already KO (shouldn't happen but stay defensive),
  // walk forward. Otherwise the initial state is fine and no advance is needed.
  const firstActor = initial.participants[initial.currentTurnIndex];
  if (firstActor && firstActor.currentHP > 0) {
    return { ended: false, state: initial };
  }
  return await advanceUntilNextActor(sessionId);
}

function buildSystemPrompt(
  player: CharacterRow | null,
  companions: CharacterRow[],
  worldSummary?: string | null,
  rollingSummary?: string | null,
  knownEntities?: Array<{ name: string; kind: string; short_description: string | null }>,
  universe?: Universe,
  combatState?: CombatState | null,
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
  const combatBlock = renderCombatBlock(combatState ?? null);

  // Build universe-specific system prompt from centralized config
  const basePrompt = getGmPrompt(effectiveUniverse);

  return `${basePrompt}
${worldBlock}${rollingBlock}${memoryBlock}${combatBlock}
Équipe actuelle :
${partyLines.join('\n')}

Quand un compagnon est présent, pense à lui laisser la parole régulièrement via prompt_companion — décris une scène, puis passe-lui le micro (indique character_id et éventuellement un hint).`;
}



async function executeCompanion(
  input: { character_id: string; hint?: string },
  sessionId: string,
  universe: Universe | null,
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
  const compState = await getActiveCombatState(sessionId).catch(() => null);
  const combatBlock = renderCombatBlock(compState);
  const turn = await respondAsCompanion({
    sessionId,
    character,
    history: history ?? [],
    hint: input.hint,
    combatState: compState,
    combatBlock,
    universe,
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

const PARTICIPANT_KIND_LABEL: Record<Participant['kind'], string> = {
  pc: 'PJ',
  companion: 'compagnon',
  npc: 'PNJ',
};

/**
 * Render the active combat as a compact block for the GM (and companion)
 * system prompt. Without this block the model has no idea who's in
 * initiative, whose turn it is, or what target ids to pass to request_roll.
 */
export function renderCombatBlock(state: CombatState | null): string {
  if (!state || state.endedAt) return '';
  const ps = state.participants;
  if (ps.length === 0) return '';
  const current = ps.find((p) => p.isCurrent);
  const lines = ps.map((p, idx) => {
    const cursor = p.isCurrent ? '▶' : ' ';
    const kind = PARTICIPANT_KIND_LABEL[p.kind];
    const hp = p.currentHP <= 0 ? `0/${p.maxHP} — abattu` : `${p.currentHP}/${p.maxHP} PV`;
    const conds =
      p.conditions && p.conditions.length > 0
        ? ` [${p.conditions.map((x) => x.type).join(', ')}]`
        : '';
    return `  ${cursor} ${idx + 1}. ${p.name} (${kind}, ${hp}, CA ${p.ac})${conds} — id="${p.id}"`;
  });
  const header = current
    ? `Combat actif — round ${state.round}, tour de ${current.name} (${PARTICIPANT_KIND_LABEL[current.kind]}).`
    : `Combat actif — round ${state.round}.`;
  return `\n${header}\nInitiative :\n${lines.join('\n')}\n`;
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
    events: [{ type: 'party_update' }],
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
    events: [{ type: 'party_update' }],
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
    events: [{ type: 'party_update' }],
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
      events: [{ type: 'party_update' }],
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
    events: [{ type: 'party_update' }],
  };
}
