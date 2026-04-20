/**
 * Strict env access — fails loud at boot if a required secret is missing.
 * Never import from client components; these references live only on the server.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get anthropicApiKey() {
    return required('ANTHROPIC_API_KEY');
  },
  get neo4jUri() {
    return required('NEO4J_URI');
  },
  get neo4jUser() {
    return required('NEO4J_USER');
  },
  get neo4jPassword() {
    return required('NEO4J_PASSWORD');
  },
  get siteUrl() {
    return optional('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000';
  },
} as const;
