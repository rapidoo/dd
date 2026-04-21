import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../lib/db/server';

/**
 * DEV / TEST ONLY. Guarded by ALLOW_TEST_LOGIN=1. When enabled, signs in a
 * test user by email + password and sets the Supabase SSR cookies on the
 * response. Returns 404 in production.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  if (process.env.ALLOW_TEST_LOGIN !== '1') {
    return new Response('Not found', { status: 404 });
  }
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.session) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'no session' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId: data.user?.id });
}
