import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { computeLocalScore, getContentFiltersConfig } from '@/lib/content-filter';
import { scoreArticles } from '@/lib/ai/content-scorer';
import { generateArticleContent } from '@/lib/ai/content-generator';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, logOpenAIUsage, getMonthlyAiCosts, SERVICE } from '@/lib/monitoring/events';
import { SITE_URL } from '@/lib/seo';
import { ArticleStatus, ArticleType, DiscoveredStatus, ImageStatus, SocialPostStatus, SourceType } from '@/generated/prisma/enums';

const MODEL = 'gpt-5-mini';
const FEED_TIMEOUT_MS = 12_000;
const PIPELINE_TIMEOUT_MS = 270_000; // 4.5 min — under Vercel's 5 min max

function plog(step: string, data?: unknown) {
  console.log(`[news-pipeline] ${step}`, data ?? '');
}

function estimateReadTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function uniqueSlug(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  let slug = clean;
  let i = 0;
  while (await prisma.article.findUnique({ where: { slug } })) {
    slug = `${clean}-${++i}`;
  }
  return slug;
}

function isAllowedHour(allowedHours: number[]): boolean {
  const athensHour = parseInt(
    new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' })
      .format(new Date()),
    10
  );
  return allowedHours.includes(athensHour);
}

async function fetchFeedWithTimeout(url: string, name: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const items = await fetchFeed(url);
    clearTimeout(timer);
    return items;
  } catch (err) {
    clearTimeout(timer);
    const msg = controller.signal.aborted
      ? `timeout after ${FEED_TIMEOUT_MS}ms`
      : err instanceof Error ? err.message : 'unknown error';
    throw new Error(`[${name}] ${msg}`);
  }
}

export interface PipelineRunResult {
  ok: boolean;
  scannedFeeds: number;
  failedFeeds: number;
  rssItems: number;
  candidates: number;
  generated: number;
  rejected: number;
  facebookPosted: number;
  reason?: string;
  error?: string;
}

async function _runPipeline(): Promise<PipelineRunResult> {
  const zero = { scannedFeeds: 0, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0 };

  const [totalActiveFeeds, autoGenerationFeeds] = await Promise.all([
    prisma.rssSource.count({ where: { enabled: true } }),
    prisma.rssSource.count({ where: { enabled: true, allowAutoGeneration: true } }),
  ]);
  plog('pipeline_start', { totalActiveFeeds, autoGenerationFeeds });

  const settings = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!settings) {
    plog('pipeline_skip', { reason: 'no_settings' });
    return { ok: true, ...zero, reason: 'No settings configured' };
  }
  plog('settings_loaded', {
    isEnabled: settings.isEnabled,
    maxNewsPerDay: settings.maxNewsPerDay,
    publishMode: settings.publishMode,
    minimumImportanceScore: settings.minimumImportanceScore,
    facebookAutoPost: settings.facebookAutoPost,
  });

  if (!settings.isEnabled) {
    return { ok: true, ...zero, reason: 'Pipeline disabled' };
  }

  if (!isAllowedHour(settings.allowedPublishHours)) {
    const athensHour = parseInt(
      new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' }).format(new Date()),
      10
    );
    plog('pipeline_skip', { reason: 'outside_hours', athensHour, allowed: settings.allowedPublishHours });
    return { ok: true, ...zero, reason: `Outside allowed publish hours (now: ${athensHour}h Athens)` };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.article.count({
    where: { articleType: ArticleType.NEWS, sourceType: SourceType.RSS_SUMMARY, createdAt: { gte: todayStart } },
  });

  if (todayCount >= settings.maxNewsPerDay) {
    plog('pipeline_skip', { reason: 'daily_limit', todayCount, max: settings.maxNewsPerDay });
    return { ok: true, ...zero, reason: `Daily limit reached (${todayCount}/${settings.maxNewsPerDay})` };
  }

  const monthlyCosts = await getMonthlyAiCosts();
  if (monthlyCosts.news >= settings.dailyAiBudgetLimit * 30) {
    plog('pipeline_skip', { reason: 'budget_exceeded', monthly: monthlyCosts.news });
    return { ok: true, ...zero, reason: 'Monthly AI budget exceeded' };
  }

  const remaining = settings.maxNewsPerDay - todayCount;

  // ── 1. Load sources ────────────────────────────────────────────────────────

  const sources = await prisma.rssSource.findMany({
    where: { enabled: true, allowAutoGeneration: true },
    select: { id: true, name: true, url: true, language: true, country: true, categoryId: true },
  });
  plog('feeds_loaded', { count: sources.length, sources: sources.map((s) => s.name) });

  if (sources.length === 0) {
    return { ok: true, ...zero, reason: 'No auto-generation sources' };
  }

  // ── 2. Fetch all feeds in parallel with per-feed timeout ──────────────────

  type NewItem = {
    sourceId: string; sourceName: string; language: string;
    country: string; categoryId: string; title: string;
    url: string; excerpt: string | null; imageUrl: string | null;
  };

  const allNewItems: NewItem[] = [];
  let failedFeeds = 0;

  const feedResults = await Promise.allSettled(
    sources.map(async (source) => {
      plog('rss_fetch_start', { feed: source.name, url: source.url });
      const items = await fetchFeedWithTimeout(source.url, source.name);
      return { source, items };
    })
  );

  for (const result of feedResults) {
    if (result.status === 'rejected') {
      failedFeeds++;
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      plog('rss_fetch_error', { error: msg });
      void logEvent({ service: SERVICE.RSS, type: 'feed_fetch_error', status: 'WARNING', message: msg });
      continue;
    }

    const { source, items } = result.value;
    plog('rss_fetch_success', { feed: source.name, itemCount: items.length });

    for (const item of items.slice(0, 10)) {
      if (!item.url || !item.title) continue;
      const exists = await prisma.discoveredArticle.findUnique({ where: { url: item.url } });
      if (exists) continue;
      allNewItems.push({
        sourceId: source.id, sourceName: source.name, language: source.language,
        country: source.country, categoryId: source.categoryId,
        title: item.title, url: item.url,
        excerpt: item.excerpt ?? null, imageUrl: item.imageUrl ?? null,
      });
    }
  }

  plog('rss_items_collected', { total: allNewItems.length, failedFeeds });

  if (allNewItems.length === 0) {
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'No new items from feeds' };
  }

  // ── 3. Rule-based filter ──────────────────────────────────────────────────

  const filtersConfig = getContentFiltersConfig();
  const recentTitles = (await prisma.discoveredArticle.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 48 * 3600000) } },
    select: { title: true },
  })).map((a) => a.title);

  const filtered = allNewItems
    .map((item) => ({
      item,
      score: computeLocalScore(
        { id: item.url, title: item.title, excerpt: item.excerpt, url: item.url, categoryName: '' },
        filtersConfig,
        recentTitles
      ),
    }))
    .filter(({ score }) => !score.shouldIgnore)
    .sort((a, b) => b.score.localScore - a.score.localScore)
    .slice(0, Math.min(remaining * 3, 30));

  plog('rule_filter_done', {
    inputItems: allNewItems.length,
    afterFilter: filtered.length,
    filteredOut: allNewItems.length - filtered.length,
  });

  if (filtered.length === 0) {
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'All items filtered out by rules' };
  }

  // ── 4. AI scoring ─────────────────────────────────────────────────────────

  const toScore = filtered.slice(0, 15).map(({ item }) => ({
    id: item.url, title: item.title, excerpt: item.excerpt,
  }));

  plog('ai_scoring_start', { batch: toScore.length });
  const scores = await scoreArticles(toScore);
  const threshold = settings.minimumImportanceScore * 10;
  plog('ai_scoring_done', { scored: scores.length, threshold });

  const qualifiedItems = filtered
    .map(({ item }) => {
      const score = scores.find((s) => s.id === item.url);
      return { item, aiScore: score?.overallScore ?? 0 };
    })
    .filter(({ aiScore }) => aiScore >= threshold)
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, remaining);

  const rejected = filtered.length - qualifiedItems.length;
  plog('ai_score_filter', {
    qualified: qualifiedItems.length,
    rejected,
    topScores: qualifiedItems.slice(0, 3).map(({ item, aiScore }) => ({ title: item.title.slice(0, 60), aiScore })),
  });

  if (qualifiedItems.length === 0) {
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: filtered.length, generated: 0, rejected, facebookPosted: 0, reason: `No items passed AI score threshold (${threshold}/100)` };
  }

  // ── 5. Article generation ─────────────────────────────────────────────────

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    return { ok: false, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: filtered.length, generated: 0, rejected, facebookPosted: 0, error: 'No admin user found' };
  }

  let articlesGenerated = 0;
  let facebookPosted = 0;

  for (const { item, aiScore } of qualifiedItems) {
    if (articlesGenerated >= remaining) break;

    plog('article_generation_start', { title: item.title.slice(0, 80), source: item.sourceName, aiScore });

    try {
      const topic = item.title + (item.excerpt ? '\n\n' + item.excerpt : '') + '\n\nΠηγή: ' + item.sourceName;

      const generated = await generateArticleContent({
        topic,
        categoryName: '',
        tone: 'informative',
        articleType: 'summary',
        targetLength: 'medium',
        sourceUrl: item.url,
        sourceLanguage: item.language,
        sourceCountry: item.country,
        sourceName: item.sourceName,
        generateFacebookPost: settings.facebookAutoPost,
        generateAiCommentary: true,
      });

      void logOpenAIUsage({
        service: SERVICE.ARTICLE,
        model: MODEL,
        inputTokens: 1200,
        outputTokens: 1800,
        operation: `news-auto: ${generated.title.slice(0, 60)}`,
      });

      const slug = await uniqueSlug(generated.slug || 'article');
      const status = settings.publishMode === 'PUBLISH'
        ? ArticleStatus.PUBLISHED
        : settings.publishMode === 'APPROVED'
          ? ArticleStatus.APPROVED
          : ArticleStatus.DRAFT;

      const article = await prisma.article.create({
        data: {
          title: generated.title,
          slug,
          excerpt: generated.excerpt,
          content: generated.contentHtml,
          aiCommentary: generated.aiCommentary ?? null,
          seoTitle: generated.seoTitle ?? null,
          seoDescription: generated.seoDescription ?? null,
          status,
          articleType: ArticleType.NEWS,
          sourceType: SourceType.RSS_SUMMARY,
          categoryId: item.categoryId,
          authorId: adminUser.id,
          readTime: estimateReadTime(generated.contentHtml),
          suggestedImageUrl: item.imageUrl,
          imageStatus: item.imageUrl ? ImageStatus.RSS_AVAILABLE : ImageStatus.NONE,
          publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
        },
      });

      await prisma.aiDraft.create({
        data: { articleId: article.id, prompt: topic, rawOutput: JSON.stringify(generated), model: MODEL },
      });

      await prisma.discoveredArticle.upsert({
        where: { url: item.url },
        update: { status: DiscoveredStatus.DRAFT_CREATED },
        create: {
          sourceId: item.sourceId, title: item.title, url: item.url,
          excerpt: item.excerpt, categoryId: item.categoryId,
          status: DiscoveredStatus.DRAFT_CREATED, imageUrl: item.imageUrl,
        },
      });

      articlesGenerated++;
      plog('article_generation_done', { title: generated.title.slice(0, 80), slug, status, articleId: article.id });

      if (settings.facebookAutoPost && generated.facebookPost && status === ArticleStatus.PUBLISHED) {
        const articleUrl = `${SITE_URL}/article/${slug}`;
        const fbResult = await FacebookClient.publish({ content: generated.facebookPost, link: articleUrl });

        const socialPost = await prisma.socialPost.create({
          data: {
            articleId: article.id,
            platform: 'FACEBOOK',
            content: generated.facebookPost,
            status: fbResult.ok ? SocialPostStatus.PUBLISHED : SocialPostStatus.FAILED,
            publishedAt: fbResult.ok ? new Date() : null,
            externalPostId: fbResult.ok ? fbResult.externalId : null,
            errorMessage: fbResult.ok ? null : fbResult.error,
          },
        });

        if (fbResult.ok) {
          facebookPosted++;
          void logEvent({ service: SERVICE.FACEBOOK, type: 'auto_post', status: 'OK', message: `Auto-posted: "${generated.title}"`, metadata: { articleId: article.id, socialPostId: socialPost.id } });
        } else {
          void logEvent({ service: SERVICE.FACEBOOK, type: 'auto_post', status: 'ERROR', message: `FB post failed: ${fbResult.error}`, metadata: { articleId: article.id } });
        }
      }

      void logEvent({ service: SERVICE.ARTICLE, type: 'auto_pipeline_article', status: 'OK', message: `Created: "${generated.title}" [${status}]`, metadata: { articleId: article.id, source: item.sourceName } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      plog('article_generation_error', { title: item.title.slice(0, 60), error: msg });
      void logEvent({ service: SERVICE.ARTICLE, type: 'auto_pipeline_article', status: 'ERROR', message: `Failed for "${item.title}": ${msg}`, metadata: { url: item.url } });
    }
  }

  const result: PipelineRunResult = {
    ok: true,
    scannedFeeds: sources.length,
    failedFeeds,
    rssItems: allNewItems.length,
    candidates: filtered.length,
    generated: articlesGenerated,
    rejected,
    facebookPosted,
  };

  const donePayload = { ...result, totalActiveFeeds, autoGenerationFeeds };
  plog('pipeline_done', donePayload);
  void logEvent({
    service: SERVICE.SCHEDULER,
    type: 'news_pipeline_run',
    status: 'OK',
    message: `Pipeline done: ${articlesGenerated} generated, ${facebookPosted} FB posts · feeds: ${autoGenerationFeeds} auto / ${totalActiveFeeds} active`,
    metadata: donePayload as unknown as Record<string, unknown>,
  });

  return result;
}

export async function runNewsPipeline(): Promise<PipelineRunResult> {
  const zero = { scannedFeeds: 0, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0 };

  const timeout = new Promise<PipelineRunResult>((resolve) =>
    setTimeout(() => {
      plog('pipeline_timeout', { limitMs: PIPELINE_TIMEOUT_MS });
      resolve({ ok: false, ...zero, error: `Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s` });
    }, PIPELINE_TIMEOUT_MS)
  );

  return Promise.race([_runPipeline(), timeout]).catch((err) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    plog('pipeline_fatal', { error: msg });
    void logEvent({ service: SERVICE.SCHEDULER, type: 'news_pipeline_run', status: 'ERROR', message: `Pipeline fatal: ${msg}` });
    return { ok: false, ...zero, error: msg };
  });
}
