'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../db/server';

/**
 * Redirects to `/` if no user is signed in. Returns the authenticated user.
 * Use inside Server Components and Server Actions that require auth.
 */
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect('/');
  }
  return data.user;
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
