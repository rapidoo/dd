import { describe, expect, it } from 'vitest';
import { extractJson } from '../../lib/ai/concierge';

describe('extractJson', () => {
  it('returns raw JSON unchanged', () => {
    expect(extractJson('{"a":1,"b":"x"}')).toBe('{"a":1,"b":"x"}');
  });

  it('strips markdown code fences', () => {
    expect(extractJson('```json\n{"entities":[]}\n```')).toBe('{"entities":[]}');
    expect(extractJson('```\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('extracts a JSON object from preamble text', () => {
    const text = 'Here is the JSON:\n{"entities":[],"loot":[]}\n';
    expect(extractJson(text)).toBe('{"entities":[],"loot":[]}');
  });

  it('handles trailing prose after the JSON object', () => {
    const text = '{"a":1}\nHope this helps!';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it('handles nested objects correctly via brace counting', () => {
    const text = 'Preamble {"outer":{"inner":{"deep":true}}} suffix';
    expect(extractJson(text)).toBe('{"outer":{"inner":{"deep":true}}}');
  });

  it('ignores braces inside strings', () => {
    const text = '{"message":"has { and } inside","ok":true}';
    expect(extractJson(text)).toBe(text);
  });

  it('handles escaped quotes inside strings', () => {
    const text = '{"quote":"She said \\"hi\\"","n":1}';
    expect(extractJson(text)).toBe(text);
  });

  it('returns empty string when no object found', () => {
    expect(extractJson('no json here at all')).toBe('');
    expect(extractJson('')).toBe('');
  });

  it('returns empty string for unclosed object', () => {
    expect(extractJson('{"a":1, "broken":')).toBe('');
  });
});
