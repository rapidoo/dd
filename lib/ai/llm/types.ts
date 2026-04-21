/**
 * Provider-agnostic LLM interface. Both the Anthropic and Ollama adapters
 * implement LlmProvider; callers (gm-agent, concierge, …) only see this
 * shape and never import the underlying SDK.
 */

export type LlmRole = 'builder' | 'gm' | 'companion' | 'util';

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema, must be type: 'object'. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCallOut {
  /** Unique id produced by the adapter; echoed back in ToolResultIn.toolUseId. */
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultIn {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallOut[] }
  | { role: 'tool'; results: ToolResultIn[] };

export interface ChatRequest {
  role: LlmRole;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens: number;
  /** Optional temperature passthrough; providers pick a sensible default. */
  temperature?: number;
  /**
   * Request valid-JSON output. Ollama enforces via `format: 'json'` (constrained
   * decoding); Anthropic has no native equivalent so callers should still
   * instruct the model in the prompt — but the flag is honored where possible.
   */
  jsonMode?: boolean;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCallOut[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
}

export interface LlmProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

/**
 * Typed error surface so callers can render actionable hints (model missing,
 * Ollama unreachable, …) without guessing at provider-specific shapes.
 */
export class LlmError extends Error {
  constructor(
    public readonly code:
      | 'ollama_unreachable'
      | 'model_missing'
      | 'bad_response'
      | 'provider_error',
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
