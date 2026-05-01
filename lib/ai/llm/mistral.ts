import type { SDKOptions } from '@mistralai/mistralai';
import { Mistral } from '@mistralai/mistralai';
import { env } from '../../db/env';
import {
  type ChatRequest,
  type ChatResponse,
  LlmError,
  type LlmProvider,
  type ToolCallOut,
} from './types';

// Mistral message types (simplified from SDK types)
interface MistralToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
type MistralMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: MistralToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string };

let client: Mistral | null = null;

function mistralClient(): Mistral {
  if (!client) {
    const options: SDKOptions = {
      apiKey: env.mistralApiKey,
    };
    if (env.mistralBaseUrl) {
      options.serverURL = env.mistralBaseUrl;
    }
    client = new Mistral(options);
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
          maxTokens: req.maxTokens,
          messages,
          tools,
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
          ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
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

function toMistralMessages(req: ChatRequest): MistralMessage[] {
  const messages: MistralMessage[] = [];
  if (req.system) {
    messages.push({ role: 'system', content: req.system });
  }
  for (const m of req.messages) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const toolCalls = m.toolCalls?.map<MistralToolCall>((c) => ({
        id: c.id,
        type: 'function',
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input ?? {}),
        },
      }));
      messages.push({
        role: 'assistant',
        content: m.content ?? '',
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      });
    } else {
      // role === 'tool' — echo back the exact id Mistral gave us in
      // fromMistral so the assistant.tool_calls[].id and tool.tool_call_id
      // line up.
      for (const r of m.results) {
        messages.push({
          role: 'tool',
          content: r.content,
          toolCallId: r.toolUseId,
        });
      }
    }
  }
  return messages;
}

function fromMistral(resp: unknown): ChatResponse {
  const response = resp as { choices: Array<{ message?: { content?: string; tool_calls?: unknown[] }; finish_reason?: string }> };
  const choices = response.choices ?? [];
  const choice = choices[0] ?? { finish_reason: 'end_turn' };
  const message = choice.message ?? {};

  const textParts: string[] = [];
  const toolCalls: ToolCallOut[] = [];

  if (typeof message.content === 'string') {
    textParts.push(message.content);
  }

  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      const toolCall = tc as { type?: string; function?: { name?: string; arguments?: unknown }; id?: string };
      if (toolCall.type === 'function' && toolCall.function) {
        let args: unknown;
        try {
          args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch {
          args = {};
        }
        if (toolCall.id) {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name ?? '',
            input: args,
          });
        }
      }
    }
  }

  const finishReason = choice.finish_reason ?? 'end_turn';
  return {
    text: textParts.join(''),
    toolCalls,
    stopReason:
      finishReason === 'tool_calls'
        ? 'tool_use'
        : finishReason === 'length' || finishReason === 'model_length'
          ? 'max_tokens'
          : 'end_turn',
  };
}
