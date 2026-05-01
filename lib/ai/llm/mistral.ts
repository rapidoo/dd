import { Mistral } from '@mistralai/mistralai';
import type {
  AssistantMessage,
  ChatCompletionResponse,
  SystemMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '@mistralai/mistralai/models/components';
import { env } from '../../db/env';
import {
  type ChatRequest,
  type ChatResponse,
  LlmError,
  type LlmProvider,
  type ToolCallOut,
} from './types';

/**
 * Provider adapter for Mistral's Chat Completions API.
 *
 * Round-trip integrity is the whole game here: every tool_call we surface to
 * gm-agent (in `fromMistral`) must come back in `toMistralMessages` paired
 * with the EXACT same id on (a) the assistant message that produced the call
 * and (b) the tool message carrying the result. Mistral rejects (silently,
 * by producing degenerate output) any conversation where those ids don't
 * line up — that was the whole reason the GM stopped narrating in combat.
 */

// SDK's discriminated union for messages array. The SDK marks `role` as
// optional on each leaf type but the union itself requires it, so we
// declare typed helpers below.
type MistralRequestMessage =
  | (SystemMessage & { role: 'system' })
  | (UserMessage & { role: 'user' })
  | (AssistantMessage & { role: 'assistant' })
  | (ToolMessage & { role: 'tool' });

let client: Mistral | null = null;
function mistralClient(): Mistral {
  if (!client) {
    const baseUrl = env.mistralBaseUrl;
    client = new Mistral({
      apiKey: env.mistralApiKey,
      ...(baseUrl ? { serverURL: baseUrl } : {}),
    });
  }
  return client;
}

export function createMistralProvider(modelFor: (req: ChatRequest) => string): LlmProvider {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const model = modelFor(req);
      const messages = toMistralMessages(req);
      const tools = req.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as Record<string, unknown>,
        },
      }));

      try {
        const response = await mistralClient().chat.complete({
          model,
          messages,
          ...(tools && tools.length > 0 ? { tools } : {}),
          ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.jsonMode ? { responseFormat: { type: 'json_object' as const } } : {}),
        });
        return fromMistral(response);
      } catch (err) {
        throw new LlmError(
          'provider_error',
          err instanceof Error ? err.message : 'Mistral API failed',
          { model },
        );
      }
    },
  };
}

export function toMistralMessages(req: ChatRequest): MistralRequestMessage[] {
  const out: MistralRequestMessage[] = [];

  if (req.system) {
    out.push({ role: 'system', content: req.system });
  }

  for (const m of req.messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }

    if (m.role === 'assistant') {
      const toolCalls: ToolCall[] | undefined = m.toolCalls?.map((c) => ({
        id: c.id,
        type: 'function',
        function: {
          name: c.name,
          // Mistral's API accepts arguments as either a JSON object or a
          // JSON string. We pass a string because that's the OpenAI/Mistral
          // convention and round-trips cleanly with what the SDK returns.
          arguments: JSON.stringify(c.input ?? {}),
        },
      }));
      out.push({
        role: 'assistant',
        content: m.content ?? '',
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      });
      continue;
    }

    // role === 'tool' — Mistral expects each tool result as its own
    // top-level message. The toolCallId MUST exactly match the id we
    // attached to the corresponding assistant.toolCalls[] entry above.
    for (const r of m.results) {
      out.push({
        role: 'tool',
        content: r.content,
        toolCallId: r.toolUseId,
      });
    }
  }

  return out;
}

export function fromMistral(resp: ChatCompletionResponse): ChatResponse {
  const choice = resp.choices?.[0];
  if (!choice) {
    return { text: '', toolCalls: [], stopReason: 'end_turn' };
  }
  const message = choice.message;

  let text = '';
  if (typeof message.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    // Some models stream content as ContentChunk[]; concat the text parts.
    text = message.content
      .map((c) => (typeof c === 'string' ? c : 'text' in c ? c.text : ''))
      .join('');
  }

  const toolCalls: ToolCallOut[] = [];
  for (const tc of message.toolCalls ?? []) {
    if (!tc.function) continue;
    let input: unknown;
    try {
      input =
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments || '{}')
          : (tc.function.arguments ?? {});
    } catch {
      input = {};
    }
    toolCalls.push({
      // Synthesize a stable id only if Mistral omitted one — required so
      // we can round-trip it on the next request.
      id: tc.id ?? synthesizeToolCallId(),
      name: tc.function.name ?? '',
      input,
    });
  }

  const finish = choice.finishReason;
  const stopReason: ChatResponse['stopReason'] =
    finish === 'tool_calls'
      ? 'tool_use'
      : finish === 'length' || finish === 'model_length'
        ? 'max_tokens'
        : finish === 'error'
          ? 'error'
          : 'end_turn';

  return { text, toolCalls, stopReason };
}

/**
 * Mistral's legacy tool_call_id format is 9 alphanumeric characters. Newer
 * models tolerate longer ids, but the safe fallback is to stay within that
 * shape so the same adapter works across the model lineup.
 */
function synthesizeToolCallId(): string {
  return Math.random().toString(36).slice(2, 11).padEnd(9, '0').slice(0, 9);
}
