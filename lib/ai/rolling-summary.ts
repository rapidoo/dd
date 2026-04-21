import { createSupabaseServiceClient } from '../db/server';
import type { MessageRow } from '../db/types';
import { anthropic, MODELS } from './claude';

/**
 * Sliding-window compaction for GM prompt context.
 *
 * Keeps the last KEEP_TAIL messages verbatim and replaces older ones with a
 * running summary stored in sessions.summary. The summary is regenerated via
 * Haiku when at least REGEN_EVERY new messages have fallen out of the tail
 * since the last summary.
 *
 * Effect: the prompt stays roughly constant-size past 30 turns instead of
 * growing linearly with session length.
 */

const KEEP_TAIL = 10;
const REGEN_EVERY = 10;
const MIN_HISTORY_FOR_SUMMARY = KEEP_TAIL + 5;

export interface CompactedHistory {
  /** Existing rolling summary if we have one, else null. */
  summary: string | null;
  /** Messages that must still be sent verbatim to Opus. */
  tail: MessageRow[];
}

export async function compactHistory(
  sessionId: string,
  history: MessageRow[],
): Promise<CompactedHistory> {
  if (history.length < MIN_HISTORY_FOR_SUMMARY) {
    return { summary: null, tail: history };
  }

  const tail = history.slice(-KEEP_TAIL);
  const compactable = history.slice(0, -KEEP_TAIL);

  const supabase = createSupabaseServiceClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('summary, summary_cursor')
    .eq('id', sessionId)
    .maybeSingle<{ summary: string | null; summary_cursor: string | null }>();

  const existingSummary = session?.summary ?? null;
  const cursor = session?.summary_cursor ?? null;

  const cursorIdx = cursor ? compactable.findIndex((m) => m.id === cursor) : -1;
  const newSinceSummary = compactable.length - 1 - cursorIdx;

  if (existingSummary && newSinceSummary < REGEN_EVERY) {
    return { summary: existingSummary, tail };
  }

  const chunkToSummarize = cursorIdx >= 0 ? compactable.slice(cursorIdx + 1) : compactable;
  if (chunkToSummarize.length === 0) {
    return { summary: existingSummary, tail };
  }

  const newSummary = await haikuSummarize(existingSummary, chunkToSummarize);
  const lastId = compactable[compactable.length - 1]?.id;
  if (newSummary && lastId) {
    await supabase
      .from('sessions')
      .update({ summary: newSummary, summary_cursor: lastId })
      .eq('id', sessionId);
  }

  return { summary: newSummary ?? existingSummary, tail };
}

async function haikuSummarize(
  existingSummary: string | null,
  newMessages: MessageRow[],
): Promise<string | null> {
  const asTranscript = newMessages
    .map((m) => {
      const role =
        m.author_kind === 'gm' ? 'Conteur' : m.author_kind === 'user' ? 'Joueur' : 'Compagnon';
      return `${role} : ${m.content}`;
    })
    .join('\n\n');

  const prompt = existingSummary
    ? `Tu mets à jour le résumé d'une partie de Donjons & Dragons. Intègre les nouveaux échanges ci-dessous dans le résumé existant. Reste concis (150-200 mots max), en français, à la troisième personne, en conservant les faits importants : PNJ rencontrés (avec un trait), lieux visités, objets obtenus, engagements pris, fils narratifs en cours. Ne recopie pas du dialogue ni des dés, synthétise l'état du monde et des relations.

Résumé existant :
${existingSummary}

Nouveaux échanges :
${asTranscript}

Nouveau résumé :`
    : `Tu résumes le début d'une partie de Donjons & Dragons. Produis un résumé de 150-200 mots max, en français, à la troisième personne, centré sur : PNJ rencontrés (avec un trait), lieux visités, objets obtenus, engagements pris, fils narratifs en cours. Pas de dialogue, pas de dés.

Échanges :
${asTranscript}

Résumé :`;

  try {
    const response = await anthropic().messages.create({
      model: MODELS.UTIL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) return null;
    // DB CHECK constraint caps summary at 8192 chars.
    return text.length > 8000 ? `${text.slice(0, 7996)}…` : text;
  } catch {
    return null;
  }
}
