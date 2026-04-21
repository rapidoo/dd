import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOllamaProvider, parseOllamaResponse } from '../../lib/ai/llm/ollama';
import type { ChatRequest } from '../../lib/ai/llm/types';

describe('parseOllamaResponse', () => {
  it('parses a plain text assistant message', () => {
    const out = parseOllamaResponse({
      message: { role: 'assistant', content: 'La bougie crépite.' },
    });
    expect(out).toEqual({
      text: 'La bougie crépite.',
      toolCalls: [],
      stopReason: 'end_turn',
    });
  });

  it('parses a tool call with object arguments', () => {
    const out = parseOllamaResponse({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'request_roll',
              arguments: { kind: 'check', label: 'Perception', dice: '1d20+3' },
            },
          },
        ],
      },
    });
    expect(out.stopReason).toBe('tool_use');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      name: 'request_roll',
      input: { kind: 'check', label: 'Perception', dice: '1d20+3' },
    });
    expect(out.toolCalls[0]?.id).toBe('tc_0_request_roll');
  });

  it('parses a tool call with string (JSON-encoded) arguments (Gemma case)', () => {
    const out = parseOllamaResponse({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'apply_damage',
              arguments: '{"combatant_id":"c1","amount":5}',
            },
          },
        ],
      },
    });
    expect(out.stopReason).toBe('tool_use');
    expect(out.toolCalls[0]?.input).toEqual({ combatant_id: 'c1', amount: 5 });
  });

  it('drops malformed tool-call arguments so Zod can reject downstream', () => {
    const out = parseOllamaResponse({
      message: {
        role: 'assistant',
        content: 'narration',
        tool_calls: [
          {
            function: { name: 'anything', arguments: 'not json {{{' },
          },
        ],
      },
    });
    expect(out.stopReason).toBe('end_turn');
    expect(out.toolCalls).toHaveLength(0);
    expect(out.text).toBe('narration');
  });

  it('assigns stable ids when several tools are called in one turn', () => {
    const out = parseOllamaResponse({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { name: 'grant_item', arguments: {} } },
          { function: { name: 'adjust_currency', arguments: {} } },
        ],
      },
    });
    expect(out.toolCalls.map((c) => c.id)).toEqual(['tc_0_grant_item', 'tc_1_adjust_currency']);
  });

  it('throws on a missing message block', () => {
    expect(() => parseOllamaResponse({} as never)).toThrow(/bad_response|message/i);
  });
});

describe('createOllamaProvider — fetch wiring', () => {
  const capture: { url?: string; body?: Record<string, unknown> } = {};
  const originalFetch = global.fetch;

  beforeEach(() => {
    capture.url = undefined;
    capture.body = undefined;
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /api/chat with OpenAI-style tool schema + system message', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capture.url = String(url);
      capture.body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'ok' },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const provider = createOllamaProvider(() => 'gemma3:4b');
    const req: ChatRequest = {
      role: 'gm',
      system: 'You are the GM.',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [
        {
          name: 'ping',
          description: 'ping the server',
          inputSchema: { type: 'object', properties: { n: { type: 'number' } } },
        },
      ],
      maxTokens: 100,
    };
    await provider.chat(req);

    expect(capture.url).toBe('http://localhost:11434/api/chat');
    expect(capture.body).toMatchObject({
      model: 'gemma3:4b',
      stream: false,
      options: { num_predict: 100 },
    });
    const bodyMessages = capture.body?.messages as Array<Record<string, unknown>>;
    expect(bodyMessages[0]).toEqual({ role: 'system', content: 'You are the GM.' });
    expect(bodyMessages[1]).toEqual({ role: 'user', content: 'Hello' });
    const bodyTools = capture.body?.tools as Array<Record<string, unknown>>;
    expect(bodyTools[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'ping',
        description: 'ping the server',
        parameters: { type: 'object', properties: { n: { type: 'number' } } },
      },
    });
  });

  it('translates a tool-result message into one Ollama tool message per result', async () => {
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capture.body = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ message: { role: 'assistant', content: 'done' } }), {
        status: 200,
      });
    }) as typeof fetch;

    const provider = createOllamaProvider(() => 'gemma3:4b');
    await provider.chat({
      role: 'gm',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tc_0_request_roll', name: 'request_roll', input: { dice: '1d20' } }],
        },
        {
          role: 'tool',
          results: [{ toolUseId: 'tc_0_request_roll', content: '{"total":17}' }],
        },
      ],
      maxTokens: 50,
    });

    const bodyMessages = capture.body?.messages as Array<Record<string, unknown>>;
    const toolMsg = bodyMessages.find((m) => m.role === 'tool');
    expect(toolMsg).toMatchObject({
      role: 'tool',
      content: '{"total":17}',
      tool_name: 'request_roll',
    });
  });

  it('maps HTTP 404 with "model not found" to LlmError("model_missing")', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "model 'gemma3:99b' not found" }), {
          status: 404,
        }),
    ) as typeof fetch;
    const provider = createOllamaProvider(() => 'gemma3:99b');
    await expect(
      provider.chat({ role: 'gm', messages: [{ role: 'user', content: 'x' }], maxTokens: 10 }),
    ).rejects.toMatchObject({ code: 'model_missing' });
  });

  it('maps network errors to LlmError("ollama_unreachable")', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const provider = createOllamaProvider(() => 'gemma3:4b');
    await expect(
      provider.chat({ role: 'gm', messages: [{ role: 'user', content: 'x' }], maxTokens: 10 }),
    ).rejects.toMatchObject({ code: 'ollama_unreachable' });
  });
});
