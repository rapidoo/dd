import type { NextConfig } from 'next';

const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
})();

/**
 * Content Security Policy. Kept strict but with the minimum allowances for:
 * - Google Fonts (EB Garamond, Inter, IM Fell English SC, JetBrains Mono)
 * - Supabase Auth / REST from the client
 * - our own SSE endpoint
 * - Next.js dev HMR when running locally
 */
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}${process.env.NODE_ENV !== 'production' ? ' ws://localhost:* http://localhost:*' : ''}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
