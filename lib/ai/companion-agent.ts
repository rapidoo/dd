import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow } from '../db/types';
import { anthropic, MODELS } from './claude';

const COMPANION_SYSTEM = (
  character: CharacterRow,
  hint: string | null,
) => `Tu joues ${character.name}, un compagnon de voyage du joueur dans une partie de D&D 5e.

Fiche courte :
- Espèce : ${character.species}
- Classe : ${character.class} (niveau ${character.level})
- Personnalité : ${formatPersona(character.persona)}

Règles :
- Tu n'es PAS le MJ. Tu réagis comme un personnage joueur à ce qui vient d'arriver.
- Réponds en 1 à 3 phrases maximum. Pas de markdown, pas d'emojis.
- Parle en français. Utilise <em>…</em> pour les paroles à haute voix.
- Ne décris PAS la scène elle-même — laisse ça au MJ. Tu exprimes une réaction, une action, un commentaire bref.
${hint ? `\nIndication pour cette réplique : ${hint}\n` : ''}`;

function formatPersona(persona: Record<string, unknown> | null): string {
  if (!persona) return 'inconnue';
  if (typeof persona.notes === 'string') return persona.notes;
  return JSON.stringify(persona);
}

/**
 * One-shot Sonnet response as a companion character. Persists the message
 * to the session so it shows up in the scroll.
 */
export async function respondAsCompanion(opts: {
  sessionId: string;
  character: CharacterRow;
  history: MessageRow[];
  hint?: string;
}): Promise<string> {
  const messages = opts.history
    .filter(
      (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
    )
    .slice(-12)
    .map((m) => ({
      role: m.author_kind === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));
  messages.push({ role: 'user', content: "C'est ton tour de réagir en tant que ce compagnon." });

  const response = await anthropic().messages.create({
    model: MODELS.COMPANION,
    max_tokens: 400,
    system: COMPANION_SYSTEM(opts.character, opts.hint ?? null),
    messages,
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  if (!text) return '';

  const supabase = createSupabaseServiceClient();
  await supabase.from('messages').insert({
    session_id: opts.sessionId,
    author_kind: 'character',
    author_id: opts.character.id,
    content: text,
    metadata: { character_name: opts.character.name },
  });
  return text;
}
