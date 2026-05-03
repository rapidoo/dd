/**
 * Strip HTML tags emitted by the LLM, keeping only <em>/</em> which the
 * client renders as italics for NPC dialogue. Local models (gemma4) sometimes
 * generalize and wrap text in <span style="…">, <p>, <i> — those bleed into
 * the chat as raw markup because the renderer (`renderNarration`) only knows
 * about <em>.
 */
export function stripUnsafeTags(text: string): string {
  return text.replace(/<(?!\/?em\b)[^>]*>/gi, '');
}

// Names of every GM/companion tool we expose, plus retired ones (next_turn,
// end_combat) that the model may still try to write — the server ignores them
// now but we strip them from prose for cleanliness. Kept in sync with
// lib/ai/tools.ts; when adding a tool there, add it here too.
const TOOL_NAMES = [
  'request_roll',
  'recall_memory',
  'record_entity',
  'start_combat',
  'apply_damage',
  'apply_condition',
  'next_turn',
  'end_combat',
  'grant_item',
  'adjust_currency',
  'cast_spell',
  'trigger_rest',
  'prompt_companion',
] as const;

/**
 * Remove tool-call syntax that the model wrote into prose instead of emitting
 * via the structured `tool_calls` channel. gemma4 occasionally prints
 * `start_combat(npcs=[…])` or a bare `next_turn` line — it leaks into the chat
 * UI as gibberish. We strip:
 *   1. `tool_name(…balanced parens…)` anywhere in the text
 *   2. a bare `tool_name` alone on its line (no parens — gemma4 case)
 * then collapse the run of blank lines this leaves behind.
 */
export function stripToolCallSyntax(input: string): string {
  const nameAlt = TOOL_NAMES.join('|');

  let out = input;
  const openRe = new RegExp(`\\b(?:${nameAlt})\\s*\\(`, 'g');
  const ranges: Array<[number, number]> = [];
  let m: RegExpExecArray | null = openRe.exec(out);
  while (m !== null) {
    let depth = 1;
    let j = m.index + m[0].length;
    while (j < out.length && depth > 0) {
      const ch = out[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    if (depth === 0) ranges.push([m.index, j]);
    m = openRe.exec(out);
  }
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i] as [number, number];
    out = out.slice(0, start) + out.slice(end);
  }

  const bareRe = new RegExp(`(^|\\n)[ \\t]*(?:${nameAlt})[ \\t]*(?=\\n|$)`, 'g');
  out = out.replace(bareRe, (_match, p1: string) => p1 ?? '');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Compose both passes — what the GM/companion agents call before persisting. */
export function sanitizeNarration(text: string): string {
  return stripToolCallSyntax(stripUnsafeTags(text));
}

/**
 * True when the text contains tool-call syntax that `stripToolCallSyntax`
 * would remove. Used by the GM agent to detect a model that wrote a tool name
 * in prose instead of emitting a structured tool_call, so we can reprompt it.
 */
export function hasTextualToolCall(text: string): boolean {
  return stripToolCallSyntax(text) !== text;
}
