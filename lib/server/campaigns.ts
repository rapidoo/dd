'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CampaignRow } from '../db/types';
import { getModuleTemplate } from '../modules/templates';
import { requireUser } from './auth';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(120),
  settingMode: z.enum(['homebrew', 'module', 'generated', 'arena']),
  settingPitch: z.string().max(2000).optional().nullable(),
  moduleId: z.string().max(120).optional().nullable(),
  universe: z.enum(['dnd5e', 'witcher', 'naheulbeuk']).default('dnd5e'),
});

export type CreateCampaignInput = z.infer<typeof createSchema>;

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function listCampaigns(): Promise<ServerResult<CampaignRow[]>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

export async function createCampaign(
  _prev: ServerResult<CampaignRow> | null,
  formData: FormData,
): Promise<ServerResult<CampaignRow>> {
  const raw = {
    name: formData.get('name'),
    settingMode: formData.get('settingMode'),
    settingPitch: formData.get('settingPitch') || null,
    moduleId: formData.get('moduleId') || null,
    universe: formData.get('universe') || 'dnd5e',
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Entrée invalide',
      fieldErrors: z.treeifyError(parsed.error).properties as Record<string, string[]>,
    };
  }
  if (parsed.data.settingMode === 'module' && !parsed.data.moduleId) {
    return { ok: false, error: 'Choisis un module pour ce mode.' };
  }
  const template =
    parsed.data.settingMode === 'module' && parsed.data.moduleId
      ? getModuleTemplate(parsed.data.moduleId)
      : null;
  if (parsed.data.settingMode === 'module' && !template) {
    return { ok: false, error: 'Module inconnu.' };
  }

  // Seed the world summary from the template / pitch so the GM has context.
  const pitch = parsed.data.settingPitch?.trim() ?? '';
  const universe = parsed.data.universe;

  // Universe-specific system prefix
  const universePrefix =
    universe === 'witcher'
      ? `Contexte Witcher : Tu es le Conteur dans un univers inspiré de The Witcher (Continent, écoles de sorciers, monstres, alchimie, politique entre royaumes). Utilise des termes Witcher : sorceleurs, sources, potions, signes, contrats, chaos. Les races incluent humains, elfes, nains, et demi-elfes. Les classes traditionnelles D&D sont adaptées : "Sorceleur" (guerrier/mage), "Mage" (utilise la magie des Signes), "Voleur/Éclaireur", etc.`
      : universe === 'naheulbeuk'
        ? `Contexte Naheulbeuk : Tu es le Conteur en Terre de Fangh, univers parodique de fantasy classique tellement classique qu'il en devient un cliché ambulant. Royaumes (Waldorg, Glargh, Mortebranche, Côte des Ogres), donjons à couloirs en équerre, gobelins de garde, squelettes en pause syndicale, ogres affamés, elfes snobs, nains alcooliques, magie qui foire un coup sur deux, panthéon ridicule (Reuk, Hashpout, Brorne, Crôm, Dlul, Mankdebol, Ouilff dieu des chaussettes dépareillées). Ton COMÉDIQUE et BIENVEILLANT : les PJ sont des bras cassés héroïques, pas des élus du destin. Récompense l'échec drôle, refuse le pathos, multiplie les PNJ ridicules, fais parler les PNJ avec accent (ogres mâcheurs, gobelins zézayeurs, elfes prétentieux). Lieu canonique : Auberge de la Truie qui File (Maître Bouldegom). Méchant récurrent : Zangdar le Sorcier (allergique à la mauvaise musique). Donjon-titre : Donjon de Naheulbeuk (Statuette de Gladeulfeurha). Année : 1042. NE TUE PAS les PJ : préfère la défaite humiliante à la mort.`
        : '';

  const modeLabelInline =
    parsed.data.settingMode === 'module'
      ? 'module pré-écrit'
      : parsed.data.settingMode === 'homebrew'
        ? 'homebrew'
        : parsed.data.settingMode === 'arena'
          ? 'arène'
          : 'généré';
  const modePrefix = `Mode: ${modeLabelInline}.`;

  const hasUniversePrefix = universePrefix.length > 0;

  let worldSummary: string | null = null;
  if (parsed.data.settingMode === 'arena') {
    // Arena mode — pure combat sandbox. No story, no NPCs, no rewards.
    // The GM is instructed to spawn encounters back-to-back as soon as the
    // player gives any input, escalating between fights.
    const arenaPrompt = `Tu es le MJ d'une arène d'entraînement au combat. Pas d'histoire, pas de PNJ alliés narratifs, pas de quête, pas de butin narratif. Le joueur veut tester le combat — c'est l'unique objectif.

Boucle obligatoire :
1. Décris brièvement l'arène (1-2 phrases : sable, sang séché, tribunes vides — ambiance dépouillée).
2. À la PREMIÈRE interaction du joueur (n'importe laquelle), invoque IMMÉDIATEMENT start_combat avec 1-3 ennemis adaptés au niveau de l'équipe. Pas de roleplay préalable, pas de dialogue avec les ennemis.
3. Pendant le combat : déroule normalement, le serveur enchaîne les tours.
4. Quand le combat se termine, narre 1 phrase de transition (l'écho des coups retombe, le portail suivant s'ouvre…) puis enchaîne IMMÉDIATEMENT start_combat avec une nouvelle vague — varie les ennemis, monte progressivement en difficulté.
5. Pas de repos, pas de soin gratuit entre les vagues — c'est au joueur de gérer ses PV/sorts.

Pour le pitch éventuel du joueur (variante demandée) : ${pitch || '(aucun, choisis librement les ennemis)'}.

${modePrefix} Reste en mode combat continu. Ne propose PAS de fuir, de négocier, de quitter l'arène — c'est de la pratique pure.`;
    worldSummary = hasUniversePrefix ? `${universePrefix}\n\n${arenaPrompt}` : arenaPrompt;
  } else if (template) {
    const templateSummary = `${template.title} — ${template.tagline}\n\n${template.summary}\n\nNiveaux: ${template.levelRange} · Difficulté: ${template.difficulty} · Tons: ${template.tones.join(', ')}\nÉquipe conseillée: ${template.recommendedParty}\n\n`;
    worldSummary = hasUniversePrefix
      ? `${universePrefix}\n\n${templateSummary}${modePrefix} Reste fidèle au pitch ci-dessus.`
      : `${templateSummary}${modePrefix} Reste fidèle au pitch ci-dessus et à l'univers décrit.`;
  } else if (parsed.data.settingMode === 'homebrew' && pitch) {
    const baseSummary = `Univers décrit par le joueur :\n${pitch}\n\n`;
    worldSummary = hasUniversePrefix
      ? `${universePrefix}\n\n${baseSummary}${modePrefix} RESPECTE la description du joueur à la lettre.`
      : `${baseSummary}${modePrefix} RESPECTE la description du joueur à la lettre. N'invente pas de lieux, PNJ ou ambiances qui contrediraient ses indications. Si un détail manque, demande-lui avant de décider.`;
  } else if (parsed.data.settingMode === 'generated') {
    const themeFallback =
      universe === 'witcher'
        ? '(aucun, improvise un thème Witcher)'
        : universe === 'naheulbeuk'
          ? "(aucun, improvise un contrat de bras cassés à l'Auberge de la Truie qui File)"
          : '(aucun, improvise un thème cozy dark fantasy)';
    const baseSummary = `Thème de départ donné par le joueur :\n${pitch || themeFallback}\n\n${modePrefix} Tu as carte blanche pour inventer lieux, factions, PNJ et premier accrochage à partir de ce thème. Commence la toute première session par une scène d'ouverture immersive et mémorable, puis laisse le joueur réagir.`;
    worldSummary = hasUniversePrefix ? `${universePrefix}\n\n${baseSummary}` : baseSummary;
  } else if (pitch) {
    worldSummary = hasUniversePrefix ? `${universePrefix}\n\n${pitch}` : pitch;
  }

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Try inserting with universe column first
  let { data, error } = await supabase
    .from('campaigns')
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      setting_mode: parsed.data.settingMode,
      setting_pitch: parsed.data.settingPitch ?? template?.tagline ?? null,
      module_id: parsed.data.moduleId,
      universe: parsed.data.universe,
      world_summary: worldSummary,
    })
    .select('*')
    .single();

  // Fallback: if universe column doesn't exist yet, insert without it
  // This handles the case where the migration hasn't been applied yet
  if (error?.message?.includes("Could not find the 'universe' column")) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('campaigns')
      .insert({
        owner_id: user.id,
        name: parsed.data.name,
        setting_mode: parsed.data.settingMode,
        setting_pitch: parsed.data.settingPitch ?? template?.tagline ?? null,
        module_id: parsed.data.moduleId,
        world_summary: worldSummary,
      })
      .select('*')
      .single();
    data = fallbackData;
    error = fallbackError;
  }

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Création impossible' };
  }
  revalidatePath('/dashboard');
  redirect(`/campaigns/${data.id}`);
}

export async function deleteCampaign(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  // RLS already restricts to owner_id = auth.uid(); the .eq is defensive.
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle<CampaignRow>();
  if (!data) return null;
  // Ensure universe is always set (for backward compatibility with DB without the column)
  if (!data.universe) {
    return { ...data, universe: 'dnd5e' };
  }
  return data;
}
