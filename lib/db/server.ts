import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from './env';
import type { Database } from './types';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Uses the anon key with the user's cookies — RLS enforces access per-user.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component or Route Handler where setting cookies
          // isn't allowed (e.g. read-only context). The middleware refreshes the
          // session; ignoring here is safe.
        }
      },
    },
  });
}

/**
 * Admin client — bypasses RLS via the service_role key. Server-only. Use
 * sparingly: triggers, migrations, admin tools, webhooks. Never expose.
 */
export function createSupabaseServiceClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
