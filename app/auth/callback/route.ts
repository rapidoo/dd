import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/db/server';

/**
 * Magic-link callback. Supabase redirects the user here with a `code` query
 * parameter after the user clicks the email link. We exchange the code for a
 * session, then redirect to the dashboard (or the original `next` target).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const encoded = encodeURIComponent(error.message);
    return NextResponse.redirect(new URL(`/?error=${encoded}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
