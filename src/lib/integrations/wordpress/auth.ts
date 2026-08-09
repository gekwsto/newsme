import { timingSafeEqual } from 'crypto';

/**
 * Authentication for the NewsMe <-> WordPress integration API.
 *
 * Accepts either:
 *   Authorization: Bearer <WORDPRESS_INTEGRATION_API_KEY>
 *   X-NewsMe-API-Key: <WORDPRESS_INTEGRATION_API_KEY>
 *
 * Fails closed: if the server-side secret is not configured, every request
 * is rejected (never falls back to "no auth required").
 */

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against itself so the timing cost is independent of the
    // caller-supplied value's length, avoiding a length-based timing leak.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const keyHeader = request.headers.get('x-newsme-api-key');
  if (keyHeader?.trim()) return keyHeader.trim();

  return null;
}

export function isAuthorizedWordPressRequest(request: Request): boolean {
  const expected = process.env.WORDPRESS_INTEGRATION_API_KEY;
  if (!expected) {
    console.error('[wordpress-integration] auth misconfigured: WORDPRESS_INTEGRATION_API_KEY is not set');
    return false;
  }

  const provided = extractApiKey(request);
  if (!provided) return false;

  return safeCompare(provided, expected);
}
