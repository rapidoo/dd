import { describe, expect, it } from 'vitest';
import {
  hasTextualToolCall,
  sanitizeNarration,
  stripToolCallSyntax,
  stripUnsafeTags,
} from '../../lib/ai/sanitize';

describe('stripUnsafeTags', () => {
  it('keeps <em> tags untouched', () => {
    expect(stripUnsafeTags('Le PNJ dit <em>bonjour</em> en souriant.')).toBe(
      'Le PNJ dit <em>bonjour</em> en souriant.',
    );
  });

  it('strips <span style="…"> wrappers (gemma4 case)', () => {
    expect(stripUnsafeTags('<span style="color:gray">Le groupe se tourne vers vous.</span>')).toBe(
      'Le groupe se tourne vers vous.',
    );
  });

  it('strips other HTML tags but preserves their text content', () => {
    expect(stripUnsafeTags('<p>Ligne 1</p><br/><strong>important</strong>')).toBe(
      'Ligne 1important',
    );
  });

  it('handles mixed allowed and disallowed tags', () => {
    expect(stripUnsafeTags('<p>Avant. <em>Salut.</em> <i>après</i></p>')).toBe(
      'Avant. <em>Salut.</em> après',
    );
  });

  it('strips uppercase variants', () => {
    expect(stripUnsafeTags('<DIV>x</DIV><EM>y</EM>')).toBe('x<EM>y</EM>');
  });

  it('leaves text without tags untouched', () => {
    expect(stripUnsafeTags('Pas de balise ici.')).toBe('Pas de balise ici.');
  });

  it('handles tags with attributes', () => {
    expect(stripUnsafeTags('<a href="evil">click</a>')).toBe('click');
  });
});

describe('stripToolCallSyntax', () => {
  it('removes a tool call with nested braces/brackets', () => {
    const input =
      'Le combat commence !\n\nstart_combat(npcs=[{ac:13,dex_mod:1,hp:15,name="Gobelin déformé 1"}])\n\nnext_turn';
    expect(stripToolCallSyntax(input)).toBe('Le combat commence !');
  });

  it('removes a tool call with balanced inner parens', () => {
    expect(stripToolCallSyntax('avant start_combat(a=(1,2), b=3) après')).toBe('avant  après');
  });

  it('removes a bare tool name on its own line', () => {
    expect(stripToolCallSyntax('Le tour passe.\n\nnext_turn\n\nLe gobelin avance.')).toBe(
      'Le tour passe.\n\nLe gobelin avance.',
    );
  });

  it('leaves prose alone when no tool name appears', () => {
    expect(stripToolCallSyntax('La taverne est bondée. Une silhouette se penche.')).toBe(
      'La taverne est bondée. Une silhouette se penche.',
    );
  });

  it('does not strip tool names embedded in regular sentences', () => {
    expect(stripToolCallSyntax('Le start_combat dans une phrase reste intact')).toBe(
      'Le start_combat dans une phrase reste intact',
    );
  });

  it('strips multiple consecutive tool calls', () => {
    const input =
      'apply_damage(combatant_id="x", amount=5)\napply_condition(combatant_id="x", condition="prone", add=true)';
    expect(stripToolCallSyntax(input)).toBe('');
  });

  it('strips a tool call written with curly braces (gemma4 variant)', () => {
    expect(
      stripToolCallSyntax('avant request_roll{dice:1d20+5, kind:attack, target_ac:13} après'),
    ).toBe('avant  après');
  });

  it('strips a truncated tool call missing its closer', () => {
    // Model wrote `request_roll(...` without closing — strip to end of line.
    const input =
      'Le mage cible le gobelin.\nrequest_roll(dice:1d20+5, kind:attack, target_combatant_id:npc-1\nLa suite de la narration.';
    const out = stripToolCallSyntax(input);
    expect(out).toContain('Le mage cible le gobelin.');
    expect(out).toContain('La suite de la narration.');
    expect(out).not.toContain('request_roll');
    expect(out).not.toContain('target_combatant_id');
  });

  it('strips an orphan KV blob without the tool-name prefix', () => {
    // Real leak observed with gemma4:26b — args without the function name.
    const input =
      'Le mage cible le gobelin.\n1d20+5,kind:attack,label:Sort,target_ac:13,target_combatant_id:npc-1777}\nQue fais-tu ?';
    const out = stripToolCallSyntax(input);
    expect(out).toContain('Le mage cible le gobelin.');
    expect(out).toContain('Que fais-tu ?');
    expect(out).not.toContain('target_combatant_id');
    expect(out).not.toContain('target_ac');
  });

  it('keeps a single key:value mention in prose (no false positive)', () => {
    expect(stripToolCallSyntax('Le label: une porte de chêne.')).toBe(
      'Le label: une porte de chêne.',
    );
  });

  it('strips a JSON blob with quoted keys (gemma4 JSON variant)', () => {
    const input =
      'Le mage cible le gobelin.\n{"kind": "attack", "label": "Sort", "dice": "1d20+5", "target_ac": 13, "target_combatant_id": "npc-1777"}\nQue fais-tu ?';
    const out = stripToolCallSyntax(input);
    expect(out).toContain('Le mage cible le gobelin.');
    expect(out).toContain('Que fais-tu ?');
    expect(out).not.toContain('target_combatant_id');
    expect(out).not.toContain('target_ac');
  });
});

describe('sanitizeNarration', () => {
  it('combines HTML strip and tool-call strip', () => {
    const input =
      '<span style="color:gray">Le combat commence !</span>\n\nstart_combat(npcs=[{name="Gob"}])\n\nnext_turn';
    expect(sanitizeNarration(input)).toBe('Le combat commence !');
  });
});

describe('hasTextualToolCall', () => {
  it('detects a tool call written in prose', () => {
    expect(hasTextualToolCall('start_combat(npcs=[{name="Gob"}])')).toBe(true);
  });

  it('detects a bare tool name on its own line', () => {
    expect(hasTextualToolCall('Le tour passe.\nnext_turn\nGo.')).toBe(true);
  });

  it('returns false for clean prose', () => {
    expect(hasTextualToolCall('La taverne est calme. Le feu crépite.')).toBe(false);
  });

  it('returns false when tool name appears mid-sentence (not a call)', () => {
    expect(hasTextualToolCall('Le start_combat dans une phrase reste intact')).toBe(false);
  });

  it('detects a curly-brace tool call', () => {
    expect(hasTextualToolCall('request_roll{dice:1d20+5, kind:attack, target_ac:13}')).toBe(true);
  });

  it('detects an orphan KV blob (model leaked args without prefix)', () => {
    expect(
      hasTextualToolCall('1d20+5,kind:attack,target_ac:13,target_combatant_id:npc-1777}'),
    ).toBe(true);
  });

  it('detects a JSON blob with quoted keys', () => {
    expect(
      hasTextualToolCall(
        '{"kind": "attack", "dice": "1d20+5", "target_ac": 13, "target_combatant_id": "npc-1"}',
      ),
    ).toBe(true);
  });
});
