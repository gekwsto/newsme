/**
 * POST /api/integrations/wordpress/pipeline
 * Route-level tests: auth gating, payload validation, response contract.
 * The actual selection/generation logic lives in runWordPressPipeline and is
 * covered separately in wordpress-pipeline-service.test.ts — here it's mocked.
 */

jest.mock('@/lib/integrations/wordpress/auth', () => ({
  isAuthorizedWordPressRequest: jest.fn(),
}));

jest.mock('@/lib/integrations/wordpress/pipeline', () => ({
  runWordPressPipeline: jest.fn(),
}));

import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { runWordPressPipeline } from '@/lib/integrations/wordpress/pipeline';
import { POST } from '@/app/api/integrations/wordpress/pipeline/route';

const mockAuthorized = isAuthorizedWordPressRequest as jest.Mock;
const mockRunPipeline = runWordPressPipeline as jest.Mock;

function makeRequest(body: unknown): Request {
  return new Request('https://newsme.gr/api/integrations/wordpress/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer whatever' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('unauthorized request', () => {
  test('returns 401 without calling the pipeline', async () => {
    mockAuthorized.mockReturnValue(false);
    const res = await POST(makeRequest({ site: 'onlinepress' }));
    expect(res.status).toBe(401);
    expect(mockRunPipeline).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe('authorized requests', () => {
  beforeEach(() => {
    mockAuthorized.mockReturnValue(true);
  });

  test('invalid JSON body → 400', async () => {
    const req = new Request('https://newsme.gr/api/integrations/wordpress/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer whatever' },
      body: '{not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('invalid payload (missing site) → 400', async () => {
    const res = await POST(makeRequest({ limit: 5 }));
    expect(res.status).toBe(400);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  test('invalid payload (limit out of range) → 400', async () => {
    const res = await POST(makeRequest({ site: 'onlinepress', limit: 999 }));
    expect(res.status).toBe(400);
  });

  test('successful pipeline → 200 with normalized response contract', async () => {
    mockRunPipeline.mockResolvedValue({
      runId: 'run-abc',
      articles: [
        {
          externalId: 'article-1',
          title: 'Τίτλος',
          slug: 'titlos',
          content: '<p>Κείμενο</p>',
          excerpt: 'Περίληψη',
          category: { slug: 'politiki', name: 'Πολιτική' },
          tags: ['Κυβέρνηση'],
          featuredImage: null,
          seo: { title: 'Τίτλος', description: 'Περίληψη' },
          publishedAt: null,
        },
      ],
      stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 1 },
      status: 'ok',
    });

    const res = await POST(makeRequest({ site: 'onlinepress', limit: 5 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.runId).toBe('run-abc');
    expect(json.status).toBe('ok');
    expect(json.stats).toEqual({ discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 1 });
    expect(json.articles).toHaveLength(1);
    expect(json.articles[0]).not.toHaveProperty('id');
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ site: 'onlinepress', limit: 5 }),
    );
  });

  test('pipeline with zero articles → 200 with empty array', async () => {
    mockRunPipeline.mockResolvedValue({
      runId: 'run-empty',
      articles: [],
      stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 },
    });

    const res = await POST(makeRequest({ site: 'onlinepress' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.articles).toEqual([]);
    expect(json.stats.returned).toBe(0);
  });

  test('pipeline throwing → 500 with clean error, no internal details leaked', async () => {
    mockRunPipeline.mockRejectedValue(new Error('DATABASE_URL=postgresql://secret leaked'));
    const res = await POST(makeRequest({ site: 'onlinepress' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toContain('postgresql://');
  });

  test('surfaces a reason and an "already_running" status (not a 500) when triggerRun hits lock contention', async () => {
    mockRunPipeline.mockResolvedValue({
      runId: 'run-fallback',
      articles: [],
      stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 },
      status: 'already_running',
      reason: 'Another pipeline run is already in progress',
    });

    const res = await POST(makeRequest({ site: 'onlinepress', triggerRun: true }));
    expect(res.status).toBe(200); // clean, human-readable outcome — not a 500
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('already_running');
    expect(json.reason).toBe('Another pipeline run is already in progress');
  });

  test('omits the reason field entirely on a normal successful response', async () => {
    mockRunPipeline.mockResolvedValue({
      runId: 'run-ok',
      articles: [],
      stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 },
    });

    const res = await POST(makeRequest({ site: 'onlinepress' }));
    const json = await res.json();
    expect(json).not.toHaveProperty('reason');
  });

  test('defaults are applied (limit, categories, publishMode, triggerRun)', async () => {
    mockRunPipeline.mockResolvedValue({ runId: 'r', articles: [], stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 } });
    await POST(makeRequest({ site: 'onlinepress' }));
    expect(mockRunPipeline).toHaveBeenCalledWith({
      site: 'onlinepress',
      limit: 10,
      categories: [],
      publishMode: 'draft',
      triggerRun: false,
    });
  });
});
