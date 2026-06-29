import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { computeLocalScore, getContentFiltersConfig } from '@/lib/content-filter';
import { computeSemanticScore, getSemanticMatrixConfig } from '@/lib/semantic-filter';
import { generateArticleContent, PROMPT_VERSION, GENERATOR_VERSION } from '@/lib/ai/content-generator';
import { extractArticleFromUrl } from '@/lib/rss/article-extractor';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, logOpenAIUsage, getMonthlyAiCosts, SERVICE } from '@/lib/monitoring/events';
import { SITE_URL } from '@/lib/seo';
import { ArticleStatus, ArticleType, DiscoveredStatus, ImageStatus, PipelineRunStatus, SocialPostStatus, SourceType, TrainingDataType } from '@/generated/prisma/enums';
import { captureTrainingExample } from '@/lib/training-capture';
import { selectFeaturedImage } from '@/lib/images/select-featured-image';

const MODEL = 'gpt-5-mini';
const FEED_TIMEOUT_MS = 12_000;
const PIPELINE_TIMEOUT_MS = 270_000; // 4.5 min — under Vercel's 5 min max

// Compound scoring weights — must sum to 1.0
const COMPOUND_LOCAL_WEIGHT = 0.4;
const COMPOUND_SEMANTIC_WEIGHT = 0.6;
const DEFAULT_COMPOUND_THRESHOLD = 45;

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
  localScore: number;
  semanticScore: number;
  compoundScore: number;
  semanticCategory: string | null;
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

  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      status: PipelineRunStatus.RUNNING,
      forceRun,
      modelUsed: MODEL,
      promptVersion: PROMPT_VERSION,
      generatorVersion: GENERATOR_VERSION,
    },
  });

  async function finishRun(patch: Parameters<typeof prisma.pipelineRun.update>[0]['data']) {
    await prisma.pipelineRun.update({ where: { id: pipelineRun.id }, data: { finishedAt: new Date(), ...patch } }).catch(() => {});
  }

  const [totalActiveFeeds, autoGenerationFeeds] = await Promise.all([
    prisma.rssSource.count({ where: { enabled: true } }),
    prisma.rssSource.count({ where: { enabled: true, allowAutoGeneration: true } }),
  ]);
  plog('pipeline_start', { totalActiveFeeds, autoGenerationFeeds });

  const settings = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!settings) {
    plog('pipeline_skip', { reason: 'no_settings' });
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason: 'No settings configured' });
    return { ok: true, ...zero, reason: 'No settings configured' };
  }
  plog('settings_loaded', {
    isEnabled: settings.isEnabled,
    maxNewsPerDay: settings.maxNewsPerDay,
    publishMode: settings.publishMode,
    compoundScoreThreshold: settings.compoundScoreThreshold,
    facebookAutoPost: settings.facebookAutoPost,
  });

  if (!settings.isEnabled) {
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason: 'Pipeline disabled' });
    return { ok: true, ...zero, reason: 'Pipeline disabled' };
  }

  if (!forceRun && !isAllowedHour(settings.allowedPublishHours)) {
    const athensHour = parseInt(
      new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' }).format(new Date()),
      10
    );
    plog('pipeline_skip', { reason: 'outside_hours', athensHour, allowed: settings.allowedPublishHours });
    const reason = `Outside allowed publish hours (now: ${athensHour}h Athens)`;
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason });
    return { ok: true, ...zero, reason };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.article.count({
    where: { articleType: ArticleType.NEWS, sourceType: SourceType.RSS_SUMMARY, createdAt: { gte: todayStart } },
  });

  if (todayCount >= settings.maxNewsPerDay) {
    plog('pipeline_skip', { reason: 'daily_limit', todayCount, max: settings.maxNewsPerDay });
    const reason = `Daily limit reached (${todayCount}/${settings.maxNewsPerDay})`;
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason });
    return { ok: true, ...zero, reason };
  }

  const monthlyCosts = await getMonthlyAiCosts();
  if (monthlyCosts.news >= settings.dailyAiBudgetLimit * 30) {
    plog('pipeline_skip', { reason: 'budget_exceeded', monthly: monthlyCosts.news });
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason: 'Monthly AI budget exceeded' });
    return { ok: true, ...zero, reason: 'Monthly AI budget exceeded' };
  }

  const remaining = settings.maxNewsPerDay - todayCount;
  const compoundThreshold = settings.compoundScoreThreshold ?? DEFAULT_COMPOUND_THRESHOLD;

  // ── 1. Load sources ────────────────────────────────────────────────────────

  const [sources, allDbCategories] = await Promise.all([
    prisma.rssSource.findMany({
      where: { enabled: true, allowAutoGeneration: true },
      select: { id: true, name: true, url: true, language: true, country: true, categoryId: true, reliabilityScore: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  // Build category lookup map for semantic → DB category resolution
  const categoryByName = new Map(allDbCategories.map((c) => [c.name.toLowerCase().trim(), c.id]));

  plog('feeds_loaded', { count: sources.length, sources: sources.map((s) => s.name) });

  if (sources.length === 0) {
    await finishRun({ status: PipelineRunStatus.SKIPPED, reason: 'No auto-generation sources', totalFeeds: sources.length });
    return { ok: true, ...zero, reason: 'No auto-generation sources' };
  }

  await prisma.pipelineRun.update({ where: { id: pipelineRun.id }, data: { totalFeeds: sources.length } }).catch(() => {});

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

  await prisma.pipelineRun.update({ where: { id: pipelineRun.id }, data: { failedFeeds, fetchedItems: allNewItems.length } }).catch(() => {});

  if (allNewItems.length === 0) {
    await finishRun({ status: PipelineRunStatus.COMPLETED, reason: 'No new items from feeds', failedFeeds, fetchedItems: 0 });
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: 0, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'No new items from feeds' };
  }

  // ── 3. Local rule-based filter ─────────────────────────────────────────────

  const filtersConfig = getContentFiltersConfig();
  const semanticConfig = getSemanticMatrixConfig();
  const recentTitles = (await prisma.discoveredArticle.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 48 * 3600000) } },
    select: { title: true },
  })).map((a) => a.title);

  const localFiltered = allNewItems
    .map((item) => ({
      item,
      localResult: computeLocalScore(
        { id: item.url, title: item.title, excerpt: item.excerpt, url: item.url, categoryName: '' },
        filtersConfig,
        recentTitles
      ),
    }))
    .filter(({ localResult }) => !localResult.shouldIgnore)
    .sort((a, b) => b.localResult.localScore - a.localResult.localScore);

  const localRejected = allNewItems.length - localFiltered.length;
  plog('local_filter_done', { input: allNewItems.length, passed: localFiltered.length, rejected: localRejected });
  await prisma.pipelineRun.update({ where: { id: pipelineRun.id }, data: { localRejected } }).catch(() => {});

  // ── 3b. Semantic matrix filter ─────────────────────────────────────────────

  const semanticScored = localFiltered.map(({ item, localResult }) => ({
    item,
    localResult,
    semanticResult: computeSemanticScore(
      {
        id: item.url,
        title: item.title,
        excerpt: item.excerpt,
        sourceName: item.sourceName,
        reliabilityScore: item.reliabilityScore,
      },
      semanticConfig
    ),
  }));

  const semanticPassed = semanticScored.filter(({ semanticResult }) => semanticResult.passedSemanticFilter);

  const semanticRejected = localFiltered.length - semanticPassed.length;
  plog('semantic_filter_done', { input: localFiltered.length, passed: semanticPassed.length, rejected: semanticRejected });
  await prisma.pipelineRun.update({ where: { id: pipelineRun.id }, data: { semanticRejected } }).catch(() => {});

  if (semanticPassed.length === 0) {
    await finishRun({ status: PipelineRunStatus.COMPLETED, reason: 'All items filtered out by semantic filter', semanticRejected });
    return { ok: true, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: 0, generated: 0, rejected: 0, facebookPosted: 0, reason: 'All items filtered out by semantic filter' };
  }

  // ── 4. Compound rule-based scoring (NO AI) ────────────────────────────────
  // compoundScore = localScore × 0.4 + semanticScore × 0.6
  // Threshold comes from settings.compoundScoreThreshold (default 45)

  const compoundScored = semanticPassed.map(({ item, localResult, semanticResult }) => {
    const localScore = localResult.localScore;
    const semanticScore = semanticResult.semanticScore;
    const compoundScore = Math.round((localScore * COMPOUND_LOCAL_WEIGHT + semanticScore * COMPOUND_SEMANTIC_WEIGHT) * 10) / 10;
    const passed = compoundScore >= compoundThreshold;
    const compoundReason = passed
      ? `pass: ${localScore}×0.4 + ${semanticScore}×0.6 = ${compoundScore} ≥ ${compoundThreshold}`
      : `reject: ${localScore}×0.4 + ${semanticScore}×0.6 = ${compoundScore} < ${compoundThreshold}`;
    return { item, localResult, semanticResult, localScore, semanticScore, compoundScore, passed, compoundReason };
  });

  const qualifiedItems = compoundScored
    .filter((x) => x.passed)
    .sort((a, b) =>
      b.compoundScore - a.compoundScore ||
      b.semanticScore - a.semanticScore ||
      b.localScore - a.localScore
    )
    .slice(0, remaining);

  const allCompoundScores = compoundScored.map((x) => x.compoundScore);
  const scoreStats: ScoreStats = {
    min: allCompoundScores.length > 0 ? Math.min(...allCompoundScores) : 0,
    max: allCompoundScores.length > 0 ? Math.max(...allCompoundScores) : 0,
    average: allCompoundScores.length > 0
      ? Math.round(allCompoundScores.reduce((a, b) => a + b, 0) / allCompoundScores.length)
      : 0,
    threshold: compoundThreshold,
    passedCount: qualifiedItems.length,
    rejectedCount: compoundScored.length - qualifiedItems.length,
  };

  const topCandidates: CandidateSummary[] = [...compoundScored]
    .sort((a, b) => b.compoundScore - a.compoundScore)
    .slice(0, 10)
    .map((x) => ({
      title: x.item.title.slice(0, 100),
      sourceName: x.item.sourceName,
      localScore: x.localScore,
      semanticScore: x.semanticScore,
      compoundScore: x.compoundScore,
      semanticCategory: x.semanticResult.assignedCategory,
      passed: x.passed,
      rejectReason: x.passed ? undefined : x.compoundReason,
    }));

  const compoundRejected = compoundScored.length - qualifiedItems.length;
  const rejected = compoundRejected;

  await prisma.pipelineRun.update({
    where: { id: pipelineRun.id },
    data: { compoundRejected, compoundThreshold, selectedForGeneration: qualifiedItems.length },
  }).catch(() => {});

  // Create PipelineRunItems for all compound-scored items (both passed and rejected)
  await Promise.allSettled(
    compoundScored.map((x) =>
      prisma.pipelineRunItem.create({
        data: {
          runId: pipelineRun.id,
          sourceName: x.item.sourceName,
          rssTitle: x.item.title,
          rssUrl: x.item.url,
          localScore: x.localScore,
          semanticScore: x.semanticScore,
          compoundScore: x.compoundScore,
          semanticCategory: x.semanticResult.assignedCategory ?? null,
          matchedKeywords: x.semanticResult.matchedKeywords ?? [],
          semanticBreakdown: JSON.parse(JSON.stringify(x.semanticResult.breakdown ?? [])),
          selectedForGeneration: x.passed,
          generationStatus: x.passed ? 'pending' : 'rejected_compound',
        },
      })
    )
  );

  plog('compound_scoring_done', {
    input: semanticPassed.length,
    passed: qualifiedItems.length,
    rejected,
    threshold: compoundThreshold,
    scoreStats,
    topCandidates: topCandidates.slice(0, 5).map((c) => ({
      title: c.title.slice(0, 60),
      localScore: c.localScore,
      semanticScore: c.semanticScore,
      compoundScore: c.compoundScore,
      semanticCategory: c.semanticCategory,
      passed: c.passed,
    })),
  });

  if (qualifiedItems.length === 0) {
    await finishRun({ status: PipelineRunStatus.COMPLETED, reason: `No items passed compound score threshold (${compoundThreshold})`, compoundRejected });
    return {
      ok: true,
      scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length,
      candidates: compoundScored.length, generated: 0, rejected, facebookPosted: 0,
      reason: `No items passed compound score threshold (${compoundThreshold})`,
      scoreStats,
      topCandidates,
    };
  }

  // ── 5. Article extraction (parallel, for qualified items only) ────────────

  const extractionMap = new Map<string, { body: string; wordCount: number }>();

  const extractionResults = await Promise.allSettled(
    qualifiedItems.map(async ({ item }) => {
      const result = await extractArticleFromUrl(item.url);
      return { url: item.url, result };
    })
  );

  for (const r of extractionResults) {
    if (r.status === 'fulfilled' && r.value.result.success) {
      extractionMap.set(r.value.url, { body: r.value.result.body, wordCount: r.value.result.wordCount });
      plog('extraction_success', { url: r.value.url.slice(0, 70), wordCount: r.value.result.wordCount });
    } else {
      const reason = r.status === 'rejected'
        ? String(r.reason)
        : !r.value.result.success ? r.value.result.reason : 'unknown';
      plog('extraction_fallback', { url: r.status === 'fulfilled' ? r.value.url.slice(0, 70) : 'unknown', reason });
    }
  }

  const extractedCount = extractionMap.size;
  plog('extraction_done', { qualified: qualifiedItems.length, extracted: extractedCount, fallback: qualifiedItems.length - extractedCount });

  // Persist extraction status to PipelineRunItems
  await Promise.allSettled(
    qualifiedItems.map(({ item }) => {
      const ext = extractionMap.get(item.url);
      return prisma.pipelineRunItem.updateMany({
        where: { runId: pipelineRun.id, rssUrl: item.url },
        data: { extractionStatus: ext ? 'success' : 'fallback', extractionWordCount: ext?.wordCount ?? null },
      });
    })
  );

  // ── 6. Article generation (AI only for selected articles) ─────────────────

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    return { ok: false, scannedFeeds: sources.length, failedFeeds, rssItems: allNewItems.length, candidates: compoundScored.length, generated: 0, rejected, facebookPosted: 0, error: 'No admin user found' };
  }

  let articlesGenerated = 0;
  let facebookPosted = 0;

  for (const { item, localScore, semanticScore, compoundScore, compoundReason, semanticResult } of qualifiedItems) {
    if (articlesGenerated >= remaining) break;

    // Resolve category: semanticCategory → DB match → source fallback
    const semCat = semanticResult.assignedCategory?.toLowerCase().trim() ?? '';
    const resolvedCategoryId = (semCat && categoryByName.get(semCat)) || item.categoryId;
    const resolvedCategoryName = semanticResult.assignedCategory ?? '';

    plog('article_generation_start', {
      title: item.title.slice(0, 80),
      source: item.sourceName,
      localScore,
      semanticScore,
      compoundScore,
      semanticCategory: semanticResult.assignedCategory,
      resolvedCategoryId,
      selectedForGeneration: true,
    });

    try {
      const topic = item.title + (item.excerpt ? '\n\n' + item.excerpt : '') + '\n\nΠηγή: ' + item.sourceName;
      const fullSourceArticle = extractionMap.get(item.url)?.body;

      const generated = await generateArticleContent({
        topic,
        categoryName: resolvedCategoryName,
        tone: 'informative',
        articleType: 'summary',
        targetLength: 'medium',
        sourceUrl: item.url,
        sourceLanguage: item.language,
        sourceCountry: item.country,
        sourceName: item.sourceName,
        generateFacebookPost: settings.facebookAutoPost,
        generateAiCommentary: true,
        matchedKeywords: semanticResult.matchedKeywords,
        fullSourceArticle,
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
          categoryId: resolvedCategoryId,
          authorId: adminUser.id,
          readTime: estimateReadTime(generated.contentHtml),
          suggestedImageUrl: item.imageUrl,
          imageStatus: item.imageUrl ? ImageStatus.RSS_AVAILABLE : ImageStatus.NONE,
          publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
        },
      });

      if (status === ArticleStatus.PUBLISHED) {
        revalidatePath('/sitemap.xml');
        revalidatePath('/sitemap-articles.xml');
        revalidatePath('/news-sitemap.xml');
      }

      await prisma.aiDraft.create({
        data: {
          articleId: article.id,
          prompt: topic,
          rawOutput: JSON.stringify(generated),
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          generatorVersion: GENERATOR_VERSION,
        },
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
        category: resolvedCategoryName,
        promptVersion: PROMPT_VERSION,
        generatorVersion: GENERATOR_VERSION,
        matchedKeywords: semanticResult.matchedKeywords,
        semanticCategory: semanticResult.assignedCategory ?? undefined,
        compoundScore,
      });

      // Update PipelineRunItem with generation result
      await prisma.pipelineRunItem.updateMany({
        where: { runId: pipelineRun.id, rssUrl: item.url },
        data: { generatedArticleId: article.id, generationStatus: 'success', resolvedCategory: resolvedCategoryName },
      }).catch(() => {});

      // Auto-assign featured image from library if article has no RSS image
      if (!item.imageUrl) {
        try {
          const cat = await prisma.category.findUnique({
            where: { id: resolvedCategoryId },
            select: { slug: true },
          });
          if (cat) {
            const img = await selectFeaturedImage({
              categorySlug: cat.slug,
              matchedKeywords: semanticResult.matchedKeywords,
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
                  imageProvider: 'Library',
                  imageAttribution: img.photographer ? `${img.photographer} via Pexels` : null,
                },
              });
              plog('auto_image_assigned', { articleId: article.id, publicUrl: img.publicUrl, level: img.fallbackLevel });
            } else {
              plog('auto_image_skip', { reason: 'no_image_in_library', articleId: article.id });
            }
          }
        } catch (imgErr) {
          plog('auto_image_error', { articleId: article.id, error: imgErr instanceof Error ? imgErr.message : String(imgErr) });
        }
      }

      const ext = extractionMap.get(item.url);
      await prisma.discoveredArticle.upsert({
        where: { url: item.url },
        update: {
          status: DiscoveredStatus.DRAFT_CREATED,
          localScore,
          semanticScore,
          matchedKeywords: semanticResult.matchedKeywords,
          semanticCategory: semanticResult.assignedCategory,
          semanticSecondaryCategory: semanticResult.secondaryCategory,
          passedSemanticFilter: true,
          compoundScore,
          compoundReason,
          selectedForGeneration: true,
          sourceArticleBody: ext?.body ?? null,
          extractionSuccess: ext ? true : false,
          extractionMethod: ext ? 'readability' : 'fallback',
          extractionWordCount: ext?.wordCount ?? null,
        },
        create: {
          sourceId: item.sourceId,
          title: item.title,
          url: item.url,
          excerpt: item.excerpt,
          categoryId: item.categoryId,
          status: DiscoveredStatus.DRAFT_CREATED,
          imageUrl: item.imageUrl,
          localScore,
          semanticScore,
          matchedKeywords: semanticResult.matchedKeywords,
          semanticCategory: semanticResult.assignedCategory,
          semanticSecondaryCategory: semanticResult.secondaryCategory,
          passedSemanticFilter: true,
          compoundScore,
          compoundReason,
          selectedForGeneration: true,
          sourceArticleBody: ext?.body ?? null,
          extractionSuccess: ext ? true : false,
          extractionMethod: ext ? 'readability' : 'fallback',
          extractionWordCount: ext?.wordCount ?? null,
        },
      });

      articlesGenerated++;
      plog('article_generation_done', { title: generated.title.slice(0, 80), slug, status, articleId: article.id, resolvedCategory: resolvedCategoryName });

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

      void logEvent({ service: SERVICE.ARTICLE, type: 'auto_pipeline_article', status: 'OK', message: `Created: "${generated.title}" [${status}]`, metadata: { articleId: article.id, source: item.sourceName, compoundScore, resolvedCategoryName } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      plog('article_generation_error', { title: item.title.slice(0, 60), error: msg });
      void logEvent({ service: SERVICE.ARTICLE, type: 'auto_pipeline_article', status: 'ERROR', message: `Failed for "${item.title}": ${msg}`, metadata: { url: item.url } });
      await prisma.pipelineRunItem.updateMany({
        where: { runId: pipelineRun.id, rssUrl: item.url },
        data: { generationStatus: 'failed', failureReason: msg },
      }).catch(() => {});
    }
  }

  const failedGenerations = qualifiedItems.length - articlesGenerated;
  await finishRun({
    status: PipelineRunStatus.COMPLETED,
    generatedArticles: articlesGenerated,
    failedGenerations,
  });

  const result: PipelineRunResult = {
    ok: true,
    scannedFeeds: sources.length,
    failedFeeds,
    rssItems: allNewItems.length,
    candidates: compoundScored.length,
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

  return Promise.race([_runPipeline(forceRun), timeout]).catch(async (err) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    plog('pipeline_fatal', { error: msg });
    void logEvent({ service: SERVICE.SCHEDULER, type: 'news_pipeline_run', status: 'ERROR', message: `Pipeline fatal: ${msg}` });
    return { ok: false, ...zero, error: msg };
  });
}
