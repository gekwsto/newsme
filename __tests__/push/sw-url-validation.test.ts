/**
 * Tests for Service Worker URL validation logic.
 * The SW runs in a browser context — we simulate SITE_ORIGIN using jsdom's URL.
 */

const SITE_ORIGIN = 'https://newsme.gr';

// Replicate SW helper functions for isolated testing
function validateSameOriginUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url, SITE_ORIGIN);
    if (parsed.origin !== SITE_ORIGIN) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function isHttpsUrl(url: unknown): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

describe('validateSameOriginUrl', () => {
  test('relative URL resolves to same origin', () => {
    expect(validateSameOriginUrl('/')).toBe('https://newsme.gr/');
    expect(validateSameOriginUrl('/technologia/some-article')).toBe(
      'https://newsme.gr/technologia/some-article',
    );
  });

  test('absolute same-origin URL is accepted', () => {
    expect(validateSameOriginUrl('https://newsme.gr/technologia/article')).toBe(
      'https://newsme.gr/technologia/article',
    );
  });

  test('external URL is rejected', () => {
    expect(validateSameOriginUrl('https://evil.com/malware')).toBeNull();
    expect(validateSameOriginUrl('https://google.com')).toBeNull();
  });

  test('javascript: URL is rejected', () => {
    expect(validateSameOriginUrl('javascript:alert(1)')).toBeNull();
  });

  test('data: URL is rejected', () => {
    expect(validateSameOriginUrl('data:text/html,<h1>test</h1>')).toBeNull();
  });

  test('null is rejected', () => {
    expect(validateSameOriginUrl(null)).toBeNull();
  });

  test('undefined is rejected', () => {
    expect(validateSameOriginUrl(undefined)).toBeNull();
  });

  test('empty string is rejected', () => {
    expect(validateSameOriginUrl('')).toBeNull();
  });

  test('number is rejected', () => {
    expect(validateSameOriginUrl(42)).toBeNull();
  });

  test('URL with different subdomain is rejected', () => {
    expect(validateSameOriginUrl('https://admin.newsme.gr/')).toBeNull();
  });

  test('URL with UTM params is accepted if same origin', () => {
    const url =
      'https://newsme.gr/technologia/article?utm_source=webpush&utm_medium=notification&utm_campaign=abc';
    expect(validateSameOriginUrl(url)).toBe(url);
  });

  test('Greek slug URL is accepted', () => {
    const url = '/τεχνολογία/κάποιο-άρθρο';
    const result = validateSameOriginUrl(url);
    // Should resolve to same origin
    expect(result).not.toBeNull();
    expect(result!.startsWith(SITE_ORIGIN)).toBe(true);
  });
});

describe('isHttpsUrl', () => {
  test('https:// URL returns true', () => {
    expect(isHttpsUrl('https://cdn.example.com/image.jpg')).toBe(true);
  });

  test('http:// URL returns false', () => {
    expect(isHttpsUrl('http://insecure.com/image.jpg')).toBe(false);
  });

  test('relative URL returns false', () => {
    expect(isHttpsUrl('/og-default.jpg')).toBe(false);
  });

  test('null returns false', () => {
    expect(isHttpsUrl(null)).toBe(false);
  });

  test('empty string returns false', () => {
    expect(isHttpsUrl('')).toBe(false);
  });

  test('malformed URL returns false', () => {
    expect(isHttpsUrl('not-a-url')).toBe(false);
  });
});
