'use server';

import { z } from 'zod';
import { anthropic, MODELS } from '../ai/claude';
import { CLASSES, SPECIES } from '../rules/srd';
import { requireUser } from './auth';

const schema = z.object({
  speciesId: z.string().refine((v) => v in SPECIES, 'Espèce inconnue'),
  classId: z.string().refine((v) => v in CLASSES, 'Classe inconnue'),
  name: z.string().trim().max(80).optional(),
});

export interface PersonaSuggestion {
  ok: boolean;
  text?: string;
  error?: string;
}

const SYSTEM = `Tu aides à imaginer la personnalité d'un compagnon IA pour une partie de D&D 5e en français, style "dark fantasy cozy".

Règles :
- Rends 2 à 3 phrases courtes et concrètes, qui décrivent la voix, le caractère, une manie ou une particularité.
- Pas de présentation ("Voici…"), pas de liste, pas de markdown.
- Ton sobre, un brin littéraire, jamais cliché. Donne du grain au personnage.
- Mentionne l'espèce ou la classe si ça ajoute du relief, mais pas obligatoire.
- Max 240 caractères.`;

export async function suggestPersona(input: {
  speciesId: string;
  classId: string;
  name?: string;
}): Promise<PersonaSuggestion> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Entrée invalide' };
  await requireUser();

  const species = SPECIES[parsed.data.speciesId];
  const klass = CLASSES[parsed.data.classId];
  if (!species || !klass) return { ok: false, error: 'Données inconnues' };

  const userPrompt = `Crée une personnalité pour ${parsed.data.name?.trim() || 'un compagnon'}, ${species.name.toLowerCase()} ${klass.name.toLowerCase()}. Renvoie uniquement le texte de la personnalité, rien d'autre.`;

  try {
    const response = await anthropic().messages.create({
      model: MODELS.UTIL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) return { ok: false, error: 'Réponse vide' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'LLM error' };
  }
}
