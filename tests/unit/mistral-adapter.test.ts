import type { ChatCompletionResponse } from '@mistralai/mistralai/models/components';
import { describe, expect, it } from 'vitest';
import { fromMistral, toMistralMessages } from '../../lib/ai/llm/mistral';
import type { ChatRequest } from '../../lib/ai/llm/types';

function asResp(message: unknown, finishReason = 'stop'): ChatCompletionResponse {
  return {
    id: 'r1',
    object: 'chat.completion',
    model: 'mistral-large-latest',
    created: 0,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    choices: [{ index: 0, finishReason, message }],
  } as unknown as ChatCompletionResponse;
}

describe('fromMistral', () => {
  it('parses a plain text assistant message', () => {
    const out = fromMistral(asResp({ role: 'assistant', content: 'Le feu crépite.' }));
    expect(out).toEqual({
      text: 'Le feu crépite.',
      toolCalls: [],
      stopReason: 'end_turn',
    });
  });

  it('parses a tool call with stringified JSON arguments and preserves the id', () => {
    const out = fromMistral(
      asResp(
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'abc123xyz',
              type: 'function',
              function: {
                name: 'request_roll',
                arguments: '{"kind":"check","label":"Perception","dice":"1d20+3"}',
              },
            },
          ],
        },
        'tool_calls',
      ),
    );
    expect(out.stopReason).toBe('tool_use');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toEqual({
      id: 'abc123xyz',
      name: 'request_roll',
      input: { kind: 'check', label: 'Perception', dice: '1d20+3' },
    });
  });

  it('parses a tool call with object arguments (some Mistral models)', () => {
    const out = fromMistral(
      asResp(
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              function: { name: 'apply_damage', arguments: { combatant_id: 'c1', amount: 5 } },
            },
          ],
        },
        'tool_calls',
      ),
    );
    expect(out.toolCalls[0]?.input).toEqual({ combatant_id: 'c1', amount: 5 });
  });

  it('synthesizes a 9-char id when Mistral omits one', () => {
    const out = fromMistral(
      asResp(
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ function: { name: 'next_turn', arguments: '{}' } }],
        },
        'tool_calls',
      ),
    );
    expect(out.toolCalls[0]?.id).toMatch(/^[a-z0-9]{9}$/);
  });

  it('maps finish_reason length → max_tokens', () => {
    const out = fromMistral(asResp({ role: 'assistant', content: 'tronqué' }, 'length'));
    expect(out.stopReason).toBe('max_tokens');
  });

  it('returns empty response when choices is missing', () => {
    const out = fromMistral({ choices: [] } as unknown as ChatCompletionResponse);
    expect(out).toEqual({ text: '', toolCalls: [], stopReason: 'end_turn' });
  });
});

describe('toMistralMessages', () => {
  const req = (messages: ChatRequest['messages'], system?: string): ChatRequest => ({
    role: 'gm',
    system,
    messages,
    maxTokens: 100,
  });

  it('prepends system message when provided', () => {
    const out = toMistralMessages(req([{ role: 'user', content: 'salut' }], 'tu es MJ'));
    expect(out[0]).toEqual({ role: 'system', content: 'tu es MJ' });
    expect(out[1]).toEqual({ role: 'user', content: 'salut' });
  });

  function findAssistant(msgs: ReturnType<typeof toMistralMessages>, idx: number) {
    const m = msgs[idx];
    if (!m || m.role !== 'assistant') throw new Error('expected assistant at ' + idx);
    return m;
  }
  function findTool(msgs: ReturnType<typeof toMistralMessages>, idx: number) {
    const m = msgs[idx];
    if (!m || m.role !== 'tool') throw new Error('expected tool at ' + idx);
    return m;
  }

  it('keeps assistant tool_calls and uses the same id round-trip', () => {
    const out = toMistralMessages(
      req([
        { role: 'user', content: 'attaque' },
        {
          role: 'assistant',
          content: 'Tu frappes.',
          toolCalls: [
            {
              id: 'tc_42',
              name: 'request_roll',
              input: { kind: 'attack', dice: '1d20+5', label: 'Hache' },
            },
          ],
        },
        {
          role: 'tool',
          results: [{ toolUseId: 'tc_42', content: '{"total":18,"outcome":"hit"}' }],
        },
      ]),
    );
    expect(out).toHaveLength(3);
    const assistant = findAssistant(out, 1);
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls?.[0]?.id).toBe('tc_42');
    expect(assistant.toolCalls?.[0]?.function.name).toBe('request_roll');
    expect(typeof assistant.toolCalls?.[0]?.function.arguments).toBe('string');
    const parsed = JSON.parse(assistant.toolCalls?.[0]?.function.arguments as string);
    expect(parsed).toEqual({ kind: 'attack', dice: '1d20+5', label: 'Hache' });

    const tool = findTool(out, 2);
    expect(tool.toolCallId).toBe('tc_42');
    expect(tool.content).toBe('{"total":18,"outcome":"hit"}');
  });

  it('omits toolCalls field when assistant message has none', () => {
    const out = toMistralMessages(req([{ role: 'assistant', content: 'narration only' }]));
    const assistant = findAssistant(out, 0);
    expect(assistant.toolCalls).toBeUndefined();
  });

  it('emits one tool message per tool result in a tool batch', () => {
    const out = toMistralMessages(
      req([
        {
          role: 'tool',
          results: [
            { toolUseId: 'a', content: '{"ok":1}' },
            { toolUseId: 'b', content: '{"ok":2}' },
          ],
        },
      ]),
    );
    expect(out).toHaveLength(2);
    expect(findTool(out, 0).toolCallId).toBe('a');
    expect(findTool(out, 1).toolCallId).toBe('b');
  });

  it('handles assistant messages with empty narration before tool_use', () => {
    // Mistral often emits no prose when calling a tool; the empty string
    // must still be sent so the assistant message is well-formed.
    const out = toMistralMessages(
      req([
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'x', name: 'next_turn', input: {} }],
        },
      ]),
    );
    const assistant = findAssistant(out, 0);
    expect(assistant.content).toBe('');
    expect(assistant.toolCalls?.[0]?.id).toBe('x');
  });
});
