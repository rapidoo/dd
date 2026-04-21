import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../db/env';
import {
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  LlmError,
  type LlmProvider,
  type ToolCallOut,
} from './types';

let client: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export function createAnthropicProvider(modelFor: (req: ChatRequest) => string): LlmProvider {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const model = modelFor(req);
      const tools = req.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
      }));
      const messages = req.messages.map(toAnthropic);
      try {
        const response = await anthropicClient().messages.create({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          tools,
          messages,
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        });
        return fromAnthropic(response);
      } catch (err) {
        throw new LlmError(
          'provider_error',
          err instanceof Error ? err.message : 'anthropic failed',
          { model },
        );
      }
    },
  };
}

function toAnthropic(m: ChatMessage): Anthropic.Messages.MessageParam {
  if (m.role === 'user') return { role: 'user', content: m.content };
  if (m.role === 'assistant') {
    const content: Anthropic.Messages.ContentBlockParam[] = [];
    if (m.content) content.push({ type: 'text', text: m.content });
    for (const c of m.toolCalls ?? []) {
      content.push({
        type: 'tool_use',
        id: c.id,
        name: c.name,
        input: (c.input ?? {}) as Record<string, unknown>,
      });
    }
    return { role: 'assistant', content };
  }
  // role === 'tool' — Anthropic expresses tool results as a user message
  // containing tool_result blocks.
  return {
    role: 'user',
    content: m.results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolUseId,
      content: r.content,
      is_error: r.isError,
    })),
  };
}

function fromAnthropic(resp: Anthropic.Messages.Message): ChatResponse {
  const textParts: string[] = [];
  const toolCalls: ToolCallOut[] = [];
  for (const block of resp.content) {
    if (block.type === 'text') textParts.push(block.text);
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return {
    text: textParts.join(''),
    toolCalls,
    stopReason:
      resp.stop_reason === 'tool_use'
        ? 'tool_use'
        : resp.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'end_turn',
  };
}
