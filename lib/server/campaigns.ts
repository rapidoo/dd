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
  settingMode: z.enum(['homebrew', 'module', 'generated']),
  settingPitch: z.string().max(2000).optional().nullable(),
  moduleId: z.string().max(120).optional().nullable(),
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

  // Seed the world summary from the template so the GM has the pitch ready.
  const worldSummary = template
    ? `${template.title} — ${template.tagline}\n\n${template.summary}\n\nNiveaux: ${template.levelRange} · Difficulté: ${template.difficulty} · Tons: ${template.tones.join(', ')}\nÉquipe conseillée: ${template.recommendedParty}`
    : null;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
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
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Création impossible' };
  }
  revalidatePath('/dashboard');
  redirect(`/campaigns/${data.id}`);
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
  return data;
}
