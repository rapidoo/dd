/**
 * In-memory sliding-window rate limiter, keyed by an arbitrary string.
 *
 * This is deliberately process-local: good enough for a single Vercel
 * function instance and way better than nothing. Move to Upstash / KV
 * when we ship to multiple regions.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
}

export function rateLimit(key: string, maxHits: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  // Drop stale entries.
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= maxHits) {
    const oldest = bucket.hits[0] ?? now;
    return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}
