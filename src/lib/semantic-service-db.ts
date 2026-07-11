/**
 * semantic-service-db.ts
 *
 * DB-backed semantic analysis service.
 *
 * Flow: input text → alias matching → canonical SemanticTags → category scores
 *
 * BOUNDED SCORING (eliminates old double-scoring):
 *  Each canonical tag contributes exactly ONE score to its category,
 *  regardless of how many of its aliases match. Multiple alias matches
 *  increase "confidence" with diminishing returns (cap).
 *
 * This runs in PARALLEL with the existing JSON-based semantic-filter.ts
 * during Phase B. Phase C will switch the pipeline to use this service.
 */

import 'server-only';
import { prisma } from '@/lib/db';

// ─── Config (loaded once per request/pipeline run) ────────────────────────────

export interface LoadedSemanticTag {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  categoryWeight: number;
  weight: number;
  bonus: number;
  isPriority: boolean;
  useForArticleTagging: boolean;
  useForImageMatching: boolean;
  tagId: string | null;        // → existing article Tag
  imageTagId: string | null;   // → existing ImageTag
  aliases: string[];           // normalized alias strings
  aliasesRaw: string[];        // original alias strings (for display)
}

export interface SemanticConfig {
  tags: LoadedSemanticTag[];
  // Pre-built alias → tag lookup (normalized alias → tag index in `tags`)
  aliasIndex: Map<string, number[]>;
}

let _configCache: SemanticConfig | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// ─── Text normalizer (accent-insensitive, consistent) ─────────────────────────

export function normalizeSemantic(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ω0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Config loader with TTL cache ─────────────────────────────────────────────

export async function loadSemanticConfig(): Promise<SemanticConfig> {
  const now = Date.now();
  if (_configCache && now - _cacheLoadedAt < CACHE_TTL_MS) return _configCache;

  const rawTags = await prisma.semanticTag.findMany({
    where: { isActive: true, semanticCategory: { isActive: true } },
    include: {
      semanticCategory: { select: { name: true, slug: true, weight: true } },
      aliases: { where: { isActive: true }, select: { alias: true } },
    },
    orderBy: { name: 'asc' },
  });

  const tags: LoadedSemanticTag[] = rawTags.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    categoryName: t.semanticCategory.name,
    categorySlug: t.semanticCategory.slug,
    categoryWeight: t.semanticCategory.weight,
    weight: t.weight,
    bonus: t.bonus,
    isPriority: t.isPriority,
    useForArticleTagging: t.useForArticleTagging,
    useForImageMatching: t.useForImageMatching,
    tagId: t.tagId,
    imageTagId: t.imageTagId,
    aliasesRaw: t.aliases.map((a) => a.alias),
    aliases: t.aliases.map((a) => normalizeSemantic(a.alias)),
  }));

  // Build alias index: normalized alias → [tag indices that own this alias]
  const aliasIndex = new Map<string, number[]>();
  for (let i = 0; i < tags.length; i++) {
    for (const normAlias of tags[i].aliases) {
      if (!normAlias) continue;
      const existing = aliasIndex.get(normAlias);
      if (existing) existing.push(i);
      else aliasIndex.set(normAlias, [i]);
    }
  }

  _configCache = { tags, aliasIndex };
  _cacheLoadedAt = now;
  return _configCache;
}

export function clearSemanticDbCache(): void {
  _configCache = null;
  _cacheLoadedAt = 0;
}

// ─── Alias matcher ────────────────────────────────────────────────────────────

function aliasMatchesText(normAlias: string, normText: string): boolean {
  if (!normAlias || !normText) return false;
  const isMultiWord = normAlias.includes(' ');
  if (isMultiWord) return normText.includes(normAlias);
  // Single-word: whole-word boundary via padding
  return ` ${normText} `.includes(` ${normAlias} `);
}

// ─── Scoring constants ────────────────────────────────────────────────────────

const TITLE_SCORE = 30;
const EXCERPT_SCORE = 15;
const BODY_SCORE = 5;
const CONFIDENCE_BONUS_PER_ALIAS = 8;
const MAX_CONFIDENCE_ALIASES = 4;
const MULTI_TAG_BONUS_PER_TAG = 10;
const MULTI_TAG_BONUS_CAP = 30;
const MIN_SEMANTIC_SCORE = 35; // same as semantic-matrix.json threshold

// ─── Result types ─────────────────────────────────────────────────────────────

export interface MatchedAlias {
  alias: string;           // original alias text
  normAlias: string;
  location: 'title' | 'excerpt' | 'body';
}

export interface MatchedTag {
  tagId: string;
  tagName: string;
  tagSlug: string;
  category: string;
  matchedAliases: MatchedAlias[];
  bestLocation: 'title' | 'excerpt' | 'body';
  tagScore: number;        // bounded score for this tag
  articleTagId: string | null;
  imageTagId: string | null;
  useForArticleTagging: boolean;
  useForImageMatching: boolean;
}

export interface CategoryScore {
  category: string;
  categorySlug: string;
  tagCount: number;
  rawTagTotal: number;
  multiTagBonus: number;
  finalScore: number;      // (rawTagTotal + multiTagBonus) × categoryWeight
  matchedTags: MatchedTag[];
}

export interface SemanticAnalysisResult {
  matchedTags: MatchedTag[];
  categoryScores: CategoryScore[];
  winningCategory: string | null;
  winningCategorySlug: string | null;
  semanticScore: number;
  secondaryCategory: string | null;
  passedSemanticFilter: boolean;
  filteredReason: string | null;

  // Article tag suggestions (canonical tags where useForArticleTagging = true)
  articleTagSuggestions: Array<{ name: string; tagId: string | null }>;
  // Image tag IDs for image selection
  imageTagIds: string[];

  debugTrace: string[];
}

// ─── Core analysis function ───────────────────────────────────────────────────

export async function analyzeArticle(input: {
  title: string;
  excerpt: string;
  body?: string;
  config?: SemanticConfig;
}): Promise<SemanticAnalysisResult> {
  const cfg = input.config ?? (await loadSemanticConfig());
  const { tags } = cfg;

  const normTitle = normalizeSemantic(input.title);
  const normExcerpt = normalizeSemantic(input.excerpt);
  const normBody = input.body ? normalizeSemantic(input.body.slice(0, 3000)) : '';

  const debugTrace: string[] = [];
  const matchedTags: MatchedTag[] = [];

  // ── Match each tag ────────────────────────────────────────────────────────

  for (const tag of tags) {
    const titleMatches: MatchedAlias[] = [];
    const excerptMatches: MatchedAlias[] = [];
    const bodyMatches: MatchedAlias[] = [];

    for (let ai = 0; ai < tag.aliases.length; ai++) {
      const normAlias = tag.aliases[ai];
      const rawAlias = tag.aliasesRaw[ai];

      if (aliasMatchesText(normAlias, normTitle)) {
        titleMatches.push({ alias: rawAlias, normAlias, location: 'title' });
      } else if (aliasMatchesText(normAlias, normExcerpt)) {
        excerptMatches.push({ alias: rawAlias, normAlias, location: 'excerpt' });
      } else if (normBody && aliasMatchesText(normAlias, normBody)) {
        bodyMatches.push({ alias: rawAlias, normAlias, location: 'body' });
      }
    }

    const allMatches = [...titleMatches, ...excerptMatches, ...bodyMatches];
    if (allMatches.length === 0) continue;

    // ── Bounded scoring: ONE base score from best location ─────────────────
    const bestLocation: 'title' | 'excerpt' | 'body' =
      titleMatches.length > 0 ? 'title' :
      excerptMatches.length > 0 ? 'excerpt' : 'body';

    const baseScore =
      bestLocation === 'title' ? TITLE_SCORE :
      bestLocation === 'excerpt' ? EXCERPT_SCORE : BODY_SCORE;

    // Confidence bonus: each ADDITIONAL matched alias beyond the first, capped
    const confidenceAliases = Math.min(allMatches.length - 1, MAX_CONFIDENCE_ALIASES);
    const confidenceBonus = confidenceAliases * CONFIDENCE_BONUS_PER_ALIAS;

    // Priority bonus (once per tag, not per alias)
    const priorityBonus = tag.isPriority ? tag.bonus : 0;

    const rawScore = baseScore + confidenceBonus + priorityBonus;
    const tagScore = Math.round(rawScore * tag.weight);

    debugTrace.push(
      `[${tag.categoryName}] ${tag.name}: ${bestLocation}(${baseScore}) + conf(${confidenceBonus}) + priority(${priorityBonus}) × w${tag.weight} = ${tagScore}` +
      ` [aliases: ${allMatches.map((a) => a.alias).join(', ')}]`
    );

    matchedTags.push({
      tagId: tag.id,
      tagName: tag.name,
      tagSlug: tag.slug,
      category: tag.categoryName,
      matchedAliases: allMatches,
      bestLocation,
      tagScore,
      articleTagId: tag.tagId,
      imageTagId: tag.imageTagId,
      useForArticleTagging: tag.useForArticleTagging,
      useForImageMatching: tag.useForImageMatching,
    });
  }

  // ── Aggregate by category ──────────────────────────────────────────────────

  const byCat = new Map<string, { tags: MatchedTag[]; catSlug: string; catWeight: number }>();

  for (const mt of matchedTags) {
    const catData = cfg.tags.find((t) => t.id === mt.tagId);
    const catSlug = catData?.categorySlug ?? mt.category.toLowerCase();
    const catWeight = catData?.categoryWeight ?? 1.0;

    const existing = byCat.get(mt.category);
    if (existing) {
      existing.tags.push(mt);
    } else {
      byCat.set(mt.category, { tags: [mt], catSlug, catWeight });
    }
  }

  const categoryScores: CategoryScore[] = [];

  for (const [category, { tags: catTags, catSlug, catWeight }] of byCat.entries()) {
    const rawTagTotal = catTags.reduce((s, t) => s + t.tagScore, 0);
    const multiTagBonus = Math.min((catTags.length - 1) * MULTI_TAG_BONUS_PER_TAG, MULTI_TAG_BONUS_CAP);
    const finalScore = Math.round((rawTagTotal + multiTagBonus) * catWeight);

    categoryScores.push({
      category,
      categorySlug: catSlug,
      tagCount: catTags.length,
      rawTagTotal,
      multiTagBonus,
      finalScore,
      matchedTags: catTags,
    });
  }

  categoryScores.sort((a, b) => b.finalScore - a.finalScore);

  const best = categoryScores[0] ?? null;
  const second = categoryScores[1] ?? null;
  const semanticScore = best?.finalScore ?? 0;

  const passedSemanticFilter = semanticScore >= MIN_SEMANTIC_SCORE;
  const filteredReason = passedSemanticFilter
    ? null
    : semanticScore > 0
    ? `semantic score ${semanticScore} < ${MIN_SEMANTIC_SCORE}`
    : 'no aliases matched';

  // ── Article tag suggestions ────────────────────────────────────────────────
  const articleTagSuggestions = matchedTags
    .filter((t) => t.useForArticleTagging)
    .map((t) => ({ name: t.tagName, tagId: t.articleTagId }));

  // ── Image tag IDs ──────────────────────────────────────────────────────────
  const imageTagIds = matchedTags
    .filter((t) => t.useForImageMatching && t.imageTagId !== null)
    .map((t) => t.imageTagId as string);

  return {
    matchedTags,
    categoryScores,
    winningCategory: best?.category ?? null,
    winningCategorySlug: best?.categorySlug ?? null,
    semanticScore,
    secondaryCategory: second?.category ?? null,
    passedSemanticFilter,
    filteredReason,
    articleTagSuggestions,
    imageTagIds,
    debugTrace,
  };
}
