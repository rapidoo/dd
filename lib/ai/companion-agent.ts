import type { CharacterRow, MessageRow, Universe } from '../db/types';
import type { CombatState } from '../server/combat-loop';
import type { GmEvent } from './events';
import { llm } from './llm';
import type { ChatMessage, ToolResultIn } from './llm/types';
import { sanitizeNarration } from './sanitize';
import { executePassTurn, parseToolInput, passTurnSchema } from './tool-executors';
import { COMPANION_TOOLS, type RequestRollInput } from './tools';
import { buildCompanionPrompt } from './universe';

export interface CompanionTurnResult {
  /** Final narrative text the companion produced. Persistence is owned by callers. */
  text: string;
  /** Events to forward upward (dice rolls, combat updates, …). */
  events: GmEvent[];
}

/**
 * Companion turn — runs a small tool-use loop so the companion can roll its
 * own attacks and damages just like the GM does. The caller injects
 * `executeRoll` to avoid a circular import with gm-agent.
 *
 * IMPORTANT — persistence is the caller's responsibility. This function does
 * NOT write the returned `text` to the `messages` table. Every caller must
 * pass the result through `persistCompanionMessage` (or equivalent) to record
 * the companion's reply, otherwise the message is lost from chat history and
 * the next turn's context. Current callers:
 *   - `lib/server/turn-orchestrator.ts` (combat companion turn)
 *   - `lib/server/turn-orchestrator.ts:forwardAndPersist` (GM `prompt_companion` tool)
 *   - `lib/ai/debug-mode.ts` (`/debug companion` command)
 *   - `lib/server/companion-actions.ts:promptCompanion` (server action)
 */
export async function respondAsCompanion(opts: {
  sessionId: string;
  character: CharacterRow;
  history: MessageRow[];
  hint?: string;
  combatState: CombatState | null;
  /** Renders an "Initiative …" block when an encounter is active. */
  combatBlock: string;
  /** Universe of the campaign — selects tone & vocabulary in the system prompt. */
  universe?: Universe | null;
  /** Roll executor injected by gm-agent. Same impl the GM uses. */
  executeRoll: (
    input: RequestRollInput,
    sessionId: string,
  ) => Promise<{ result: unknown; events: GmEvent[] }>;
}): Promise<CompanionTurnResult> {
  const messages: ChatMessage[] = opts.history
    .filter(
      (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
    )
    .slice(-6)
    .map<ChatMessage>((m) => ({
      role: m.author_kind === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));
  messages.push({ role: 'user', content: "C'est ton tour de réagir en tant que ce compagnon." });

  const effectiveUniverse = opts.universe ?? 'dnd5e';
  const system = buildCompanionPrompt(effectiveUniverse, {
    character: opts.character,
    hint: opts.hint ?? null,
    combatBlock: opts.combatBlock,
  });

  const events: GmEvent[] = [];
  const textParts: string[] = [];
  const MAX_ITERATIONS = 4;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Awaited<ReturnType<ReturnType<typeof llm>['chat']>>;
    try {
      response = await llm().chat({
        role: 'companion',
        system,
        messages,
        tools: COMPANION_TOOLS,
        maxTokens: 350,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[companion.chat]', err);
      break;
    }

    const fullText = sanitizeNarration(response.text.trim());
    if (fullText) textParts.push(fullText);

    if (response.stopReason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: fullText, toolCalls: response.toolCalls });
    const results: ToolResultIn[] = [];
    for (const call of response.toolCalls) {
      if (call.name === 'request_roll') {
        const result = await opts.executeRoll(call.input as RequestRollInput, opts.sessionId);
        results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
        for (const ev of result.events) events.push(ev);
      } else if (call.name === 'pass_turn') {
        const parsed = parseToolInput(passTurnSchema, call.input);
        if (!parsed.ok) {
          results.push({ toolUseId: call.id, content: JSON.stringify(parsed.result) });
        } else {
          const result = await executePassTurn(opts.sessionId);
          results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
          for (const ev of result.events) events.push(ev);
        }
      } else {
        // Unknown tool — feed an error back so the model self-corrects.
        results.push({
          toolUseId: call.id,
          content: JSON.stringify({ error: `Tool ${call.name} indisponible côté compagnon` }),
        });
      }
    }
    messages.push({ role: 'tool', results });
  }

  const text = textParts.join(' ').trim();
  if (!text) {
    return { text: '', events };
  }

  return { text, events };
}
