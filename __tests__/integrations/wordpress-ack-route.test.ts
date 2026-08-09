/**
 * POST /api/integrations/wordpress/articles/ack
 * WordPress confirms per-article import status back to NewsMe.
 */

jest.mock('@/lib/integrations/wordpress/auth', () => ({
  isAuthorizedWordPressRequest: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    wordpressDelivery: {
      updateMany: jest.fn(),
    },
  },
}));

import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/integrations/wordpress/articles/ack/route';

const mockAuthorized = isAuthorizedWordPressRequest as jest.Mock;
const mockUpdateMany = prisma.wordpressDelivery.updateMany as jest.Mock;

function makeRequest(body: unknown): Request {
  return new Request('https://newsme.gr/api/integrations/wordpress/articles/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer whatever' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('unauthorized request → 401', async () => {
  mockAuthorized.mockReturnValue(false);
  const res = await POST(makeRequest({ site: 'onlinepress', articles: [] }));
  expect(res.status).toBe(401);
});

describe('authorized', () => {
  beforeEach(() => mockAuthorized.mockReturnValue(true));

  test('invalid payload → 400', async () => {
    const res = await POST(makeRequest({ site: 'onlinepress' }));
    expect(res.status).toBe(400);
  });

  test('successful ack for a published article', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const res = await POST(
      makeRequest({
        site: 'onlinepress',
        articles: [{ externalId: 'article-1', status: 'published', wordpressPostId: 42, wordpressUrl: 'https://onlinepress.gr/a' }],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results).toEqual([{ externalId: 'article-1', acknowledged: true }]);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { site: 'onlinepress', articleId: 'article-1' },
      data: expect.objectContaining({ status: 'PUBLISHED', wordpressPostId: 42, wordpressUrl: 'https://onlinepress.gr/a' }),
    });
  });

  test('ack for an unknown externalId is reported but does not fail the batch', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(
      makeRequest({ site: 'onlinepress', articles: [{ externalId: 'ghost', status: 'failed', error: 'boom' }] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].acknowledged).toBe(false);
  });

  test('one bad article does not fail the rest of the batch (per-article isolation)', async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('db exploded'))
      .mockResolvedValueOnce({ count: 1 });

    const res = await POST(
      makeRequest({
        site: 'onlinepress',
        articles: [
          { externalId: 'a1', status: 'published' },
          { externalId: 'a2', status: 'published' },
          { externalId: 'a3', status: 'published' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([
      { externalId: 'a1', acknowledged: true },
      { externalId: 'a2', acknowledged: false, error: 'Internal error' },
      { externalId: 'a3', acknowledged: true },
    ]);
  });
});
