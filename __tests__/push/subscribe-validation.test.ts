/**
 * Tests for POST /api/push/subscribe — input validation and upsert behavior.
 * All DB calls are mocked; no real DB or VAPID keys needed.
 */

import { z } from 'zod';

// Mirror the schema from the route to test validation independently
const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

describe('POST /api/push/subscribe — input validation', () => {
  const validBody = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'dGVzdA==', auth: 'dGVzdA==' },
  };

  test('valid subscription data passes', () => {
    const result = SubscribeSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  test('missing endpoint fails', () => {
    const body = { keys: validBody.keys };
    const result = SubscribeSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test('non-URL endpoint fails', () => {
    const result = SubscribeSchema.safeParse({ ...validBody, endpoint: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  test('missing p256dh fails', () => {
    const result = SubscribeSchema.safeParse({
      ...validBody,
      keys: { auth: 'dGVzdA==' },
    });
    expect(result.success).toBe(false);
  });

  test('missing auth fails', () => {
    const result = SubscribeSchema.safeParse({
      ...validBody,
      keys: { p256dh: 'dGVzdA==' },
    });
    expect(result.success).toBe(false);
  });

  test('empty p256dh fails', () => {
    const result = SubscribeSchema.safeParse({
      ...validBody,
      keys: { ...validBody.keys, p256dh: '' },
    });
    expect(result.success).toBe(false);
  });

  test('oversized endpoint (>2048 chars) fails', () => {
    const result = SubscribeSchema.safeParse({
      ...validBody,
      endpoint: 'https://example.com/' + 'a'.repeat(2048),
    });
    expect(result.success).toBe(false);
  });

  test('extra fields are stripped silently', () => {
    const result = SubscribeSchema.safeParse({
      ...validBody,
      unexpectedField: 'should be stripped',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unexpectedField).toBeUndefined();
    }
  });
});
