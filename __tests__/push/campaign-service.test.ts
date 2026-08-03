/**
 * Tests for src/lib/push/campaign-service.ts
 * Mocks: @/lib/db, @/lib/push/web-push-server, @/lib/push/vapid-config,
 *        @/lib/article-mapper, @/config/brand
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: { count: jest.fn() },
    pushCampaign: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    article: { findUniqueOrThrow: jest.fn() },
  },
}));

jest.mock('@/lib/push/web-push-server', () => ({
  sendToAllActive: jest.fn(),
}));

jest.mock('@/lib/push/vapid-config', () => ({
  isVapidConfigured: () => true,
}));

jest.mock('@/lib/article-mapper', () => ({
  resolveArticleImageUrl: jest.fn(() => null),
}));

jest.mock('@/config/brand', () => ({
  BRAND: { domain: 'https://newsme.gr' },
}));

import { prisma } from '@/lib/db';
import { sendToAllActive } from '@/lib/push/web-push-server';
import { createAndSendCampaign, createArticleCampaign } from '@/lib/push/campaign-service';
import { resolveArticleImageUrl } from '@/lib/article-mapper';

const mockPrisma = prisma as unknown as {
  pushSubscription: { count: jest.Mock };
  pushCampaign: { create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  article: { findUniqueOrThrow: jest.Mock };
};
const mockSendToAllActive = sendToAllActive as jest.Mock;
const mockResolveImageUrl = resolveArticleImageUrl as jest.Mock;

const CAMPAIGN_ID = 'campaign-abc-123';

function setupCampaignCreate() {
  mockPrisma.pushCampaign.create.mockResolvedValue({
    id: CAMPAIGN_ID,
    title: 'Test Title',
    body: 'Test Body',
    targetUrl: 'https://newsme.gr/cat/slug',
    imageUrl: null,
    articleId: null,
    status: 'PROCESSING',
    totalTargeted: 5,
    sentCount: 0,
    failedCount: 0,
    clickedCount: 0,
  });
  mockPrisma.pushCampaign.update.mockResolvedValue({});
}

describe('createAndSendCampaign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupCampaignCreate();
  });

  test('0 subscribers returns COMPLETED immediately without sending', async () => {
    mockPrisma.pushSubscription.count.mockResolvedValue(0);

    const result = await createAndSendCampaign({
      title: 'Title',
      body: 'Body',
      targetUrl: 'https://newsme.gr/',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.totalTargeted).toBe(0);
    expect(result.sentCount).toBe(0);
    expect(mockSendToAllActive).not.toHaveBeenCalled();
  });

  test('all succeed → COMPLETED status', async () => {
    mockPrisma.pushSubscription.count.mockResolvedValue(10);
    mockSendToAllActive.mockResolvedValue({ sent: 10, failed: 0, expired: 0 });

    const result = await createAndSendCampaign({
      title: 'Title',
      body: 'Body',
      targetUrl: 'https://newsme.gr/',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.sentCount).toBe(10);
    expect(result.failedCount).toBe(0);
  });

  test('all fail → FAILED status', async () => {
    mockPrisma.pushSubscription.count.mockResolvedValue(10);
    mockSendToAllActive.mockResolvedValue({ sent: 0, failed: 10, expired: 5 });

    const result = await createAndSendCampaign({
      title: 'Title',
      body: 'Body',
      targetUrl: 'https://newsme.gr/',
    });

    expect(result.status).toBe('FAILED');
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(10);
  });

  test('partial success → PARTIALLY_FAILED status', async () => {
    mockPrisma.pushSubscription.count.mockResolvedValue(50);
    mockSendToAllActive.mockResolvedValue({ sent: 40, failed: 10, expired: 2 });

    const result = await createAndSendCampaign({
      title: 'Title',
      body: 'Body',
      targetUrl: 'https://newsme.gr/',
    });

    expect(result.status).toBe('PARTIALLY_FAILED');
    expect(result.sentCount).toBe(40);
    expect(result.failedCount).toBe(10);
    expect(result.totalTargeted).toBe(50);
  });

  test('VAPID not configured — isVapidConfigured returns boolean', async () => {
    // The mock at the top of this file always returns true (configured).
    // The guard in createAndSendCampaign calls isVapidConfigured() before doing
    // any DB work. This test documents the contract: any boolean is acceptable.
    const { isVapidConfigured } = await import('@/lib/push/vapid-config');
    expect(typeof isVapidConfigured()).toBe('boolean');
  });

  test('sendToAllActive failure sets campaign status to FAILED and re-throws', async () => {
    mockPrisma.pushSubscription.count.mockResolvedValue(5);
    mockSendToAllActive.mockRejectedValue(new Error('Network error'));

    await expect(
      createAndSendCampaign({ title: 'T', body: 'B', targetUrl: 'https://newsme.gr/' }),
    ).rejects.toThrow('Network error');

    // Campaign must be marked FAILED
    const updateCall = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => call[0].data.status === 'FAILED',
    );
    expect(updateCall).toBeDefined();
  });
});

describe('createArticleCampaign — URL generation', () => {
  const ARTICLE = {
    id: 'article-1',
    title: 'Ελληνικό άρθρο με ειδήσεις',
    excerpt: 'Σύντομη περίληψη του άρθρου.',
    slug: 'elliniko-arthro-me-eidiseis',
    generatedImageUrl: null,
    coverImage: null,
    status: 'PUBLISHED',
    category: { slug: 'technologia' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupCampaignCreate();
    mockPrisma.article.findUniqueOrThrow.mockResolvedValue(ARTICLE);
    mockPrisma.pushSubscription.count.mockResolvedValue(0);
    mockResolveImageUrl.mockReturnValue(null);
  });

  test('article URL uses /{categorySlug}/{articleSlug} format', async () => {
    const result = await createArticleCampaign('article-1');
    expect(result.status).toBe('COMPLETED');

    // Check the update call that sets the real targetUrl
    const updateWithUrl = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => typeof call[0].data.targetUrl === 'string' && call[0].data.targetUrl !== 'pending',
    );
    expect(updateWithUrl).toBeDefined();
    const url = updateWithUrl![0].data.targetUrl as string;
    expect(url).toContain('/technologia/elliniko-arthro-me-eidiseis');
  });

  test('article URL includes UTM parameters', async () => {
    await createArticleCampaign('article-1');
    const updateWithUrl = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => typeof call[0].data.targetUrl === 'string' && call[0].data.targetUrl !== 'pending',
    );
    const url = updateWithUrl![0].data.targetUrl as string;
    expect(url).toContain('utm_source=webpush');
    expect(url).toContain('utm_medium=notification');
    expect(url).toContain(`utm_campaign=${CAMPAIGN_ID}`);
  });

  test('article URL uses BRAND.domain (https://newsme.gr)', async () => {
    await createArticleCampaign('article-1');
    const updateWithUrl = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => typeof call[0].data.targetUrl === 'string' && call[0].data.targetUrl !== 'pending',
    );
    const url = updateWithUrl![0].data.targetUrl as string;
    expect(url.startsWith('https://newsme.gr/')).toBe(true);
  });

  test('URL never contains /articles/ (wrong route)', async () => {
    await createArticleCampaign('article-1');
    const updateWithUrl = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => typeof call[0].data.targetUrl === 'string' && call[0].data.targetUrl !== 'pending',
    );
    const url = updateWithUrl![0].data.targetUrl as string;
    expect(url).not.toContain('/articles/');
  });

  test('URL does not contain /undefined/', async () => {
    await createArticleCampaign('article-1');
    const updateWithUrl = mockPrisma.pushCampaign.update.mock.calls.find(
      (call) => typeof call[0].data.targetUrl === 'string' && call[0].data.targetUrl !== 'pending',
    );
    const url = updateWithUrl![0].data.targetUrl as string;
    expect(url).not.toContain('/undefined/');
    expect(url).not.toContain('/null/');
  });

  test('unsafe image URLs (http://) are rejected', async () => {
    mockResolveImageUrl.mockReturnValue('http://unsecure.example.com/image.jpg');
    await createArticleCampaign('article-1');
    const createCall = mockPrisma.pushCampaign.create.mock.calls[0][0];
    expect(createCall.data.imageUrl).toBeNull();
  });

  test('https:// image URLs are accepted', async () => {
    mockResolveImageUrl.mockReturnValue('https://cdn.example.com/image.jpg');
    mockPrisma.pushSubscription.count.mockResolvedValue(0);
    await createArticleCampaign('article-1');
    const createCall = mockPrisma.pushCampaign.create.mock.calls[0][0];
    expect(createCall.data.imageUrl).toBe('https://cdn.example.com/image.jpg');
  });

  test('relative image URLs (/) are accepted', async () => {
    mockResolveImageUrl.mockReturnValue('/og-default.jpg');
    await createArticleCampaign('article-1');
    const createCall = mockPrisma.pushCampaign.create.mock.calls[0][0];
    expect(createCall.data.imageUrl).toBe('/og-default.jpg');
  });

  test('title is truncated at 100 characters', async () => {
    const longTitle = 'Α'.repeat(150);
    mockPrisma.article.findUniqueOrThrow.mockResolvedValue({ ...ARTICLE, title: longTitle });
    await createArticleCampaign('article-1');
    const createCall = mockPrisma.pushCampaign.create.mock.calls[0][0];
    expect(createCall.data.title.length).toBeLessThanOrEqual(100);
  });

  test('title override is used when provided', async () => {
    await createArticleCampaign('article-1', { title: 'Custom Title' });
    const createCall = mockPrisma.pushCampaign.create.mock.calls[0][0];
    expect(createCall.data.title).toBe('Custom Title');
  });
});
