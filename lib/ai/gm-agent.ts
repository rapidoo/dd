import type { CharacterRow, MessageRow, Universe } from '../db/types';
import { listEntitiesForCampaign } from '../neo4j/queries';
import { advanceUntilNextActor, getActiveCombatState } from '../server/combat-loop';
import type { DiceRollRecord, GmEvent } from './events';
import {
  buildGmSystemPrompt,
  clipText,
  contentLength,
  hasRollDelegation,
  renderCombatBlock,
} from './gm-prompt';
import { executeGmTool } from './gm-tools';
import { llm } from './llm';
import type { ChatMessage, ToolResultIn } from './llm/types';
import { compactHistory } from './rolling-summary';
import { hasTextualToolCall, sanitizeNarration } from './sanitize';
import { campaignIdOfSession } from './tenant-guard';
import { executeRoll } from './tool-executors';
import { GM_TOOLS } from './tools';

// Re-export types for backwards compatibility while the rename is in progress.
export type { DiceRollRecord, GmEvent };
export { executeRoll, hasRollDelegation, renderCombatBlock };

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

  const systemPrompt = buildGmSystemPrompt(
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
      const result = await executeGmTool(call, {
        sessionId: input.sessionId,
        universe: input.universe ?? null,
        history: input.history,
        renderCombatBlock,
      });
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
