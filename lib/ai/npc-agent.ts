import type { MessageRow, Universe } from '../db/types';
import type { ConditionType } from '../rules/types';
import type { CombatState, Participant } from '../server/combat-loop';
import type { GmEvent } from './events';
import { llm } from './llm';
import type { ChatMessage, ToolResultIn } from './llm/types';
import { hasTextualToolCall, sanitizeNarration } from './sanitize';
import {
  applyConditionSchema,
  executeApplyCondition,
  executePassTurn,
  executeRoll,
  parseToolInput,
  passTurnSchema,
  rollSchema,
} from './tool-executors';
import { NPC_TOOLS, type RequestRollInput } from './tools';
import { buildNpcPrompt } from './universe';

/**
 * NPC turn agent — runs one tool-use loop scoped to a single NPC's turn in
 * combat. Reasoning : choose a target among the living enemies, narrate
 * 1-2 phrases, then resolve the attack/effect via request_roll. The server
 * advances the cursor automatically; the agent never controls turn order.
 */

export interface NpcTurnInput {
  sessionId: string;
  npc: Participant; // the participant entry whose isCurrent === true
  combatState: CombatState;
  history: MessageRow[];
  universe: Universe;
}

export interface NpcTurnEvent {
  type: 'text_delta' | 'gm';
  // We yield through GmEvent for compatibility — the orchestrator forwards
  // these straight through.
}

/**
 * Run a single NPC turn. Yields GmEvents (text_delta, dice_request,
 * combat_state, etc.). Returns when the model stops emitting tool_calls or
 * MAX_ITERATIONS is reached.
 */
export async function* runNpcTurn(input: NpcTurnInput): AsyncGenerator<GmEvent> {
  const enemies = input.combatState.participants.filter(
    (p) => p.id !== input.npc.id && p.kind !== 'npc' && p.currentHP > 0,
  );
  const allies = input.combatState.participants.filter(
    (p) => p.id !== input.npc.id && p.kind === 'npc' && p.currentHP > 0,
  );

  // No valid target → pass directly.
  if (enemies.length === 0) {
    const result = await executePassTurn(input.sessionId);
    for (const ev of result.events) yield ev;
    yield { type: 'done' };
    return;
  }

  const system = buildNpcPrompt(input.universe, { npc: input.npc, enemies, allies });

  // Ultra-short context: just the last 4 messages so the NPC has a sense of
  // what just happened, without overwhelming a Haiku-tier model.
  const tail = input.history
    .filter(
      (m) => m.author_kind === 'gm' || m.author_kind === 'character' || m.author_kind === 'user',
    )
    .slice(-4)
    .map<ChatMessage>((m) => ({
      role: m.author_kind === 'user' ? 'user' : 'assistant',
      content: m.content.slice(0, 800),
    }));
  const messages: ChatMessage[] = [
    ...tail,
    { role: 'user', content: `C'est le tour de ${input.npc.name}. Joue son action maintenant.` },
  ];

  const MAX_ITERATIONS = 4;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Awaited<ReturnType<ReturnType<typeof llm>['chat']>>;
    try {
      response = await llm().chat({
        role: 'companion', // Haiku tier — same model class as companions
        system,
        messages,
        tools: NPC_TOOLS,
        maxTokens: 300,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[npc.chat]', err);
      // Fallback : pass turn so combat doesn't stall.
      const result = await executePassTurn(input.sessionId);
      for (const ev of result.events) yield ev;
      break;
    }

    const fullText = response.text.trim();

    // Textual tool-call leak → pass turn rather than infinite reprompt
    // (NPC turn must stay snappy).
    if (response.toolCalls.length === 0 && hasTextualToolCall(fullText)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[npc] textual tool-call leak — passing turn');
      }
      const cleaned = sanitizeNarration(fullText);
      if (cleaned) yield { type: 'text_delta', delta: cleaned };
      const result = await executePassTurn(input.sessionId);
      for (const ev of result.events) yield ev;
      break;
    }

    if (fullText) {
      const cleaned = sanitizeNarration(fullText);
      if (cleaned) yield { type: 'text_delta', delta: cleaned };
    }

    if (response.stopReason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: fullText, toolCalls: response.toolCalls });
    const results: ToolResultIn[] = [];
    for (const call of response.toolCalls) {
      if (call.name === 'request_roll') {
        const p = parseToolInput(rollSchema, call.input);
        if (!p.ok) {
          results.push({ toolUseId: call.id, content: JSON.stringify(p.result) });
          continue;
        }
        const result = await executeRoll(p.data as RequestRollInput, input.sessionId);
        results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
        for (const ev of result.events) yield ev;
      } else if (call.name === 'apply_condition') {
        const p = parseToolInput(applyConditionSchema, call.input);
        if (!p.ok) {
          results.push({ toolUseId: call.id, content: JSON.stringify(p.result) });
          continue;
        }
        const result = await executeApplyCondition(input.sessionId, {
          ...p.data,
          condition: p.data.condition as ConditionType,
        });
        results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
        for (const ev of result.events) yield ev;
      } else if (call.name === 'pass_turn') {
        const p = parseToolInput(passTurnSchema, call.input);
        if (!p.ok) {
          results.push({ toolUseId: call.id, content: JSON.stringify(p.result) });
          continue;
        }
        const result = await executePassTurn(input.sessionId);
        results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
        for (const ev of result.events) yield ev;
      } else {
        results.push({
          toolUseId: call.id,
          content: JSON.stringify({ error: `Tool ${call.name} indisponible côté PNJ` }),
        });
      }
    }
    messages.push({ role: 'tool', results });
  }
}
