/**
 * Tests for src/lib/push/web-push-server.ts
 * Mocks: web-push, @/lib/db (Prisma), @/lib/push/vapid-config
 */

jest.mock('web-push');
jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));
jest.mock('@/lib/push/vapid-config', () => ({
  getVapidConfig: () => ({
    publicKey: 'test-public-key',
    privateKey: 'test-private-key',
    subject: 'mailto:test@example.com',
  }),
}));

import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { sendToSubscription, sendToAllActive } from '@/lib/push/web-push-server';

const mockWebpush = webpush as jest.Mocked<typeof webpush>;
const mockPrisma = prisma as unknown as {
  pushSubscription: {
    update: jest.Mock;
    findMany: jest.Mock;
  };
};

const PAYLOAD = {
  title: 'Test',
  body: 'Test body',
  url: 'https://newsme.gr/article',
  campaignId: 'campaign-1',
};

const SUB = {
  id: 'sub-1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'p256dh-value',
  auth: 'auth-value',
};

describe('sendToSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebpush.setVapidDetails = jest.fn();
    mockPrisma.pushSubscription.update.mockResolvedValue({});
  });

  test('successful send updates lastSuccessAt and resets failureCount', async () => {
    mockWebpush.sendNotification = jest.fn().mockResolvedValue({ statusCode: 201 } as never);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(true);
    expect(result.expired).toBe(false);
    expect(mockPrisma.pushSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCount: 0 }),
      }),
    );
    const updateCall = mockPrisma.pushSubscription.update.mock.calls[0][0];
    expect(updateCall.data.lastSuccessAt).toBeInstanceOf(Date);
  });

  test('HTTP 404 marks subscription as expired/inactive', async () => {
    const err = Object.assign(new Error('Not Found'), { statusCode: 404 });
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
    const updateCall = mockPrisma.pushSubscription.update.mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
    expect(updateCall.data.failureCount).toEqual({ increment: 1 });
  });

  test('HTTP 410 marks subscription as expired/inactive', async () => {
    const err = Object.assign(new Error('Gone'), { statusCode: 410 });
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
    const updateCall = mockPrisma.pushSubscription.update.mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
  });

  test('HTTP 429 keeps subscription active', async () => {
    const err = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(false);
    const updateCall = mockPrisma.pushSubscription.update.mock.calls[0][0];
    expect(updateCall.data.isActive).toBeUndefined(); // not deactivated
  });

  test('HTTP 500 keeps subscription active', async () => {
    const err = Object.assign(new Error('Server Error'), { statusCode: 500 });
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(false);
    const updateCall = mockPrisma.pushSubscription.update.mock.calls[0][0];
    expect(updateCall.data.isActive).toBeUndefined();
  });

  test('unknown exception produces sanitized error string', async () => {
    const err = new Error('a'.repeat(500)); // very long error
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToSubscription(SUB.id, SUB.endpoint, SUB.p256dh, SUB.auth, PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeLessThanOrEqual(200);
  });
});

describe('sendToAllActive — batch counters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebpush.setVapidDetails = jest.fn();
    mockPrisma.pushSubscription.update.mockResolvedValue({});
  });

  function makeSubs(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `sub-${i}`,
      endpoint: `https://fcm.googleapis.com/fcm/send/sub${i}`,
      p256dh: 'p',
      auth: 'a',
    }));
  }

  test('0 subscriptions returns sent=0 failed=0 expired=0', async () => {
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue([]);

    const result = await sendToAllActive(PAYLOAD);
    expect(result).toEqual({ sent: 0, failed: 0, expired: 0 });
  });

  test('all succeed: sent=N failed=0', async () => {
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue(makeSubs(3));
    mockWebpush.sendNotification = jest.fn().mockResolvedValue({} as never);

    const result = await sendToAllActive(PAYLOAD);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  });

  test('all fail: sent=0 failed=N', async () => {
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue(makeSubs(3));
    const err = Object.assign(new Error('Fail'), { statusCode: 500 });
    mockWebpush.sendNotification = jest.fn().mockRejectedValue(err);

    const result = await sendToAllActive(PAYLOAD);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(3);
  });

  test('mixed results: 40 succeed 10 fail', async () => {
    const subs = makeSubs(50);
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue(subs);

    let callCount = 0;
    mockWebpush.sendNotification = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount > 40) throw Object.assign(new Error('Fail'), { statusCode: 500 });
    });

    const result = await sendToAllActive(PAYLOAD, 50);
    expect(result.sent).toBe(40);
    expect(result.failed).toBe(10);
  });

  test('51 subscriptions are split across two batches of 50', async () => {
    const subs = makeSubs(51);
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue(subs);
    mockWebpush.sendNotification = jest.fn().mockResolvedValue({} as never);

    const result = await sendToAllActive(PAYLOAD, 50);
    expect(result.sent).toBe(51);
    expect(result.failed).toBe(0);
    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(51);
  });

  test('one failed subscription does not stop the batch', async () => {
    const subs = makeSubs(3);
    mockPrisma.pushSubscription.findMany = jest.fn().mockResolvedValue(subs);

    // Only the second subscription fails
    mockWebpush.sendNotification = jest
      .fn()
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(Object.assign(new Error('Fail'), { statusCode: 500 }))
      .mockResolvedValueOnce({} as never);

    const result = await sendToAllActive(PAYLOAD, 50);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });
});
