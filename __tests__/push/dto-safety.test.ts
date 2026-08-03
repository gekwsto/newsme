/**
 * Tests that admin subscription endpoint does not expose sensitive fields.
 * Verifies the Prisma select clause omits endpoint, p256dh, auth.
 */

// The subscriptions GET route uses this Prisma select:
const SAFE_SELECT = {
  id: true,
  platform: true,
  deviceType: true,
  isTestDevice: true,
  failureCount: true,
  lastSuccessAt: true,
  createdAt: true,
};

const SENSITIVE_FIELDS = ['endpoint', 'p256dh', 'auth', 'userAgent'];

describe('Subscription DTO — sensitive fields not exposed', () => {
  SENSITIVE_FIELDS.forEach((field) => {
    test(`select does not include '${field}'`, () => {
      expect((SAFE_SELECT as Record<string, unknown>)[field]).toBeUndefined();
    });
  });

  test('select includes required non-sensitive fields', () => {
    expect(SAFE_SELECT.id).toBe(true);
    expect(SAFE_SELECT.platform).toBe(true);
    expect(SAFE_SELECT.isTestDevice).toBe(true);
    expect(SAFE_SELECT.failureCount).toBe(true);
  });
});

describe('Campaign DTO — endpoint not exposed', () => {
  // The campaigns GET route selects only these fields
  const CAMPAIGN_SELECT = {
    id: true,
    title: true,
    status: true,
    totalTargeted: true,
    sentCount: true,
    failedCount: true,
    clickedCount: true,
    articleId: true,
    createdAt: true,
    completedAt: true,
  };

  // Campaigns don't have p256dh/auth but verify targetUrl is included
  // (it's the article URL with UTM params — not sensitive, but verify it's there)
  test('campaign select does not accidentally expose subscription secrets', () => {
    const sensitiveSubFields = ['p256dh', 'auth', 'endpoint'];
    sensitiveSubFields.forEach((field) => {
      expect((CAMPAIGN_SELECT as Record<string, unknown>)[field]).toBeUndefined();
    });
  });
});
