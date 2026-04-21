import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error('Missing Supabase env for e2e');

const admin = createClient(url, service, { auth: { persistSession: false } });

export interface TestUser {
  email: string;
  password: string;
  userId: string;
}

/**
 * Ensure a test user exists with the given email + password. Idempotent: if
 * the user already exists, updates the password so sign-in always works.
 */
export async function ensureTestUser(email: string, password: string): Promise<TestUser> {
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = existing.data.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    return { email, password, userId: found.id };
  }
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.data.user) throw new Error('Could not create test user');
  return { email, password, userId: created.data.user.id };
}

/**
 * Hit /api/test/login so the dev server stamps session cookies on the
 * response, then transplant them into the browser context.
 */
export async function signInTestUser(
  request: APIRequestContext,
  browserContext: BrowserContext,
  baseURL: string,
  user: TestUser,
): Promise<void> {
  const response = await request.post(`${baseURL}/api/test/login`, {
    data: { email: user.email, password: user.password },
  });
  if (!response.ok()) {
    throw new Error(`test login failed: ${response.status()} ${await response.text()}`);
  }
  const cookies = (await response.headersArray())
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .flatMap((h) => parseSetCookie(h.value, baseURL));
  await browserContext.addCookies(cookies);
}

interface CookieInput {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function parseSetCookie(header: string, baseURL: string): CookieInput[] {
  // Single Set-Cookie string; may be comma-joined across headers but Playwright
  // already returns them per-entry. Parse directives.
  const parts = header.split(';').map((p) => p.trim());
  const first = parts[0];
  if (!first) return [];
  const eq = first.indexOf('=');
  if (eq === -1) return [];
  const cookie: CookieInput = {
    name: first.slice(0, eq),
    value: first.slice(eq + 1),
    domain: new URL(baseURL).hostname,
    path: '/',
  };
  for (const p of parts.slice(1)) {
    const [k, v = ''] = p.split('=');
    const key = k?.toLowerCase();
    if (key === 'path') cookie.path = v;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'samesite') {
      const lower = v.toLowerCase();
      cookie.sameSite = lower === 'strict' ? 'Strict' : lower === 'none' ? 'None' : 'Lax';
    } else if (key === 'max-age') {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
    }
  }
  return [cookie];
}
