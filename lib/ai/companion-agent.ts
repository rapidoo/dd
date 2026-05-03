import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow } from '../db/types';
import type { CombatState } from '../server/combat-loop';
import type { GmEvent } from './gm-agent';
import { llm } from './llm';
import type { ChatMessage, ToolResultIn } from './llm/types';
import { sanitizeNarration } from './sanitize';
import { COMPANION_TOOLS, type RequestRollInput } from './tools';

const COMPANION_SYSTEM_BASE = (
  character: CharacterRow,
  hint: string | null,
  combatBlock: string,
) => `Tu joues ${character.name}, un compagnon de voyage du joueur dans une partie de D&D 5e.

Fiche courte :
- Espèce : ${character.species}
- Classe : ${character.class} (niveau ${character.level})
- PV : ${character.current_hp}/${character.max_hp} · CA : ${character.ac}
- Personnalité : ${formatPersona(character.persona)}

Règles de réplique :
- Tu n'es PAS le MJ. Tu réagis comme un personnage joueur — 1 à 3 phrases. Pas de markdown, pas d'emojis.
- Parle en français. Utilise <em>…</em> pour les paroles à haute voix.
- Ne décris PAS la scène elle-même — laisse ça au MJ. Tu exprimes une réaction, une action, un commentaire bref.

${combatBlock ? `Combat — c'est TON tour si le marqueur ▶ pointe sur toi.${combatBlock}\n` : ''}RÈGLE CRITIQUE — Outils : tu disposes de l'outil de jet (request_roll). Tu l'invoques UNIQUEMENT via le canal tool_calls structuré. N'écris JAMAIS son nom ni ses arguments dans la narration en prose (pas de "request_roll(...)", pas de "dice:1d20+5,kind:attack,..."). Si tu veux rouler, émets un tool_call ; sinon raconte simplement.

Règles d'action en combat :
- Quand tu attaques, déclare ton intention en 1-2 phrases (qui, quoi, comment) PUIS lance le jet d'attaque via tool_call (kind="attack", target_ac, target_combatant_id). N'invente pas l'issue avant le jet.
- Sur touche ou crit, enchaîne IMMÉDIATEMENT un jet de dégâts via tool_call (kind="damage", target_combatant_id). Le serveur applique les dégâts automatiquement et passe au combattant suivant.
- Sur soin, kind="heal" + target_combatant_id sur un allié. Le serveur remonte les PV et passe au suivant.
- Cible : utilise les ids exacts du bloc Initiative (npc-* pour les ennemis, UUID pour PJ/compagnons).
- Pas de "Fais un jet" / "Lance un dé" en texte — tu rolles toi-même via le tool_call. Jamais de PV dans le texte.
- Hors combat, tu peux aussi rouler une compétence via tool_call (kind="check") pour une action discrète.${
  hint ? `\n\nIndication pour cette réplique : ${hint}` : ''
}`;

function formatPersona(persona: Record<string, unknown> | null): string {
  if (!persona) return 'inconnue';
  if (typeof persona.notes === 'string') return persona.notes;
  return JSON.stringify(persona);
}

export interface CompanionTurnResult {
  /** Final narrative text the companion produced (already persisted). */
  text: string;
  /** Events to forward upward (dice rolls, combat updates, …). */
  events: GmEvent[];
}

/**
 * Companion turn — runs a small tool-use loop so the companion can roll its
 * own attacks and damages just like the GM does. The caller injects
 * `executeRoll` to avoid a circular import with gm-agent.
 */
export async function respondAsCompanion(opts: {
  sessionId: string;
  character: CharacterRow;
  history: MessageRow[];
  hint?: string;
  combatState: CombatState | null;
  /** Renders an "Initiative …" block when an encounter is active. */
  combatBlock: string;
  /** Roll executor injected by gm-agent. Same impl the GM uses. */
  executeRoll: (
    input: RequestRollInput,
    sessionId: string,
  ) => Promise<{ result: unknown; events: GmEvent[] }>;
}): Promise<CompanionTurnResult> {
  const messages: ChatMessage[] = opts.history
    .filter(
      (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
    )
    .slice(-6)
    .map<ChatMessage>((m) => ({
      role: m.author_kind === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));
  messages.push({ role: 'user', content: "C'est ton tour de réagir en tant que ce compagnon." });

  const system = COMPANION_SYSTEM_BASE(opts.character, opts.hint ?? null, opts.combatBlock);

  const events: GmEvent[] = [];
  const textParts: string[] = [];
  const MAX_ITERATIONS = 4;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Awaited<ReturnType<ReturnType<typeof llm>['chat']>>;
    try {
      response = await llm().chat({
        role: 'companion',
        system,
        messages,
        tools: COMPANION_TOOLS,
        maxTokens: 350,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[companion.chat]', err);
      break;
    }

    const fullText = sanitizeNarration(response.text.trim());
    if (fullText) textParts.push(fullText);

    if (response.stopReason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: fullText, toolCalls: response.toolCalls });
    const results: ToolResultIn[] = [];
    for (const call of response.toolCalls) {
      if (call.name === 'request_roll') {
        const result = await opts.executeRoll(call.input as RequestRollInput, opts.sessionId);
        results.push({ toolUseId: call.id, content: JSON.stringify(result.result) });
        for (const ev of result.events) events.push(ev);
      } else {
        // Unknown tool — feed an error back so the model self-corrects.
        results.push({
          toolUseId: call.id,
          content: JSON.stringify({ error: `Tool ${call.name} indisponible côté compagnon` }),
        });
      }
    }
    messages.push({ role: 'tool', results });
  }

  const text = textParts.join(' ').trim();
  if (!text) {
    return { text: '', events };
  }

  const supabase = createSupabaseServiceClient();
  await supabase.from('messages').insert({
    session_id: opts.sessionId,
    author_kind: 'character',
    author_id: opts.character.id,
    content: text,
    metadata: { character_name: opts.character.name },
  });
  return { text, events };
}
