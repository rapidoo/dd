import { env } from '../../db/env';
import {
  type ChatRequest,
  type ChatResponse,
  LlmError,
  type LlmProvider,
  type ToolCallOut,
} from './types';

/**
 * Ollama adapter. Talks to the native /api/chat endpoint with non-streaming
 * responses. Tool calls supported since Ollama v0.4; gemma4 is tool-capable.
 */
export function createOllamaProvider(modelFor: (req: ChatRequest) => string): LlmProvider {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const model = modelFor(req);
      const body = {
        model,
        stream: false,
        // gemma4:26b/:31b are reasoning models that emit ~150 hidden thinking
        // tokens before the visible answer; with our short maxTokens budgets
        // the visible reply ends up empty. Disable thinking by default — the
        // flag is silently ignored on non-thinking models.
        think: false,
        options: {
          num_predict: req.maxTokens,
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        },
        messages: toOllamaMessages(req),
        ...(req.tools && req.tools.length > 0
          ? {
              tools: req.tools.map((t) => ({
                type: 'function' as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.inputSchema,
                },
              })),
            }
          : {}),
        // Constrained decoding when the caller needs clean JSON back — gemma4
        // otherwise likes to wrap output in prose or markdown fences.
        ...(req.jsonMode ? { format: 'json' as const } : {}),
      };

      let response: Response;
      try {
        response = await fetch(`${env.ollamaBaseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new LlmError(
          'ollama_unreachable',
          `Ollama unreachable at ${env.ollamaBaseUrl} — is "ollama serve" running?`,
          { cause: err instanceof Error ? err.message : String(err) },
        );
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 404 && /model/i.test(text)) {
          throw new LlmError(
            'model_missing',
            `Model "${model}" not pulled. Run: ollama pull ${model}`,
            { model, body: text },
          );
        }
        if (/does not support tools/i.test(text)) {
          throw new LlmError(
            'model_no_tool_support',
            `Model "${model}" doesn't support tool calling under Ollama. Pick a tool-capable gemma4 tag (e4b, 26b, 31b) — set LLM_MODEL_GM accordingly.`,
            { model, body: text },
          );
        }
        throw new LlmError('provider_error', `Ollama HTTP ${response.status}: ${text}`, { model });
      }

      const data = (await response.json()) as OllamaChatResponse;
      return parseOllamaResponse(data);
    },
  };
}

interface OllamaChatResponse {
  message?: {
    role: string;
    content?: string;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: unknown };
    }>;
  };
  done?: boolean;
  done_reason?: string;
}

export function parseOllamaResponse(data: OllamaChatResponse): ChatResponse {
  const msg = data.message;
  if (!msg) {
    throw new LlmError('bad_response', 'Ollama response missing message');
  }
  const text = typeof msg.content === 'string' ? msg.content : '';
  const toolCalls: ToolCallOut[] = [];
  const rawCalls = msg.tool_calls ?? [];
  rawCalls.forEach((c, i) => {
    const name = c.function?.name;
    if (!name) return;
    const args = c.function?.arguments;
    let parsed: unknown;
    try {
      parsed = typeof args === 'string' ? JSON.parse(args) : (args ?? {});
    } catch {
      // gemma4 sometimes emits already-string arguments that aren't valid JSON.
      // Drop the call so Zod downstream produces an "invalid input" feedback.
      return;
    }
    toolCalls.push({ id: `tc_${i}_${name}`, name, input: parsed });
  });
  // Tool calls always win — when present the loop must continue. Otherwise map
  // Ollama's `done_reason` so callers can detect truncation (length) instead of
  // mistaking a cut-off response for a completed turn.
  const stopReason: ChatResponse['stopReason'] =
    toolCalls.length > 0
      ? 'tool_use'
      : data.done_reason === 'length'
        ? 'max_tokens'
        : 'end_turn';
  return { text, toolCalls, stopReason };
}

function toOllamaMessages(req: ChatRequest): OllamaMessage[] {
  const messages: OllamaMessage[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  for (const m of req.messages) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const assistant: OllamaMessage = { role: 'assistant', content: m.content };
      if (m.toolCalls && m.toolCalls.length > 0) {
        assistant.tool_calls = m.toolCalls.map((c) => ({
          function: { name: c.name, arguments: c.input as Record<string, unknown> },
        }));
      }
      messages.push(assistant);
    } else {
      // One tool message per result. Ollama keys results by tool_name (not by
      // id), so the name has to be recoverable from the toolUseId ("tc_N_name").
      for (const r of m.results) {
        const nameFromId = r.toolUseId.split('_').slice(2).join('_') || 'tool';
        messages.push({ role: 'tool', content: r.content, tool_name: nameFromId });
      }
    }
  }
  return messages;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  tool_name?: string;
}
