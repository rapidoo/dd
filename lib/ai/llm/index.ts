import { env } from '../../db/env';
import { createAnthropicProvider } from './anthropic';
import { createMistralProvider } from './mistral';
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

// Anthropic : Opus pour la narration MJ (seul rôle où la richesse stylistique
// est visible au joueur), Haiku partout ailleurs pour garder un coût raisonnable.
const ANTHROPIC_DEFAULTS: Record<LlmRole, string> = {
  builder: 'claude-haiku-4-5',
  gm: 'claude-opus-4-7',
  companion: 'claude-haiku-4-5',
  util: 'claude-haiku-4-5',
};

// All-Gemma 4 defaults, mapped by power tier :
//   builder   → 31b (20GB) pour la création de campagne/persona
//   gm        → 26b (18GB) pour la narration en session
//   companion → 26b (18GB) pour garder la personnalité cohérente en contexte long
//   util      → e4b pour concierge/summary (throughput)
const OLLAMA_DEFAULTS: Record<LlmRole, string> = {
  builder: 'gemma4:31b',
  gm: 'gemma4:26b',
  companion: 'gemma4:26b',
  util: 'gemma4:e4b',
};

// Mistral defaults:
//   builder   → mistral-large-2407 pour la création (créativité)
//   gm        → mistral-large-2407 pour la narration MJ
//   companion → mistral-small-2402 pour les réponses courtes
//   util      → mistral-small-2402 pour concierge/summary
const MISTRAL_DEFAULTS: Record<LlmRole, string> = {
  builder: 'mistral-large-2407',
  gm: 'mistral-large-2407',
  companion: 'mistral-small-2402',
  util: 'mistral-small-2402',
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
  if (provider === 'ollama') return OLLAMA_DEFAULTS[role];
  if (provider === 'mistral') return MISTRAL_DEFAULTS[role];
  return ANTHROPIC_DEFAULTS[role];
}

let cached: LlmProvider | null = null;

/** Returns the active LLM provider, cached for the process lifetime. */
export function llm(): LlmProvider {
  if (cached) return cached;
  const resolveModel = (req: ChatRequest): string => modelFor(req.role);
  const provider = env.llmProvider;
  cached =
    provider === 'ollama'
      ? createOllamaProvider(resolveModel)
      : provider === 'mistral'
        ? createMistralProvider(resolveModel)
        : createAnthropicProvider(resolveModel);
  console.info(
    `[llm] provider=${provider}` +
      (provider === 'ollama' ? ` url=${env.ollamaBaseUrl}` : '') +
      (provider === 'mistral' ? ` url=${env.mistralBaseUrl}` : '') +
      ` builder=${modelFor('builder')} gm=${modelFor('gm')}` +
      ` companion=${modelFor('companion')} util=${modelFor('util')}`,
  );
  return cached;
}

/** Test-only: reset the cached provider so env changes take effect. */
export function _resetLlmCacheForTests(): void {
  cached = null;
}
