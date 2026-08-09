/**
 * Authentication for the NewsMe <-> WordPress integration API.
 * No DB/network — pure header/env checks.
 */

import { extractApiKey, isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';

const ORIGINAL_ENV = process.env.WORDPRESS_INTEGRATION_API_KEY;

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://newsme.gr/api/integrations/wordpress/pipeline', {
    method: 'POST',
    headers,
  });
}

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.WORDPRESS_INTEGRATION_API_KEY;
  else process.env.WORDPRESS_INTEGRATION_API_KEY = ORIGINAL_ENV;
});

describe('extractApiKey', () => {
  test('reads Bearer token from Authorization header', () => {
    expect(extractApiKey(makeRequest({ Authorization: 'Bearer secret-key' }))).toBe('secret-key');
  });

  test('reads X-NewsMe-API-Key header', () => {
    expect(extractApiKey(makeRequest({ 'X-NewsMe-API-Key': 'secret-key' }))).toBe('secret-key');
  });

  test('returns null when neither header is present', () => {
    expect(extractApiKey(makeRequest())).toBeNull();
  });

  test('ignores malformed Authorization header (no Bearer prefix)', () => {
    expect(extractApiKey(makeRequest({ Authorization: 'secret-key' }))).toBeNull();
  });
});

describe('isAuthorizedWordPressRequest', () => {
  test('fails closed when WORDPRESS_INTEGRATION_API_KEY is not configured', () => {
    delete process.env.WORDPRESS_INTEGRATION_API_KEY;
    expect(isAuthorizedWordPressRequest(makeRequest({ Authorization: 'Bearer anything' }))).toBe(false);
  });

  test('rejects request with no API key', () => {
    process.env.WORDPRESS_INTEGRATION_API_KEY = 'correct-secret';
    expect(isAuthorizedWordPressRequest(makeRequest())).toBe(false);
  });

  test('rejects request with wrong API key', () => {
    process.env.WORDPRESS_INTEGRATION_API_KEY = 'correct-secret';
    expect(isAuthorizedWordPressRequest(makeRequest({ Authorization: 'Bearer wrong-secret' }))).toBe(false);
  });

  test('rejects a key of different length (timing-safe path)', () => {
    process.env.WORDPRESS_INTEGRATION_API_KEY = 'correct-secret';
    expect(isAuthorizedWordPressRequest(makeRequest({ Authorization: 'Bearer short' }))).toBe(false);
  });

  test('accepts request with correct API key via Authorization header', () => {
    process.env.WORDPRESS_INTEGRATION_API_KEY = 'correct-secret';
    expect(isAuthorizedWordPressRequest(makeRequest({ Authorization: 'Bearer correct-secret' }))).toBe(true);
  });

  test('accepts request with correct API key via X-NewsMe-API-Key header', () => {
    process.env.WORDPRESS_INTEGRATION_API_KEY = 'correct-secret';
    expect(isAuthorizedWordPressRequest(makeRequest({ 'X-NewsMe-API-Key': 'correct-secret' }))).toBe(true);
  });
});
