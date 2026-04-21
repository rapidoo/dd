import { env } from '../../db/env';
import { createAnthropicProvider } from './anthropic';
import { createOllamaProvider } from './ollama';
import type { ChatRequest, LlmProvider, LlmRole } from './types';

export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LlmProvider,
  LlmRole,
  ToolCallOut,
  ToolDef,
  ToolResultIn,
} from './types';
export { LlmError } from './types';

const ANTHROPIC_DEFAULTS: Record<LlmRole, string> = {
  builder: 'claude-haiku-4-5',
  gm: 'claude-haiku-4-5',
  companion: 'claude-haiku-4-5',
  util: 'claude-haiku-4-5',
};

const OLLAMA_DEFAULTS: Record<LlmRole, string> = {
  builder: 'gemma3:27b',
  gm: 'gemma3:12b',
  companion: 'gemma3:4b',
  util: 'gemma3:4b',
};

/** Resolve the model name for a role — env override falls back to provider default. */
export function modelFor(role: LlmRole): string {
  const provider = env.llmProvider;
  const override =
    role === 'builder'
      ? env.llmModelBuilder
      : role === 'gm'
        ? env.llmModelGm
        : role === 'companion'
          ? env.llmModelCompanion
          : env.llmModelUtil;
  if (override) return override;
  return (provider === 'ollama' ? OLLAMA_DEFAULTS : ANTHROPIC_DEFAULTS)[role];
}

let cached: LlmProvider | null = null;

/** Returns the active LLM provider, cached for the process lifetime. */
export function llm(): LlmProvider {
  if (cached) return cached;
  const resolveModel = (req: ChatRequest): string => modelFor(req.role);
  cached =
    env.llmProvider === 'ollama'
      ? createOllamaProvider(resolveModel)
      : createAnthropicProvider(resolveModel);
  return cached;
}

/** Test-only: reset the cached provider so env changes take effect. */
export function _resetLlmCacheForTests(): void {
  cached = null;
}
