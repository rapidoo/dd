import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/db/server';

/**
 * Magic-link callback. Supabase redirects the user here with a `code` query
 * parameter after the user clicks the email link. We exchange the code for a
 * session, then redirect to the dashboard (or the original `next` target).
 */
/**
 * Accept only strictly-internal relative paths ("/dashboard", "/campaigns/<id>").
 * Rejects protocol-relative ("//evil"), absolute URLs ("https://evil"),
 * fragments-only, and backslash tricks.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/dashboard';
  }
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

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
