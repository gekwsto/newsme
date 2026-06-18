import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { computeLocalScore, getContentFiltersConfig } from '@/lib/content-filter';
import { computeSemanticScore, getSemanticMatrixConfig } from '@/lib/semantic-filter';
import { scoreArticles } from '@/lib/ai/content-scorer';
import { generateArticleContent } from '@/lib/ai/content-generator';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, logOpenAIUsage, getMonthlyAiCosts, SERVICE } from '@/lib/monitoring/events';
import { SITE_URL } from '@/lib/seo';
import { ArticleStatus, ArticleType, DiscoveredStatus, ImageStatus, SocialPostStatus, SourceType, TrainingDataType } from '@/generated/prisma/enums';
import { captureTrainingExample } from '@/lib/training-capture';
import { selectFeaturedImage } from '@/lib/images/select-featured-image';

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

export interface ScoreStats {
  min: number;
  max: number;
  average: number;
  threshold: number;
  passedCount: number;
  rejectedCount: number;
}

export interface CandidateSummary {
  title: string;
  sourceName: string;
  rawScore: number;
  normalizedScore: number;
  passed: boolean;
  rejectReason?: string;
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
  scoreStats?: ScoreStats;
  topCandidates?: CandidateSummary[];
}

async function _runPipeline(forceRun = false): Promise<PipelineRunResult> {
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

  if (!forceRun && !isAllowedHour(settings.allowedPublishHours)) {
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
    select: { id: true, name: true, url: true, language: true, country: true, categoryId: true, reliabilityScore: true },
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
    reliabilityScore: number;
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
        reliabilityScore: source.reliabilityScore,
      });
    }
  }

  plog('rss_items_collected', { total: allNewItems.length, failedFeeds });

  if (allNewItems.length === 0) {
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'No new items from feeds' };
  }

  // ── 3. Rule-based filter ──────────────────────────────────────────────────

  const filtersConfig = getContentFiltersConfig();
  const semanticConfig = getSemanticMatrixConfig();
  const recentTitles = (await prisma.discoveredArticle.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 48 * 3600000) } },
    select: { title: true },
  })).map((a) => a.title);

  const localFiltered = allNewItems
    .map((item) => ({
      item,
      score: computeLocalScore(
        { id: item.url, title: item.title, excerpt: item.excerpt, url: item.url, categoryName: '' },
        filtersConfig,
        recentTitles
      ),
    }))
    .filter(({ score }) => !score.shouldIgnore)
    .sort((a, b) => b.score.localScore - a.score.localScore);

  plog('rule_filter_done', {
    inputItems: allNewItems.length,
    afterLocalFilter: localFiltered.length,
    filteredOut: allNewItems.length - localFiltered.length,
  });

  // ── 3b. Semantic matrix filter ─────────────────────────────────────────────

  const semanticFiltered = localFiltered.filter(({ item }) => {
    const result = computeSemanticScore(
      {
        id: item.url,
        title: item.title,
        excerpt: item.excerpt,
        sourceName: item.sourceName,
        reliabilityScore: item.reliabilityScore,
      },
      semanticConfig
    );
    return result.passedSemanticFilter;
  });

  const filtered = semanticFiltered.slice(0, Math.min(remaining * 3, 30));

  plog('semantic_filter_done', {
    afterLocalFilter: localFiltered.length,
    afterSemanticFilter: semanticFiltered.length,
    semanticRejected: localFiltered.length - semanticFiltered.length,
    candidates: filtered.length,
  });

  if (filtered.length === 0) {
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'All items filtered out by rules or semantic filter' };
  }

  // ── 4. AI scoring ─────────────────────────────────────────────────────────

  const toScore = filtered.slice(0, 15).map(({ item }) => ({
    id: item.url, title: item.title, excerpt: item.excerpt,
  }));

  plog('ai_scoring_start', { batch: toScore.length });
  const scores = await scoreArticles(toScore);

  if (scores.length === 0) {
    plog('ai_scoring_failed', { reason: 'scoreArticles returned empty — check [scoring] logs for API/parse error' });
    return {
      ok: false,
      scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length,
      candidates: filtered.length, generated: 0, rejected: filtered.length, facebookPosted: 0,
      reason: 'AI scoring parse failed — check server logs for [scoring] entries',
    };
  }

  // Detect if AI returned 0-10 scale instead of 0-100 (safety net)
  const rawMax = scores.length > 0 ? Math.max(...scores.map((s) => s.overallScore)) : 0;
  const needsScale = rawMax > 0 && rawMax <= 10;
  const scaleMultiplier = needsScale ? 10 : 1;

  // minimumImportanceScore is stored as 0-100 in the DB — compare directly
  const threshold = settings.minimumImportanceScore;

  plog('ai_scoring_done', {
    scored: scores.length,
    rawMax,
    scaleDetected: needsScale ? '0-10 (scaling ×10)' : '0-100 (no scaling)',
    threshold,
    rawScores: scores.slice(0, 5).map((s) => ({ id: s.id.slice(-40), raw: s.overallScore, normalized: s.overallScore * scaleMultiplier })),
  });

  const scoredFiltered = filtered.map(({ item }) => {
    const score = scores.find((s) => s.id === item.url);
    const rawScore = score?.overallScore ?? 0;
    const normalizedScore = rawScore * scaleMultiplier;
    const autoRejected = Boolean(score?.rejected);
    const passed = !autoRejected && normalizedScore >= threshold;
    const rejectReason = !score
      ? 'no_ai_score'
      : autoRejected
      ? `auto_rejected: ${score.rejectReason || 'AI decision'}`
      : !passed
      ? `score ${normalizedScore} < threshold ${threshold}`
      : undefined;
    return { item, rawScore, normalizedScore, passed, rejectReason };
  });

  const qualifiedItems = scoredFiltered
    .filter((x) => x.passed)
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .slice(0, remaining);

  const allScores = scoredFiltered.map((x) => x.normalizedScore);
  const scoreStats: ScoreStats = {
    min: allScores.length > 0 ? Math.min(...allScores) : 0,
    max: allScores.length > 0 ? Math.max(...allScores) : 0,
    average: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0,
    threshold,
    passedCount: qualifiedItems.length,
    rejectedCount: scoredFiltered.length - qualifiedItems.length,
  };

  const topCandidates: CandidateSummary[] = scoredFiltered
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .slice(0, 10)
    .map((x) => ({
      title: x.item.title.slice(0, 100),
      sourceName: x.item.sourceName,
      rawScore: x.rawScore,
      normalizedScore: x.normalizedScore,
      passed: x.passed,
      rejectReason: x.rejectReason,
    }));

  const rejected = scoredFiltered.length - qualifiedItems.length;

  plog('ai_score_filter', {
    ...scoreStats,
    topCandidates: topCandidates.slice(0, 5).map((c) => ({
      title: c.title.slice(0, 60),
      normalizedScore: c.normalizedScore,
      passed: c.passed,
    })),
  });

  if (qualifiedItems.length === 0) {
    return {
      ok: true,
      scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length,
      candidates: filtered.length, generated: 0, rejected, facebookPosted: 0,
      reason: `No items passed AI score threshold (${threshold}/100)`,
      scoreStats,
      topCandidates,
    };
  }

  // ── 5. Article generation ─────────────────────────────────────────────────

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    return { ok: false, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: filtered.length, generated: 0, rejected, facebookPosted: 0, error: 'No admin user found' };
  }

  let articlesGenerated = 0;
  let facebookPosted = 0;

  for (const { item, normalizedScore } of qualifiedItems) {
    if (articlesGenerated >= remaining) break;

    plog('article_generation_start', { title: item.title.slice(0, 80), source: item.sourceName, score: normalizedScore });

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

      void captureTrainingExample({
        articleId: article.id,
        sourceTitle: item.title,
        sourceExcerpt: item.excerpt || undefined,
        sourceUrl: item.url,
        sourceName: item.sourceName,
        dataType: TrainingDataType.NEWS_RSS,
        systemPrompt: generated._prompts.systemPrompt,
        userPrompt: generated._prompts.userPrompt,
        aiCompletion: JSON.stringify(generated),
        model: generated._prompts.model,
        generatedTitle: generated.title,
        generatedExcerpt: generated.excerpt,
        generatedTags: generated.tags,
        category: generated.suggestedCategory,
      });

      // Auto-assign featured image from library if article has no image yet
      if (!item.imageUrl) {
        try {
          const cat = await prisma.category.findUnique({
            where: { id: item.categoryId },
            select: { slug: true },
          });
          if (cat) {
            const img = await selectFeaturedImage({
              categorySlug: cat.slug,
              tags: generated.tags,
              articleTitle: generated.title,
              articleId: article.id,
            });
            if (img) {
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  coverImage: img.publicUrl,
                  generatedImageUrl: img.publicUrl,
                  imageStatus: ImageStatus.GENERATED,
                  imageSource: 'LIBRARY',
                  imageProvider: 'Pexels',
                  imageAttribution: `${img.photographer} via Pexels`,
                },
              });
              plog('auto_image_assigned', { articleId: article.id, publicUrl: img.publicUrl });
            } else {
              plog('auto_image_skip', { reason: 'no_library_images', articleId: article.id });
            }
          }
        } catch (imgErr) {
          plog('auto_image_error', { articleId: article.id, error: imgErr instanceof Error ? imgErr.message : String(imgErr) });
        }
      }

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
    scoreStats,
    topCandidates,
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

export async function runNewsPipeline(forceRun = false): Promise<PipelineRunResult> {
  const zero = { scannedFeeds: 0, failedFeeds: 0, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0 };

  const timeout = new Promise<PipelineRunResult>((resolve) =>
    setTimeout(() => {
      plog('pipeline_timeout', { limitMs: PIPELINE_TIMEOUT_MS });
      resolve({ ok: false, ...zero, error: `Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s` });
    }, PIPELINE_TIMEOUT_MS)
  );

  return Promise.race([_runPipeline(forceRun), timeout]).catch((err) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    plog('pipeline_fatal', { error: msg });
    void logEvent({ service: SERVICE.SCHEDULER, type: 'news_pipeline_run', status: 'ERROR', message: `Pipeline fatal: ${msg}` });
    return { ok: false, ...zero, error: msg };
  });
}
