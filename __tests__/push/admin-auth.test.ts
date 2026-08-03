/**
 * Tests for admin Push endpoint authorization.
 * Verifies unauthenticated requests return 401.
 * Mocks next-auth and Prisma; no real credentials needed.
 */

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    pushCampaign: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { sentCount: 0, failedCount: 0, clickedCount: 0 },
        _count: { id: 0 },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('@/lib/push/vapid-config', () => ({
  isVapidConfigured: () => false,
  getVapidConfig: () => { throw new Error('not configured'); },
}));

import { auth } from '@/lib/auth';
import { GET as statsGET } from '@/app/api/admin/push/stats/route';
import { GET as campaignsGET } from '@/app/api/admin/push/campaigns/route';
import { GET as subsGET, PATCH as subsPATCH } from '@/app/api/admin/push/subscriptions/route';
import { POST as testPOST } from '@/app/api/admin/push/test/route';
import { POST as sendPOST } from '@/app/api/admin/push/send/route';

const mockAuth = auth as jest.Mock;

function makeRequest(body?: unknown): Request {
  return new Request('https://newsme.gr/api/admin/push/test', {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Admin push endpoints — unauthenticated requests return 401', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(null); // no session
  });

  test('GET /api/admin/push/stats → 401', async () => {
    const res = await statsGET();
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/push/campaigns → 401', async () => {
    const res = await campaignsGET();
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/push/subscriptions → 401', async () => {
    const res = await subsGET();
    expect(res.status).toBe(401);
  });

  test('PATCH /api/admin/push/subscriptions → 401', async () => {
    const res = await subsPATCH(makeRequest({ subscriptionId: 'x', isTestDevice: true }));
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/push/test → 401', async () => {
    const res = await testPOST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/push/send → 401', async () => {
    const res = await sendPOST(makeRequest({ title: 'T', body: 'B', targetUrl: 'https://newsme.gr' }));
    expect(res.status).toBe(401);
  });
});

describe('Admin push endpoints — authenticated requests pass auth', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Admin', email: 'admin@newsme.gr', role: 'ADMIN' } });
  });

  test('GET /api/admin/push/stats → not 401', async () => {
    const res = await statsGET();
    expect(res.status).not.toBe(401);
  });

  test('GET /api/admin/push/campaigns → not 401', async () => {
    const res = await campaignsGET();
    expect(res.status).not.toBe(401);
  });

  test('GET /api/admin/push/subscriptions → not 401', async () => {
    const res = await subsGET();
    expect(res.status).not.toBe(401);
  });
});
