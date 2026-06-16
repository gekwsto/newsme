'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { generateArticleContent } from '@/lib/ai/content-generator';
import { scoreArticles } from '@/lib/ai/content-scorer';
import { clusterArticles, calcTrendScore } from '@/lib/ai/trend-clusterer';
import { getEditorialConfig } from '@/lib/editorial-config';
import { getContentFiltersConfig, computeLocalScore } from '@/lib/content-filter';
import { logEvent, SERVICE } from '@/lib/monitoring/events';
import { ArticleStatus, SourceType, SocialPostStatus, DiscoveredStatus } from '@/generated/prisma/enums';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Δεν είσαι συνδεδεμένος');
  return session.user;
}

async function resolveSuggestedCategory(
  suggestedCategory: string | undefined,
  fallbackId: string
): Promise<string> {
  if (!suggestedCategory) return fallbackId;
  const cat = await prisma.category.findFirst({
    where: { name: suggestedCategory },
    select: { id: true },
  });
  return cat?.id ?? fallbackId;
}

function estimateReadTime(html: string): number {
  const wordCount = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

async function uniqueSlug(base: string): Promise<string> {
  const safe = base.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'article';
  const existing = await prisma.article.findUnique({ where: { slug: safe } });
  if (!existing) return safe;
  let suffix = 2;
  while (true) {
    const candidate = `${safe}-${suffix}`;
    if (!(await prisma.article.findUnique({ where: { slug: candidate } }))) return candidate;
    suffix++;
  }
}

// ─── Scoring helpers ───────────────────────────────────────────────────────────

async function _scoreAndSave(
  articles: { id: string; title: string; excerpt: string | null }[]
): Promise<void> {
  if (articles.length === 0) return;
  const scores = await scoreArticles(articles);
  const config = getEditorialConfig();

  // Fetch source metadata for GR/EL bonus
  const articleIds = articles.map((a) => a.id);
  const sourceMap = new Map<string, { language: string; country: string }>();
  const discovered = await prisma.discoveredArticle.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, source: { select: { language: true, country: true } } },
  });
  for (const d of discovered) {
    sourceMap.set(d.id, { language: d.source.language, country: d.source.country });
  }

  let filtered = 0;
  for (const s of scores) {
    const scoreData = {
      greekInterestScore: s.greekInterestScore,
      searchPotentialScore: s.searchPotentialScore,
      facebookClickScore: s.facebookClickScore,
      evergreenScore: s.evergreenScore,
      overallScore: s.overallScore,
      rejected: s.rejected,
      rejectReason: s.rejectReason || null,
      reasoning: s.reasoning || null,
    };

    await prisma.contentScore.upsert({
      where: { discoveredArticleId: s.id },
      create: { discoveredArticleId: s.id, ...scoreData },
      update: { ...scoreData, scoredAt: new Date() },
    });

    // Auto-filter: ignore if AI rejected or score too low on all dimensions
    if (config.autoFilterEnabled) {
      const t = config.autoFilterThresholds;
      const fails =
        s.rejected ||
        (s.overallScore < t.overallScore &&
          s.greekInterestScore < t.greekInterestScore &&
          s.facebookClickScore < t.facebookClickScore);
      if (fails) {
        await prisma.discoveredArticle.updateMany({
          where: { id: s.id, status: DiscoveredStatus.NEW },
          data: { status: DiscoveredStatus.IGNORED },
        });
        filtered++;
      }
    }
  }

  void logEvent({
    service: SERVICE.SCORING,
    type: 'batch_score',
    status: 'OK',
    message: `Scored ${scores.length} articles, auto-filtered ${filtered}`,
    metadata: { count: scores.length, filtered },
  });
}

// ─── Clustering helpers ────────────────────────────────────────────────────────

async function _clusterAndSave(): Promise<number> {
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const articles = await prisma.discoveredArticle.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      title: true,
      excerpt: true,
      sourceId: true,
      source: { select: { name: true } },
      score: { select: { overallScore: true, facebookClickScore: true } },
    },
    take: 80,
    orderBy: { createdAt: 'desc' },
  });

  if (articles.length < 2) return 0;

  const clusters = await clusterArticles(
    articles.map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      sourceName: a.source.name,
      viralScore: a.score?.overallScore ?? 0,
    }))
  );

  if (clusters.length === 0) return 0;

  // Reset cluster assignments for this window before re-assigning
  await prisma.discoveredArticle.updateMany({
    where: { id: { in: articles.map((a) => a.id) } },
    data: { clusterId: null, clusterPrimary: false },
  });

  for (const cluster of clusters) {
    const clusterArticles = articles.filter((a) => cluster.articleIds.includes(a.id));
    const sourceCount = new Set(clusterArticles.map((a) => a.sourceId)).size;
    const avgViral =
      clusterArticles.reduce((s, a) => s + (a.score?.overallScore ?? 0), 0) /
      Math.max(clusterArticles.length, 1);
    const now = new Date();
    const trendScore = calcTrendScore({
      articleCount: clusterArticles.length,
      sourceCount,
      lastSeenAt: now,
      avgViralScore: avgViral,
    });

    const existing = await prisma.trendCluster.findFirst({
      where: {
        topic: cluster.topic,
        firstSeenAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    let clusterId: string;
    if (existing) {
      await prisma.trendCluster.update({
        where: { id: existing.id },
        data: { articleCount: clusterArticles.length, sourceCount, trendScore, lastSeenAt: now },
      });
      clusterId = existing.id;
    } else {
      const created = await prisma.trendCluster.create({
        data: { topic: cluster.topic, articleCount: clusterArticles.length, sourceCount, trendScore },
      });
      clusterId = created.id;
    }

    for (const articleId of cluster.articleIds) {
      await prisma.discoveredArticle.update({
        where: { id: articleId },
        data: { clusterId, clusterPrimary: articleId === cluster.primaryArticleId },
      });
    }
  }

  void logEvent({
    service: SERVICE.CLUSTERING,
    type: 'cluster_run',
    status: 'OK',
    message: `Clustered ${articles.length} articles into ${clusters.length} topics`,
    metadata: { articleCount: articles.length, clusterCount: clusters.length },
  });

  return clusters.length;
}

// ─── Internal fetch logic ──────────────────────────────────────────────────────

async function _fetchSource(sourceId: string): Promise<{ newCount: number; totalCount: number }> {
  const source = await prisma.rssSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: { id: true, url: true, categoryId: true },
  });

  const items = await fetchFeed(source.url);
  if (items.length === 0) {
    await prisma.rssSource.update({ where: { id: sourceId }, data: { lastFetchedAt: new Date() } });
    return { newCount: 0, totalCount: 0 };
  }

  const urls = items.map((i) => i.url);
  const existing = await prisma.discoveredArticle.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((e) => e.url));
  const newItems = items.filter((i) => !existingUrls.has(i.url));

  if (newItems.length > 0) {
    await prisma.discoveredArticle.createMany({
      data: newItems.map((item) => ({
        sourceId: source.id,
        title: item.title,
        url: item.url,
        excerpt: item.excerpt || null,
        publishedAt: item.publishedAt,
        categoryId: source.categoryId,
        imageUrl: item.imageUrl || null,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.rssSource.update({
    where: { id: sourceId },
    data: { lastFetchedAt: new Date() },
  });

  return { newCount: newItems.length, totalCount: items.length };
}

// ─── Public server actions ─────────────────────────────────────────────────────

export type FetchResult =
  | { ok: true; newCount: number; totalCount: number }
  | { ok: false; error: string };

export async function fetchSourceNow(sourceId: string): Promise<FetchResult> {
  try {
    await requireAuth();
    const result = await _fetchSource(sourceId);
    revalidatePath('/admin/news-discovery');
    revalidatePath('/admin/sources');
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

export type FetchAllResult =
  | { ok: true; results: Array<{ sourceName: string; newCount: number; error?: string }>; scored: number; preFiltered: number; clustered: number }
  | { ok: false; error: string };

export async function fetchAllSources(): Promise<FetchAllResult> {
  try {
    await requireAuth();

    const sources = await prisma.rssSource.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const settled = await Promise.allSettled(
      sources.map((s) => _fetchSource(s.id).then((r) => ({ sourceName: s.name, newCount: r.newCount })))
    );

    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { sourceName: sources[i].name, newCount: 0, error: r.reason?.message ?? 'Error' }
    );

    const totalNew = results.reduce((s, r) => s + r.newCount, 0);
    const errorCount = results.filter((r) => 'error' in r && r.error).length;
    void logEvent({
      service: SERVICE.RSS,
      type: 'fetch_all',
      status: errorCount > 0 ? 'WARNING' : 'OK',
      message: `Fetched ${sources.length} sources — ${totalNew} new articles${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
      metadata: { sourceCount: sources.length, totalNew, errorCount },
    });

    // Pre-filter then score
    let scored = 0;
    let preFiltered = 0;
    try {
      const filtersConfig = getContentFiltersConfig();

      // Fetch unscored articles with category info for pre-filter
      const unscored = await prisma.discoveredArticle.findMany({
        where: { score: null, status: DiscoveredStatus.NEW },
        select: {
          id: true,
          title: true,
          excerpt: true,
          url: true,
          category: { select: { name: true } },
        },
      });

      if (unscored.length > 0) {
        // Existing titles in last 48h for duplicate detection
        const recentTitles = await prisma.discoveredArticle.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 48 * 3600000) },
            id: { notIn: unscored.map((a) => a.id) },
          },
          select: { title: true },
        });
        const existingTitles = recentTitles.map((a) => a.title);

        // Compute localScore for every unscored article
        const filterResults = unscored.map((a) =>
          computeLocalScore(
            { id: a.id, title: a.title, excerpt: a.excerpt, url: a.url, categoryName: a.category.name },
            filtersConfig,
            existingTitles
          )
        );

        // Persist localScore + filteredReason, mark ignored
        for (const r of filterResults) {
          await prisma.discoveredArticle.update({
            where: { id: r.id },
            data: {
              localScore: r.localScore,
              filteredReason: r.filteredReason,
              ...(r.shouldIgnore ? { status: DiscoveredStatus.IGNORED } : {}),
            },
          });
        }

        preFiltered = filterResults.filter((r) => r.shouldIgnore).length;

        // Send only top-N by localScore to OpenAI (batch limit)
        const toScore = filterResults
          .filter((r) => !r.shouldIgnore)
          .sort((a, b) => b.localScore - a.localScore)
          .slice(0, filtersConfig.maxBatchSize)
          .map((r) => unscored.find((a) => a.id === r.id)!)
          .filter(Boolean);

        if (toScore.length > 0) {
          await _scoreAndSave(toScore);
          scored = toScore.length;
        }

        void logEvent({
          service: SERVICE.SCORING,
          type: 'pre_filter',
          status: 'OK',
          message: `Pre-filter: ${preFiltered}/${unscored.length} skipped before AI (${scored} sent to OpenAI)`,
          metadata: { total: unscored.length, preFiltered, sentToAI: scored },
        });
      }
    } catch (err) {
      console.warn('[rss] pre-filter/scoring failed:', err instanceof Error ? err.message : err);
    }

    // Cluster recent articles when there are new items
    let clustered = 0;
    if (totalNew >= 2) {
      try {
        clustered = await _clusterAndSave();
      } catch (err) {
        console.warn('[rss] clustering failed:', err instanceof Error ? err.message : err);
      }
    }

    revalidatePath('/admin/news-discovery');
    revalidatePath('/admin/sources');

    return { ok: true, results, scored, preFiltered, clustered };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

export type ToggleResult = { ok: true } | { ok: false; error: string };

export async function toggleRssSource(sourceId: string, enabled: boolean): Promise<ToggleResult> {
  try {
    await requireAuth();
    await prisma.rssSource.update({ where: { id: sourceId }, data: { enabled } });
    revalidatePath('/admin/sources');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

export type ScoreUnscoredResult = { ok: true; scored: number } | { ok: false; error: string };

export async function scoreUnscoredArticles(): Promise<ScoreUnscoredResult> {
  try {
    await requireAuth();
    const unscored = await prisma.discoveredArticle.findMany({
      where: { score: null },
      select: { id: true, title: true, excerpt: true },
      take: 50,
    });
    if (unscored.length === 0) return { ok: true, scored: 0 };
    await _scoreAndSave(unscored);
    revalidatePath('/admin/news-discovery');
    return { ok: true, scored: unscored.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

export type GenerateFromDiscoveredResult =
  | { ok: true; articleId: string; title: string }
  | { ok: false; error: string };

export async function generateDraftFromDiscoveredArticle(
  discoveredId: string
): Promise<GenerateFromDiscoveredResult> {
  try {
    const user = await requireAuth();

    const discovered = await prisma.discoveredArticle.findUniqueOrThrow({
      where: { id: discoveredId },
      include: {
        category: { select: { id: true, name: true } },
        source: { select: { name: true, language: true, country: true } },
      },
    });

    if (discovered.status !== DiscoveredStatus.NEW) {
      return { ok: false, error: 'Το άρθρο έχει ήδη επεξεργαστεί' };
    }

    const topic =
      discovered.title +
      (discovered.excerpt ? '\n\n' + discovered.excerpt : '') +
      '\n\nΠηγή: ' + discovered.source.name;

    const generated = await generateArticleContent({
      topic,
      categoryName: discovered.category.name,
      tone: 'informative',
      articleType: 'summary',
      targetLength: 'medium',
      sourceUrl: discovered.url,
      sourceLanguage: discovered.source.language,
      sourceCountry: discovered.source.country,
      sourceName: discovered.source.name,
      generateFacebookPost: true,
      generateAiCommentary: true,
    });

    const slug = await uniqueSlug(generated.slug || 'article');
    const categoryId = await resolveSuggestedCategory(generated.suggestedCategory, discovered.categoryId);

    const hasRssImage = Boolean(discovered.imageUrl);
    const article = await prisma.article.create({
      data: {
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.contentHtml,
        aiCommentary: generated.aiCommentary || null,
        seoTitle: generated.seoTitle || null,
        seoDescription: generated.seoDescription || null,
        status: ArticleStatus.PENDING_APPROVAL,
        sourceType: SourceType.RSS_SUMMARY,
        categoryId,
        authorId: user.id,
        readTime: estimateReadTime(generated.contentHtml),
        suggestedImageUrl: discovered.imageUrl || null,
        imageStatus: hasRssImage ? 'RSS_AVAILABLE' : 'NONE',
      },
    });

    await prisma.aiDraft.create({
      data: {
        articleId: article.id,
        prompt: topic,
        rawOutput: JSON.stringify(generated),
        model: 'gpt-4o',
        imagePrompt: generated.imagePrompt || null,
      },
    });

    if (generated.facebookPost) {
      const socialPost = await prisma.socialPost.create({
        data: {
          articleId: article.id,
          platform: 'FACEBOOK',
          content: generated.facebookPost,
          status: SocialPostStatus.DRAFT,
        },
      });

      // Store performance predictions from ContentScore
      const discoveredWithScore = await prisma.discoveredArticle.findUnique({
        where: { id: discoveredId },
        select: { score: true },
      });
      const score = discoveredWithScore?.score;
      if (score) {
        await prisma.postPerformance.create({
          data: {
            socialPostId: socialPost.id,
            predictedReach: score.facebookClickScore,
            predictedComments: score.overallScore,
            predictedShares: score.overallScore,
          },
        });
      }
    }

    for (const tagName of generated.tags) {
      const trimmed = tagName.trim();
      if (!trimmed) continue;
      const tag = await prisma.tag.upsert({
        where: { name: trimmed },
        update: {},
        create: { name: trimmed },
      });
      await prisma.articleTag.upsert({
        where: { articleId_tagId: { articleId: article.id, tagId: tag.id } },
        update: {},
        create: { articleId: article.id, tagId: tag.id },
      });
    }

    await prisma.discoveredArticle.update({
      where: { id: discoveredId },
      data: { status: DiscoveredStatus.DRAFT_CREATED },
    });

    revalidatePath('/admin/news-discovery');
    revalidatePath('/admin/approvals');

    void logEvent({
      service: SERVICE.ARTICLE,
      type: 'draft_created',
      status: 'OK',
      message: `Draft created: "${generated.title}"`,
      metadata: { articleId: article.id, discoveredId, source: discovered.source.name },
    });

    return { ok: true, articleId: article.id, title: generated.title };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    console.error('[generateDraftFromDiscoveredArticle]', err);
    void logEvent({
      service: SERVICE.ARTICLE,
      type: 'draft_created',
      status: 'ERROR',
      message: `Draft creation failed: ${message}`,
      metadata: { discoveredId },
    });
    return { ok: false, error: message };
  }
}

export type IgnoreResult = { ok: true } | { ok: false; error: string };

export async function ignoreDiscoveredArticle(discoveredId: string): Promise<IgnoreResult> {
  try {
    await requireAuth();
    await prisma.discoveredArticle.update({
      where: { id: discoveredId },
      data: { status: DiscoveredStatus.IGNORED },
    });
    revalidatePath('/admin/news-discovery');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Source CRUD ──────────────────────────────────────────────────────────────

type SourceData = {
  name: string;
  url: string;
  categoryId: string;
  language: string;
  country: string;
  reliabilityScore: number;
  feedSourceType: string;
  enabled?: boolean;
  allowAutoGeneration?: boolean;
};

export type SourceMutationResult = { ok: true; id: string } | { ok: false; error: string };

export async function addRssSource(data: SourceData): Promise<SourceMutationResult> {
  try {
    await requireAuth();
    const source = await prisma.rssSource.create({
      data: {
        name: data.name.trim(),
        url: data.url.trim(),
        categoryId: data.categoryId,
        language: data.language,
        country: data.country,
        reliabilityScore: data.reliabilityScore,
        feedSourceType: data.feedSourceType,
        enabled: data.enabled ?? true,
      },
    });
    revalidatePath('/admin/sources');
    return { ok: true, id: source.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Σφάλμα';
    if (msg.includes('Unique constraint') || msg.includes('unique')) {
      return { ok: false, error: 'Αυτό το URL υπάρχει ήδη' };
    }
    return { ok: false, error: msg };
  }
}

export async function updateRssSource(
  id: string,
  data: Partial<SourceData>
): Promise<SourceMutationResult> {
  try {
    await requireAuth();
    await prisma.rssSource.update({ where: { id }, data });
    revalidatePath('/admin/sources');
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function deleteRssSource(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAuth();
    await prisma.rssSource.delete({ where: { id } });
    revalidatePath('/admin/sources');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export type TestFeedResult =
  | { ok: true; itemCount: number; sampleTitles: string[] }
  | { ok: false; error: string };

export async function testRssFeed(url: string): Promise<TestFeedResult> {
  try {
    await requireAuth();
    const items = await fetchFeed(url.trim());
    return {
      ok: true,
      itemCount: items.length,
      sampleTitles: items.slice(0, 3).map((i) => i.title),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Αδύνατη η ανάγνωση του feed' };
  }
}
