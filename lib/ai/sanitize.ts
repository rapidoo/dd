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

// Keys that only appear inside tool-call payloads (kind="attack", target_ac=…).
// We use them to detect orphan key:value blobs the model spilled into prose
// without a leading `tool_name(`. Two or more on the same line ⇒ tool-call leak.
const TOOL_ARG_KEYS = [
  'kind',
  'dice',
  'target_ac',
  'target_combatant_id',
  'combatant_id',
  'amount',
  'dc',
  'npcs',
  'condition',
  'character_id',
  'duration_rounds',
  'spell_level',
  'spell_name',
] as const;

/**
 * Remove tool-call syntax that the model wrote into prose instead of emitting
 * via the structured `tool_calls` channel. gemma4 occasionally prints
 * `start_combat(npcs=[…])`, a bare `next_turn` line, `request_roll{dice:…}`
 * (curly braces), or even an orphan key:value blob without the function name
 * (e.g. `dice:1d20+5,kind:attack,target_combatant_id:npc-…}`).
 *
 * We strip, in order:
 *   1. `tool_name(…balanced parens…)` or `tool_name{…balanced braces…}`
 *   2. a bare `tool_name` alone on its line (no opener — gemma4 case)
 *   3. any line that holds two or more recognized tool-arg keys (kind:, dice:,
 *      target_combatant_id:, …) — catches truncated/malformed tool calls
 * then collapse the run of blank lines this leaves behind.
 */
export function stripToolCallSyntax(input: string): string {
  const nameAlt = TOOL_NAMES.join('|');

  let out = input;
  // Match either `tool_name(` or `tool_name{`, then walk forward tracking
  // depth on the matching closer. Handles both forms in a single pass.
  const openRe = new RegExp(`\\b(?:${nameAlt})\\s*[({]`, 'g');
  const ranges: Array<[number, number]> = [];
  let m: RegExpExecArray | null = openRe.exec(out);
  while (m !== null) {
    const opener = out[m.index + m[0].length - 1];
    const closer = opener === '(' ? ')' : '}';
    let depth = 1;
    let j = m.index + m[0].length;
    while (j < out.length && depth > 0) {
      const ch = out[j];
      if (ch === opener) depth++;
      else if (ch === closer) depth--;
      j++;
    }
    if (depth === 0) {
      ranges.push([m.index, j]);
    } else {
      // Unbalanced (model truncated mid-args): strip to end of line so the
      // partial blob doesn't leak into the chat.
      const eol = out.indexOf('\n', m.index);
      ranges.push([m.index, eol === -1 ? out.length : eol]);
    }
    m = openRe.exec(out);
  }
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i] as [number, number];
    out = out.slice(0, start) + out.slice(end);
  }

  const bareRe = new RegExp(`(^|\\n)[ \\t]*(?:${nameAlt})[ \\t]*(?=\\n|$)`, 'g');
  out = out.replace(bareRe, (_match, p1: string) => p1 ?? '');

  // JSON blob filter. Catches model output like
  //   {"kind": "attack", "label": "…", "target_combatant_id": "npc-…"}
  // dumped in prose. We strip any `{…}` block (no nested braces) that holds a
  // quoted tool-arg key. Quoted keys are the unambiguous signal that this is a
  // tool call payload, not natural French prose.
  const jsonBlobRe = new RegExp(
    `\\{[^{}]*["'](?:${TOOL_ARG_KEYS.join('|')})["']\\s*:[^{}]*\\}`,
    'g',
  );
  out = out.replace(jsonBlobRe, '');

  // Orphan KV-line filter. Catches the unquoted form (gemma4 case):
  //   1d20+5,kind:attack,target_combatant_id:npc-…
  // A line containing two or more tool-arg keys (with optional surrounding
  // quotes) is almost certainly a stripped or never-prefixed tool call — drop
  // the whole line. Threshold of 2 avoids false positives on legitimate prose
  // like "label: une porte".
  const argKeyRe = new RegExp(`["']?\\b(?:${TOOL_ARG_KEYS.join('|')})\\b["']?\\s*:`, 'g');
  out = out
    .split(/\r?\n/)
    .filter((line) => {
      const matches = line.match(argKeyRe);
      return !matches || matches.length < 2;
    })
    .join('\n');

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
