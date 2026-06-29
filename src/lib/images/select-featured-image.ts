import 'server-only';

import { prisma } from '@/lib/db';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SelectFeaturedImageParams {
  categorySlug: string;
  matchedKeywords?: string[];
  articleTitle?: string;
  articleId?: string;
  siteTheme?: string;
  debug?: boolean;
}

export interface FeaturedImageResult {
  publicUrl: string;
  altText: string;
  photographer: string | null;
  photographerUrl: string | null;
  pexelsUrl: string | null;
  imageAssetId: string;
  fallbackLevel: 1 | 2 | 3 | 4;
  debug?: ImageSelectionDebug;
}

export interface ScoreBreakdown {
  categoryBase: number;
  subcategoryMatch: number;
  exactPhraseBonus: number;
  keywordHits: { keyword: string; score: number; isPriority: boolean; isOverride: boolean }[];
  multiKeywordBonus: number;
  qualityBonus: number;
  recentUsagePenalty: number;
  usageCountPenalty: number;
  total: number;
}

export interface ImageSelectionDebug {
  candidateCount: number;
  seasonallyExcluded: number;
  fallbackLevel: 1 | 2 | 3 | 4;
  top5: {
    rank: number;
    imageId: string;
    publicUrl: string;
    altText: string;
    score: number;
    breakdown: ScoreBreakdown;
  }[];
}

// ─── Default settings (used when no DB record exists) ─────────────────────────

const DEFAULTS = {
  categoryWeight: 40,
  subcategoryWeight: 30,
  priorityKeywordWeight: 25,
  keywordWeight: 10,
  exactPhraseWeight: 15,
  multiKeyword2Bonus: 10,
  multiKeyword3Bonus: 20,
  qualityScoreWeight: 1,
  overrideBonus: 1000,
  recentUsage1dPenalty: -15,
  recentUsage3dPenalty: -10,
  recentUsage7dPenalty: -5,
  usageCountPenalty: -1,
  usageCountCap: -20,
};

type Settings = typeof DEFAULTS;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ωΑ-Ωά-ώ0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSeasonallyActive(seasonStart: string | null, seasonEnd: string | null): boolean {
  if (!seasonStart || !seasonEnd) return true;
  const now = new Date();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (seasonStart <= seasonEnd) {
    return today >= seasonStart && today <= seasonEnd;
  }
  return today >= seasonStart || today <= seasonEnd;
}

function scoreImage(
  image: {
    qualityScore: number;
    lastUsedAt: Date | null;
    usedCount: number;
    tagSlug: string | null;
    keywords: { keyword: string; aliases: unknown; isPriority: boolean; isOverride: boolean }[];
  },
  semanticSet: Set<string>,
  articleTitleNorm: string,
  s: Settings,
): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    categoryBase: s.categoryWeight,
    subcategoryMatch: 0,
    exactPhraseBonus: 0,
    keywordHits: [],
    multiKeywordBonus: 0,
    qualityBonus: 0,
    recentUsagePenalty: 0,
    usageCountPenalty: 0,
    total: 0,
  };
  let score = s.categoryWeight;

  // Subcategory (tag slug) match
  const tagSlugNorm = image.tagSlug ? norm(image.tagSlug) : '';
  if (tagSlugNorm && articleTitleNorm.includes(tagSlugNorm)) {
    score += s.subcategoryWeight;
    breakdown.subcategoryMatch = s.subcategoryWeight;
    const escapedSlug = tagSlugNorm.replace(/[-]/g, '[\\s-]+');
    if (new RegExp(`(^|\\s)${escapedSlug}(\\s|$)`).test(articleTitleNorm)) {
      score += s.exactPhraseWeight;
      breakdown.exactPhraseBonus = s.exactPhraseWeight;
    }
  }

  // Keyword matching
  let matchCount = 0;
  for (const kw of image.keywords) {
    const aliases = Array.isArray(kw.aliases) ? (kw.aliases as string[]) : [];
    const allForms = [norm(kw.keyword), ...aliases.map(norm)].filter(Boolean);
    const hit = allForms.some((f) => semanticSet.has(f));
    if (!hit) continue;

    let kwScore: number;
    if (kw.isOverride) {
      kwScore = s.overrideBonus;
    } else if (kw.isPriority) {
      kwScore = s.priorityKeywordWeight;
    } else {
      kwScore = s.keywordWeight;
    }
    score += kwScore;
    breakdown.keywordHits.push({ keyword: kw.keyword, score: kwScore, isPriority: kw.isPriority, isOverride: kw.isOverride });
    matchCount++;
  }

  // Multi-keyword bonus
  if (matchCount >= 3) {
    score += s.multiKeyword3Bonus;
    breakdown.multiKeywordBonus = s.multiKeyword3Bonus;
  } else if (matchCount >= 2) {
    score += s.multiKeyword2Bonus;
    breakdown.multiKeywordBonus = s.multiKeyword2Bonus;
  }

  // Quality bonus (±offset from neutral 5)
  const qualityBonus = (image.qualityScore - 5) * s.qualityScoreWeight;
  score += qualityBonus;
  breakdown.qualityBonus = qualityBonus;

  // Rotation penalties
  if (image.lastUsedAt) {
    const hoursSince = (Date.now() - image.lastUsedAt.getTime()) / 3_600_000;
    let penalty = 0;
    if (hoursSince < 24) penalty = s.recentUsage1dPenalty;
    else if (hoursSince < 72) penalty = s.recentUsage3dPenalty;
    else if (hoursSince < 168) penalty = s.recentUsage7dPenalty;
    score += penalty;
    breakdown.recentUsagePenalty = penalty;
  }

  const usagePenalty = Math.max(image.usedCount * s.usageCountPenalty, s.usageCountCap);
  score += usagePenalty;
  breakdown.usageCountPenalty = usagePenalty;

  breakdown.total = score;
  return { score, breakdown };
}

// ─── Main selection function ──────────────────────────────────────────────────

export async function selectFeaturedImage(
  params: SelectFeaturedImageParams,
): Promise<FeaturedImageResult | null> {
  const {
    categorySlug,
    matchedKeywords = [],
    articleTitle = '',
    articleId,
    siteTheme = process.env.SITE_THEME ?? 'global',
    debug = false,
  } = params;

  // Load settings (single row; fall back to hardcoded defaults)
  const settingsRow = await prisma.imageSelectionSettings.findFirst();
  const s: Settings = settingsRow ?? DEFAULTS;

  const articleTitleNorm = norm(articleTitle);
  const semanticSet = new Set(matchedKeywords.map(norm).filter(Boolean));

  // ── LEVEL 1: Full scoring ─────────────────────────────────────────────────

  const rawCandidates = await prisma.imageAsset.findMany({
    where: {
      isActive: true,
      category: { slug: categorySlug },
      OR: [{ theme: siteTheme }, { theme: 'global' }],
    },
    select: {
      id: true,
      publicUrl: true,
      altText: true,
      photographer: true,
      photographerUrl: true,
      pexelsUrl: true,
      qualityScore: true,
      usedCount: true,
      lastUsedAt: true,
      seasonStart: true,
      seasonEnd: true,
      tag: { select: { slug: true } },
      keywords: {
        select: { keyword: true, aliases: true, isPriority: true, isOverride: true },
      },
    },
  });

  const candidates = rawCandidates.filter((img) =>
    isSeasonallyActive(img.seasonStart, img.seasonEnd),
  );
  const seasonallyExcluded = rawCandidates.length - candidates.length;

  if (candidates.length > 0) {
    const scored = candidates.map((img) => {
      const { score, breakdown } = scoreImage(
        { ...img, tagSlug: img.tag?.slug ?? null },
        semanticSet,
        articleTitleNorm,
        s,
      );
      return { img, score, breakdown };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.img.qualityScore !== a.img.qualityScore) return b.img.qualityScore - a.img.qualityScore;
      if (a.img.usedCount !== b.img.usedCount) return a.img.usedCount - b.img.usedCount;
      const aLast = a.img.lastUsedAt?.getTime() ?? 0;
      const bLast = b.img.lastUsedAt?.getTime() ?? 0;
      return aLast - bLast;
    });

    const winner = scored[0];
    if (winner.score > 0) {
      const asset = await commitSelection(winner.img.id, articleId);
      const debugData: ImageSelectionDebug | undefined = debug
        ? {
            candidateCount: candidates.length,
            seasonallyExcluded,
            fallbackLevel: 1,
            top5: scored.slice(0, 5).map((s, i) => ({
              rank: i + 1,
              imageId: s.img.id,
              publicUrl: s.img.publicUrl,
              altText: s.img.altText,
              score: s.score,
              breakdown: s.breakdown,
            })),
          }
        : undefined;
      return buildResult(asset, articleTitle, 1, debugData);
    }
  }

  // ── LEVEL 2: Any active image in category (LRU), seasonal filter OFF ──────

  const fallback2 = await prisma.imageAsset.findFirst({
    where: {
      isActive: true,
      category: { slug: categorySlug },
      OR: [{ theme: siteTheme }, { theme: 'global' }],
    },
    orderBy: [{ lastUsedAt: 'asc' }, { usedCount: 'asc' }, { createdAt: 'asc' }],
    select: selectFields,
  });

  if (fallback2) {
    const asset = await commitSelection(fallback2.id, articleId);
    return buildResult(asset, articleTitle, 2);
  }

  // ── LEVEL 3: ImageCategoryDefault ─────────────────────────────────────────

  const catDefault = await prisma.imageCategoryDefault.findFirst({
    where: { category: { slug: categorySlug } },
    select: { imageAsset: { select: selectFields } },
  });

  if (catDefault?.imageAsset) {
    const asset = await commitSelection(catDefault.imageAsset.id, articleId);
    return buildResult(asset, articleTitle, 3);
  }

  // ── LEVEL 4: null ─────────────────────────────────────────────────────────
  console.log(`[image-selection] no image found for category="${categorySlug}" — article left without image`);
  return null;
}

// ─── Shared field selection ────────────────────────────────────────────────────

const selectFields = {
  id: true,
  publicUrl: true,
  altText: true,
  photographer: true,
  photographerUrl: true,
  pexelsUrl: true,
} as const;

// ─── Commit selection: update counters + create usage record ──────────────────

async function commitSelection(imageId: string, articleId?: string) {
  const asset = await prisma.imageAsset.update({
    where: { id: imageId },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    select: selectFields,
  });
  if (articleId) {
    await prisma.articleImageUsage
      .create({ data: { articleId, imageAssetId: imageId } })
      .catch((err) => console.warn('[select-featured-image] usage record failed:', err));
  }
  return asset;
}

// ─── Build result ──────────────────────────────────────────────────────────────

function buildResult(
  asset: { id: string; publicUrl: string; altText: string; photographer: string | null; photographerUrl: string | null; pexelsUrl: string | null },
  articleTitle: string,
  level: 1 | 2 | 3 | 4,
  debugData?: ImageSelectionDebug,
): FeaturedImageResult {
  console.log(`[image-selection] selected imageId=${asset.id} level=${level}`);
  return {
    publicUrl: asset.publicUrl,
    altText: articleTitle || asset.altText,
    photographer: asset.photographer,
    photographerUrl: asset.photographerUrl,
    pexelsUrl: asset.pexelsUrl,
    imageAssetId: asset.id,
    fallbackLevel: level,
    debug: debugData,
  };
}
