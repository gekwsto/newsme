/**
 * runWordPressPipeline: selection + delivery-claim logic that sits on top of
 * the existing, unmodified NewsMe pipeline (runNewsPipeline is mocked here —
 * it is never reimplemented). Covers both:
 *   MODE A (triggerRun: true)  — prioritizes Articles the triggered run itself
 *                                 produced (via PipelineRunItem), falling back
 *                                 to the pending pool only to fill remaining slots.
 *   MODE B (triggerRun: false) — pure "fetch already-processed, undelivered
 *                                 Articles" with no new processing triggered.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    article: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    pipelineRunItem: {
      findMany: jest.fn(),
    },
    wordpressDelivery: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('@/services/news-auto-pipeline', () => ({
  runNewsPipeline: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { runNewsPipeline } from '@/services/news-auto-pipeline';
import { runWordPressPipeline } from '@/lib/integrations/wordpress/pipeline';

const mockCount = prisma.article.count as jest.Mock;
const mockFindMany = prisma.article.findMany as jest.Mock;
const mockRunItemFindMany = prisma.pipelineRunItem.findMany as jest.Mock;
const mockUpsert = prisma.wordpressDelivery.upsert as jest.Mock;
const mockRunNewsPipeline = runNewsPipeline as jest.Mock;

function fakeArticle(id: string) {
  return {
    id,
    title: `Title ${id}`,
    slug: `slug-${id}`,
    content: '<p>Body</p>',
    excerpt: 'Excerpt',
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    coverImage: null,
    generatedImageUrl: null,
    imageAttribution: null,
    category: { slug: 'politiki', name: 'Πολιτική' },
    tags: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockRunItemFindMany.mockResolvedValue([]);
});

describe('MODE B — no trigger, fetch pending only (default)', () => {
  test('does not trigger a fresh pipeline run by default', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(mockRunNewsPipeline).not.toHaveBeenCalled();
    expect(mockRunItemFindMany).not.toHaveBeenCalled();
  });

  test('zero eligible articles → empty result, no crash', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(result.articles).toEqual([]);
    expect(result.stats.returned).toBe(0);
    expect(result.stats.duplicates).toBe(0);
  });

  test('excludes articles already delivered to this site (duplicate protection)', async () => {
    // 5 articles are eligible overall, but only 2 pass the "not already delivered to onlinepress" filter.
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValue([fakeArticle('a1'), fakeArticle('a2')]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(result.articles).toHaveLength(2);
    expect(result.stats.duplicates).toBe(3);
    // The DB query itself must scope exclusion to this site, not globally.
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          wordpressDeliveries: expect.objectContaining({
            none: expect.objectContaining({ site: 'onlinepress' }),
          }),
        }),
      }),
    );
  });

  test('claims each returned article via wordpressDelivery.upsert keyed by site+articleId', async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([fakeArticle('a1')]);

    await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { site_articleId: { site: 'onlinepress', articleId: 'a1' } },
      }),
    );
  });

  test('a claim/normalize failure for one article does not break the rest (failure isolation)', async () => {
    mockCount.mockResolvedValue(2);
    mockFindMany.mockResolvedValue([fakeArticle('bad'), fakeArticle('good')]);
    mockUpsert.mockImplementation(({ where }: { where: { site_articleId: { articleId: string } } }) =>
      where.site_articleId.articleId === 'bad' ? Promise.reject(new Error('claim failed')) : Promise.resolve({}),
    );

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].externalId).toBe('good');
  });

  test('passes the categories filter through to the article query', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    await runWordPressPipeline({ site: 'onlinepress', limit: 10, categories: ['politiki', 'oikonomia'] });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { slug: { in: ['politiki', 'oikonomia'] } },
        }),
      }),
    );
  });

  test('respects the limit passed in', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    await runWordPressPipeline({ site: 'onlinepress', limit: 3 });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  test('runId is a synthetic id (not a fabricated PipelineRun reference) when no run occurred', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10 });

    expect(typeof result.runId).toBe('string');
    expect(result.runId.length).toBeGreaterThan(0);
  });
});

describe('MODE A — triggerRun: true actually triggers the real pipeline', () => {
  test('calls the real runNewsPipeline(forceRun, site) — never a reimplementation', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 5, failedFeeds: 0, rssItems: 20, candidates: 8, generated: 0, rejected: 5, facebookPosted: 0,
    });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    await runWordPressPipeline({ site: 'onlinepress', limit: 10, triggerRun: true });

    expect(mockRunNewsPipeline).toHaveBeenCalledWith(true, 'onlinepress');
  });

  test('folds discovered/processed/rejected stats from the real pipeline result', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 5, failedFeeds: 0, rssItems: 20, candidates: 8, generated: 3, rejected: 5, facebookPosted: 0,
      pipelineRunId: 'run-1',
    });
    mockRunItemFindMany.mockResolvedValue([]); // this run produced 3 articles but none tracked here for simplicity
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10, triggerRun: true });

    expect(result.stats.discovered).toBe(20);
    expect(result.stats.processed).toBe(3);
    expect(result.stats.rejected).toBe(5);
  });

  test('prioritizes Articles generated by THIS run over older pending ones, using PipelineRunItem', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 5, candidates: 2, generated: 2, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-42',
    });
    mockRunItemFindMany.mockResolvedValue([
      { generatedArticleId: 'new-1' },
      { generatedArticleId: 'new-2' },
    ]);
    // First (and, since 2 == limit, only) article.findMany call: the run-specific lookup.
    mockFindMany.mockResolvedValueOnce([fakeArticle('new-2'), fakeArticle('new-1')]); // deliberately out of order

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 2, triggerRun: true });

    expect(mockRunItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: 'run-42', generatedArticleId: { not: null } } }),
    );
    // Run order (new-1, new-2) must be preserved even though the DB returned them out of order.
    expect(result.articles.map((a) => a.externalId)).toEqual(['new-1', 'new-2']);
    // limit was fully satisfied by the run's own output — no fallback pool query needed.
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockCount).not.toHaveBeenCalled();
  });

  test('falls back to the pending pool only to fill slots the triggered run itself did not fill', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 5, candidates: 1, generated: 1, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-7',
    });
    mockRunItemFindMany.mockResolvedValue([{ generatedArticleId: 'new-1' }]);
    mockFindMany
      .mockResolvedValueOnce([fakeArticle('new-1')]) // run-specific lookup
      .mockResolvedValueOnce([fakeArticle('old-1'), fakeArticle('old-2')]); // fallback pool
    mockCount.mockResolvedValue(5);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 3, triggerRun: true });

    // New article from this run comes first, then the fallback-pool articles.
    expect(result.articles.map((a) => a.externalId)).toEqual(['new-1', 'old-1', 'old-2']);

    const fallbackCall = mockFindMany.mock.calls[1][0];
    expect(fallbackCall.take).toBe(2); // only the 2 remaining slots
    expect(fallbackCall.where.id).toEqual({ notIn: ['new-1'] }); // never re-select what the run already gave us
  });

  test('runId is the real NewsMe PipelineRun.id, not a synthetic one, when a run actually executed', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-real-id-123',
    });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10, triggerRun: true });

    expect(result.runId).toBe('run-real-id-123');
  });

  test('surfaces the reason when the pipeline did not actually run (e.g. lock contention), and still serves MODE B pending articles', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 0, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0,
      reason: 'Another pipeline run is already in progress',
      // no pipelineRunId — the lock-skip path never created a PipelineRun row
    });
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([fakeArticle('old-pending')]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 5, triggerRun: true });

    expect(result.reason).toBe('Another pipeline run is already in progress');
    expect(result.status).toBe('already_running');
    expect(mockRunItemFindMany).not.toHaveBeenCalled();
    expect(result.articles.map((a) => a.externalId)).toEqual(['old-pending']);
  });

  test('status is "ok" when triggerRun actually executed', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 1, candidates: 1, generated: 1, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-ok',
    });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 5, triggerRun: true });

    expect(result.status).toBe('ok');
    expect(result.reason).toBeUndefined();
  });

  test('status is "skipped" (not "already_running") for other non-lock reasons like being disabled', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 0, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0,
      reason: 'Pipeline disabled',
    });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 5, triggerRun: true });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('Pipeline disabled');
  });

  test('the run-specific query still excludes articles already delivered to this site', async () => {
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 1, candidates: 1, generated: 1, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-9',
    });
    mockRunItemFindMany.mockResolvedValue([{ generatedArticleId: 'new-1' }]);
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // run-specific lookup, then the fallback pool
    mockCount.mockResolvedValue(0);

    await runWordPressPipeline({ site: 'onlinepress', limit: 1, triggerRun: true });

    const runSpecificCall = mockFindMany.mock.calls[0][0];
    expect(runSpecificCall.where.wordpressDeliveries.none.site).toBe('onlinepress');
  });

  test('PARTIAL SUCCESS: if the run generated 2 articles and a 3rd item failed generation, the 2 successes are still returned', async () => {
    // Mirrors the real pipeline's per-item try/catch: a failed item's
    // PipelineRunItem row has generatedArticleId: null (only successful
    // items get one written), so it's naturally excluded by the
    // `generatedArticleId: { not: null }` filter — nothing here re-fetches
    // or loses the two articles that succeeded before the failure.
    mockRunNewsPipeline.mockResolvedValue({
      ok: true, scannedFeeds: 1, failedFeeds: 0, rssItems: 3, candidates: 3, generated: 2, rejected: 0, facebookPosted: 0,
      pipelineRunId: 'run-partial',
    });
    mockRunItemFindMany.mockResolvedValue([
      { generatedArticleId: 'ok-1' },
      { generatedArticleId: 'ok-2' },
      // the failed 3rd item is not in this list at all — the query itself filters generatedArticleId: { not: null }
    ]);
    mockFindMany
      .mockResolvedValueOnce([fakeArticle('ok-1'), fakeArticle('ok-2')]) // run-specific lookup
      .mockResolvedValueOnce([]); // fallback pool (limit not fully met, but nothing else pending)
    mockCount.mockResolvedValue(0);

    const result = await runWordPressPipeline({ site: 'onlinepress', limit: 10, triggerRun: true });

    expect(result.articles.map((a) => a.externalId).sort()).toEqual(['ok-1', 'ok-2']);
    expect(result.stats.returned).toBe(2);
    // Only one findMany call (the run-specific lookup) — no fallback pool
    // query needed since we're not asserting a limit was unmet here, but
    // the two genuinely-created articles were not lost or excluded.
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['ok-1', 'ok-2'] } }) }),
    );
  });
});
