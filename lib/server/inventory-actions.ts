'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
  equipped?: boolean;
}

export type Currency = { cp: number; sp: number; ep: number; gp: number; pp: number };

async function loadCharacter(id: string): Promise<CharacterRow | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('characters').select('*').eq('id', id).maybeSingle();
  return data;
}

const addSchema = z.object({
  characterId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  qty: z.coerce.number().int().min(1).max(9999).default(1),
  type: z.enum(['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc']).default('misc'),
  description: z.string().max(400).optional(),
});

export async function addInventoryItem(input: {
  characterId: string;
  name: string;
  qty?: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Entrée invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const items = (character.inventory as InventoryItem[]) ?? [];
  const existing = items.find(
    (i) => i.name.toLowerCase() === parsed.data.name.toLowerCase() && i.type === parsed.data.type,
  );
  const next: InventoryItem[] = existing
    ? items.map((i) => (i === existing ? { ...i, qty: i.qty + parsed.data.qty } : i))
    : [
        ...items,
        {
          id: `i-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: parsed.data.name,
          qty: parsed.data.qty,
          type: parsed.data.type,
          description: parsed.data.description,
        },
      ];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({ inventory: next })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}/sheet`);
  return { ok: true, data };
}

const removeSchema = z.object({
  characterId: z.string().uuid(),
  itemId: z.string().min(1),
  qty: z.coerce.number().int().min(1).default(1),
});

export async function removeInventoryItem(input: {
  characterId: string;
  itemId: string;
  qty?: number;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Entrée invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const items = (character.inventory as InventoryItem[]) ?? [];
  const next = items
    .map((i) => (i.id === parsed.data.itemId ? { ...i, qty: i.qty - parsed.data.qty } : i))
    .filter((i) => i.qty > 0);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({ inventory: next })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}/sheet`);
  return { ok: true, data };
}

const currencySchema = z.object({
  characterId: z.string().uuid(),
  cp: z.coerce.number().int().default(0),
  sp: z.coerce.number().int().default(0),
  ep: z.coerce.number().int().default(0),
  gp: z.coerce.number().int().default(0),
  pp: z.coerce.number().int().default(0),
});

export async function adjustCurrency(input: {
  characterId: string;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Entrée invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const c = character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const next: Currency = {
    cp: Math.max(0, c.cp + parsed.data.cp),
    sp: Math.max(0, c.sp + parsed.data.sp),
    ep: Math.max(0, c.ep + parsed.data.ep),
    gp: Math.max(0, c.gp + parsed.data.gp),
    pp: Math.max(0, c.pp + parsed.data.pp),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({ currency: next })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}/sheet`);
  return { ok: true, data };
}
