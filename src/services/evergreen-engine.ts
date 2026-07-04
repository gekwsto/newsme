import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType, SourceType } from '@/generated/prisma/enums';
import {
  generateEvergreenContent,
  type EvergreenGenerateOptions,
} from '@/lib/ai/evergreen-generator';
import { scoreArticle, passesQualityGate } from '@/lib/ai/quality-scorer';
import { logEvent, SERVICE } from '@/lib/monitoring/events';
import { CLUSTERS, getAllTopics, type EvergreenTopic } from './evergreen-clusters';

const DEFAULT_TARGET_DRAFT_COUNT = 3;

// ─── Jaccard similarity on words longer than 3 chars ─────────────────────────

function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

async function uniqueSlug(base: string): Promise<string> {
  const existing = await prisma.article.findUnique({ where: { slug: base } });
  if (!existing) return base;
  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}`;
    const conflict = await prisma.article.findUnique({ where: { slug: candidate } });
    if (!conflict) return candidate;
    suffix++;
  }
}

function estimateReadTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ─── Internal Linking ─────────────────────────────────────────────────────────

async function buildRelatedArticlesHtml(
  clusterName: string,
  excludeSlug: string,
): Promise<string> {
  const clusterTag = `cluster:${clusterName}`;
  const related = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: ArticleType.EVERGREEN,
      secondaryKeywords: { has: clusterTag },
      NOT: { slug: excludeSlug },
    },
    select: { title: true, slug: true, excerpt: true },
    orderBy: { publishedAt: 'desc' },
    take: 4,
  });

  if (related.length < 2) return '';

  const items = related
    .map(
      (a) =>
        `<li><a href="/article/${a.slug}"><strong>${a.title}</strong></a>${
          a.excerpt ? ` — ${a.excerpt.slice(0, 100)}…` : ''
        }</li>`,
    )
    .join('\n');

  return `\n<section class="related-articles"><h2>Σχετικά Άρθρα</h2><ul>\n${items}\n</ul></section>`;
}

// ─── Cluster-balanced topic selection ────────────────────────────────────────

function pickBalancedTopics(
  available: Array<EvergreenTopic & { cluster: string; clusterSlug: string }>,
  count: number,
): Array<EvergreenTopic & { cluster: string; clusterSlug: string }> {
  if (available.length <= count) return [...available];

  const byCluster = new Map<string, Array<EvergreenTopic & { cluster: string; clusterSlug: string }>>();
  for (const t of available) {
    const arr = byCluster.get(t.cluster) ?? [];
    arr.push(t);
    byCluster.set(t.cluster, arr);
  }

  const result: Array<EvergreenTopic & { cluster: string; clusterSlug: string }> = [];
  const clusterKeys = [...byCluster.keys()];

  let round = 0;
  while (result.length < count) {
    const key = clusterKeys[round % clusterKeys.length];
    const pool = byCluster.get(key)!;
    if (pool.length > 0) {
      const picked = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      result.push(picked);
    }
    round++;
    if (result.length === 0 && round > clusterKeys.length * 2) break;
    if ([...byCluster.values()].every((a) => a.length === 0)) break;
  }

  return result;
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

interface Analytics {
  generatedWords: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  generationDurationMs: number;
}

function computeAnalytics(html: string, durationMs: number): Analytics {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  const estimatedOutputTokens = Math.round(words * 1.3);
  const estimatedInputTokens = 1500;
  const estimatedCostUsd =
    (estimatedInputTokens / 1_000_000) * 2.5 +
    (estimatedOutputTokens / 1_000_000) * 10;

  return {
    generatedWords: words,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(5)),
    generationDurationMs: durationMs,
  };
}

// ─── Core Result Types ────────────────────────────────────────────────────────

export interface EngineResult {
  ok: boolean;
  generated: number;
  failed: number;
  skipped: number;
  draftCount: number;
  totalWords: number;
  estimatedCostUsd: number;
  details: Array<{
    topic: string;
    ok: boolean;
    articleId?: string;
    clusterName?: string;
    analytics?: Analytics;
    qualityScore?: number;
    aiSeoScore?: number;
    readabilityScore?: number;
    retriesUsed?: number;
    rejectedAttempts?: number;
    error?: string;
  }>;
}

// ─── Generate & Save a Single Topic ──────────────────────────────────────────

const MAX_REGEN_ATTEMPTS = 3;

async function generateOneTopic(
  topic: EvergreenTopic & { cluster: string; clusterSlug: string },
  authorId: string,
): Promise<
  | { ok: true; articleId: string; analytics: Analytics; qualityScore: number; aiSeoScore: number; readabilityScore: number; retriesUsed: number; rejectedAttempts: number }
  | { ok: false; error: string }
> {
  const clusterDef = CLUSTERS.find((c) => c.name === topic.cluster);
  const dbCategoryName = clusterDef?.dbCategory ?? 'AI';

  const category = await prisma.category.findFirst({
    where: { name: dbCategoryName },
    select: { id: true, name: true },
  });
  const fallbackCategory = await prisma.category.findFirst({
    where: { name: 'AI' },
    select: { id: true, name: true },
  });
  const resolvedCategory = category ?? fallbackCategory;
  if (!resolvedCategory) return { ok: false, error: 'Δεν βρέθηκε κατηγορία' };

  const clusterTag = `cluster:${topic.cluster}`;
  const enrichedSecondaryKeywords = [clusterTag, ...topic.secondaryKeywords];

  const clusterArticles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: ArticleType.EVERGREEN,
      secondaryKeywords: { has: clusterTag },
    },
    select: { title: true, slug: true, evergreenKeyword: true },
    orderBy: { publishedAt: 'desc' },
    take: 6,
  });

  const relatedArticles = clusterArticles.map((a) => ({
    title: a.title,
    slug: a.slug,
    keyword: a.evergreenKeyword ?? '',
  }));

  const options: EvergreenGenerateOptions = {
    topic: topic.topic,
    primaryKeyword: topic.primaryKeyword,
    secondaryKeywords: enrichedSecondaryKeywords,
    categoryName: resolvedCategory.name,
    targetLength: 'medium',
    articleType: topic.articleType,
    estimatedDifficulty: topic.difficulty,
    generateFaq: true,
    generateInternalLinks: false,
    generateSocialPosts: false,
    generateImagePrompt: true,
    relatedArticles,
  };

  let rejectedAttempts = 0;
  let lastError = '';

  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt++) {
    let generated;
    let durationMs;

    try {
      const t0 = Date.now();
      generated = await generateEvergreenContent(options);
      durationMs = Date.now() - t0;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Generation failed';
      continue;
    }

    const scores = scoreArticle({
      contentHtml: generated.contentHtml,
      seoTitle: generated.seoTitle,
      seoDescription: generated.seoDescription,
      primaryKeyword: topic.primaryKeyword,
      faqCount: generated.faqItems.length,
    });

    if (!passesQualityGate(scores)) {
      rejectedAttempts++;
      void logEvent({
        service: SERVICE.SCHEDULER,
        type: 'evergreen_quality_reject',
        status: 'WARNING',
        message: `Quality gate failed (attempt ${attempt + 1}/${MAX_REGEN_ATTEMPTS}): ${topic.topic} — quality:${scores.qualityScore} seo:${scores.aiSeoScore}`,
        metadata: { topic: topic.topic, attempt: attempt + 1, ...scores },
      });
      continue;
    }

    const baseSlug = generated.slug || topic.primaryKeyword.replace(/\s+/g, '-').toLowerCase();
    const slug = await uniqueSlug(baseSlug);

    const eeaByline = `\n<div class="eeaat-byline"><p><strong>Συντακτική Ομάδα AI Σχολιασμός</strong> — Το άρθρο δημιουργήθηκε με τη βοήθεια τεχνητής νοημοσύνης και επιμελήθηκε από τη συντακτική ομάδα του AI Σχολιασμός.</p></div>`;
    const relatedHtml = await buildRelatedArticlesHtml(topic.cluster, slug);
    const finalHtml = generated.contentHtml + eeaByline + relatedHtml;

    const analytics = computeAnalytics(finalHtml, durationMs);

    const article = await prisma.article.create({
      data: {
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: finalHtml,
        seoTitle: generated.seoTitle || null,
        seoDescription: generated.seoDescription || null,
        articleType: ArticleType.EVERGREEN,
        status: ArticleStatus.DRAFT,
        sourceType: SourceType.AI_GENERATED,
        categoryId: resolvedCategory.id,
        authorId,
        displayAuthorId: (await prisma.author.findFirst({ where: { isDefault: true } }))?.id ?? null,
        readTime: estimateReadTime(finalHtml),
        evergreenKeyword: topic.primaryKeyword,
        secondaryKeywords: enrichedSecondaryKeywords,
        faqJson: generated.faqItems.length ? (generated.faqItems as object) : undefined,
        searchIntent: generated.searchIntent,
        estimatedDifficulty: topic.difficulty,
        coverImagePrompt: generated.imagePrompt || null,
        qualityScore: scores.qualityScore,
        aiSeoScore: scores.aiSeoScore,
        readabilityScore: scores.readabilityScore,
      },
    });

    await prisma.aiDraft.create({
      data: {
        articleId: article.id,
        prompt: `[EVERGREEN-AUTO] cluster:${topic.cluster} | ${topic.topic} | kw:${topic.primaryKeyword}`,
        rawOutput: JSON.stringify({ ...generated, analytics, scores }),
        model: 'gpt-5',
        imagePrompt: generated.imagePrompt || null,
      },
    });

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

    return {
      ok: true,
      articleId: article.id,
      analytics,
      qualityScore: scores.qualityScore,
      aiSeoScore: scores.aiSeoScore,
      readabilityScore: scores.readabilityScore,
      retriesUsed: attempt,
      rejectedAttempts,
    };
  }

  return { ok: false, error: `Quality gate failed after ${MAX_REGEN_ATTEMPTS} attempts. Last: ${lastError}` };
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export async function runEvergreenEngine(limit = 5, targetDraftCount = DEFAULT_TARGET_DRAFT_COUNT): Promise<EngineResult> {
  const details: EngineResult['details'] = [];

  const draftCount = await prisma.article.count({
    where: {
      articleType: ArticleType.EVERGREEN,
      sourceType: SourceType.AI_GENERATED,
      status: ArticleStatus.DRAFT,
    },
  });

  const needed = Math.max(0, Math.min(limit, targetDraftCount - draftCount));

  if (needed === 0) {
    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'evergreen_skip',
      status: 'OK',
      message: `Evergreen engine: already ${draftCount} drafts (target ${targetDraftCount}) — skipping`,
      metadata: { draftCount, target: targetDraftCount },
    });
    return {
      ok: true,
      generated: 0,
      failed: 0,
      skipped: draftCount,
      draftCount,
      totalWords: 0,
      estimatedCostUsd: 0,
      details,
    };
  }

  const usedKeywords = await prisma.article.findMany({
    where: { evergreenKeyword: { not: null } },
    select: { evergreenKeyword: true },
  });
  const usedKeywordSet = new Set(
    usedKeywords.map((a) => a.evergreenKeyword?.toLowerCase()).filter(Boolean),
  );

  const existingTitles = await prisma.article.findMany({
    where: { articleType: ArticleType.EVERGREEN },
    select: { title: true },
  });

  const allTopics = getAllTopics();

  const available = allTopics.filter((topic) => {
    if (usedKeywordSet.has(topic.primaryKeyword.toLowerCase())) return false;
    const tooSimilar = existingTitles.some(
      (e) => jaccardSimilarity(topic.topic, e.title) >= 0.7,
    );
    return !tooSimilar;
  });

  if (available.length === 0) {
    return {
      ok: true,
      generated: 0,
      failed: 0,
      skipped: 0,
      draftCount,
      totalWords: 0,
      estimatedCostUsd: 0,
      details,
    };
  }

  const toGenerate = pickBalancedTopics(available, needed);

  const systemUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  if (!systemUser) {
    return {
      ok: false,
      generated: 0,
      failed: 0,
      skipped: 0,
      draftCount,
      totalWords: 0,
      estimatedCostUsd: 0,
      details: [{ topic: 'system', ok: false, error: 'Δεν βρέθηκε admin χρήστης' }],
    };
  }

  let generated = 0;
  let failed = 0;
  let totalWords = 0;
  let totalCost = 0;

  for (const topic of toGenerate) {
    try {
      const result = await generateOneTopic(topic, systemUser.id);
      if (result.ok) {
        generated++;
        totalWords += result.analytics.generatedWords;
        totalCost += result.analytics.estimatedCostUsd;
        details.push({
          topic: topic.topic,
          ok: true,
          articleId: result.articleId,
          clusterName: topic.cluster,
          analytics: result.analytics,
          qualityScore: result.qualityScore,
          aiSeoScore: result.aiSeoScore,
          readabilityScore: result.readabilityScore,
          retriesUsed: result.retriesUsed,
          rejectedAttempts: result.rejectedAttempts,
        });
      } else {
        failed++;
        details.push({ topic: topic.topic, ok: false, clusterName: topic.cluster, error: result.error });
      }
    } catch (err) {
      failed++;
      details.push({
        topic: topic.topic,
        ok: false,
        clusterName: topic.cluster,
        error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα',
      });
    }
  }

  const finalDraftCount = draftCount + generated;

  void logEvent({
    service: SERVICE.SCHEDULER,
    type: 'evergreen_run',
    status: failed > 0 ? 'WARNING' : 'OK',
    message: `Evergreen engine: ${generated} generated, ${failed} failed | ${totalWords} words | $${totalCost.toFixed(4)} | drafts: ${finalDraftCount}/${targetDraftCount}`,
    metadata: {
      generated,
      failed,
      draftCount: finalDraftCount,
      target: targetDraftCount,
      needed,
      totalWords,
      estimatedCostUsd: parseFloat(totalCost.toFixed(4)),
      clustersUsed: [...new Set(details.filter((d) => d.ok).map((d) => d.clusterName))],
    },
  });

  return {
    ok: true,
    generated,
    failed,
    skipped: 0,
    draftCount: finalDraftCount,
    totalWords,
    estimatedCostUsd: parseFloat(totalCost.toFixed(4)),
    details,
  };
}
