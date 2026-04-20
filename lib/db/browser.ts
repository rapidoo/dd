'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

/**
 * Supabase client for client components. Uses the anon key; RLS enforces access.
 * Safe to import from components with the 'use client' directive.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase public env vars are missing');
  }
  return createBrowserClient<Database>(url, anonKey);
}
