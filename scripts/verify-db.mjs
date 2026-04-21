#!/usr/bin/env node
import { readFileSync } from 'node:fs';
// Quick verification that the Supabase schema is in place.
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const tables = [
  'profiles',
  'campaigns',
  'characters',
  'sessions',
  'messages',
  'dice_rolls',
  'combat_encounters',
  'entities',
  'generated_assets',
];

let ok = true;
for (const t of tables) {
  const { error, count } = await client.from(t).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`  ✗ ${t} — ${error.message}`);
    ok = false;
  } else {
    console.log(`  ✓ ${t} (${count ?? 0} rows)`);
  }
}

process.exit(ok ? 0 : 1);
