/**
 * Best-effort in-memory rate limiter for the WordPress integration API.
 *
 * The codebase has no shared rate-limiting infrastructure (no Redis/Upstash),
 * and this endpoint is called by a small, known set of server-to-server
 * clients (WordPress plugins holding a shared API key) rather than the
 * public internet. A per-process fixed-window counter is enough to blunt
 * runaway retry loops or a misconfigured cron; it resets on cold start and
 * is not shared across serverless instances. If this ever needs to hold up
 * under many concurrent instances or hostile traffic, replace with an
 * infra-backed limiter (e.g. Upstash Ratelimit) — do not treat this as a
 * security boundary on its own (auth is the security boundary).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function rateLimitKeyFromRequest(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return 'unknown';
}
