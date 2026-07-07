import fs from 'fs';
import path from 'path';
import { computeTagBoosts, type TagMatch } from './semantic-tag-matcher';

const CONFIG_PATH = path.join(process.cwd(), 'config/semantic-matrix.json');

// ─── Config types ──────────────────────────────────────────────────────────────

export interface MustPassTagGroup {
  /** Tags to match against title+excerpt (whole-word, accent-insensitive). */
  tags: string[];
  /** How many tags must match to trigger this group. Use 1 for precise terms, 2+ for generic. */
  requiredMatches: number;
  /**
   * Guaranteed minimum semantic score when triggered.
   * Must be high enough to clear the compound threshold:
   *   compound = local×0.4 + semantic×0.6 ≥ 45
   *   → semantic ≥ 42 when local=40 (filter floor).
   * Use 80 (generic groups) or 90 (exact agency/term groups) as safe defaults.
   */
  mustPassScore: number;
}

export interface SemanticCategoryConfig {
  weight: number;
  keywords: string[];
  priorityEntities?: string[];
  /**
   * Groups of high-value tags that, when matched, FORCE the article through the semantic
   * filter and guarantee a minimum score — regardless of keyword scoring.
   * The article is assigned to THIS category if it scores highest.
   */
  mustPassTagGroups?: Record<string, MustPassTagGroup>;
}

export interface SemanticMatrixConfig {
  thresholds: {
    minSemanticScore: number;
    alwaysKeepIfSourceReliabilityAbove: number;
    maxArticlesToScorePerRefresh: number;
  };
  categories: Record<string, SemanticCategoryConfig>;
}

const DEFAULTS: SemanticMatrixConfig = {
  thresholds: {
    minSemanticScore: 35,
    alwaysKeepIfSourceReliabilityAbove: 95,
    maxArticlesToScorePerRefresh: 50,
  },
  categories: {},
};

export function getSemanticMatrixConfig(): SemanticMatrixConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SemanticMatrixConfig>;
    return {
      thresholds: { ...DEFAULTS.thresholds, ...parsed.thresholds },
      categories: parsed.categories ?? DEFAULTS.categories,
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface SemanticFilterInput {
  id: string;
  title: string;
  excerpt: string | null;
  sourceName?: string;
  categoryName?: string;
  reliabilityScore?: number;
}

export interface KeywordContribution {
  keyword: string;
  location: 'title' | 'excerpt' | 'combined';
  isPriority: boolean;
  score: number;
}

export interface MustPassTrigger {
  groupName: string;
  matchedTags: string[];
  mustPassScore: number;
}

export interface CategoryBreakdown {
  category: string;
  contributions: KeywordContribution[];
  keywordsSubtotal: number;
  multiKeywordBonus: number;
  reliabilityMultiplier: number;
  weightMultiplier: number;
  finalScore: number;
  /** Set when a mustPassTagGroup was responsible for the minimum score floor. */
  mustPassGroup?: MustPassTrigger;
  /** Score added by semantic-tag alias matching (from semantic-tags.json). */
  tagBoost?: number;
}

export interface SemanticFilterResult {
  id: string;
  semanticScore: number;
  matchedKeywords: string[];
  assignedCategory: string | null;
  secondaryCategory: string | null;
  passedSemanticFilter: boolean;
  filteredReason: string | null;
  breakdown: CategoryBreakdown[];
  /**
   * Set when the winning category passed via a mustPassTagGroup rather than keyword score alone.
   * Includes category name, group name, and the specific tags that triggered.
   */
  mustPassGroupTriggered: ({ category: string } & MustPassTrigger) | null;
  /** Semantic tag alias matches from semantic-tags.json (debug trace). */
  matchedSemanticTags?: TagMatch[];
}

// ─── Normalizer ────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritic marks (ά→α etc.)
    .toLowerCase()
    .replace(/[^a-zα-ω0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Core scorer ──────────────────────────────────────────────────────────────

interface CategoryScoreDetail {
  category: string;
  score: number;
  matchedKeywords: string[];
  breakdown: CategoryBreakdown;
}

export function computeSemanticScore(
  input: SemanticFilterInput,
  config: SemanticMatrixConfig
): SemanticFilterResult {
  const titleNorm = normalize(input.title);
  const excerptNorm = normalize(input.excerpt ?? '');
  const combined = `${titleNorm} ${excerptNorm}`.trim();
  // Padded version for whole-word mustPass matching (prevents "κοκ" matching "κόκκινο")
  const paddedCombined = ` ${combined} `;

  const categoryScores: CategoryScoreDetail[] = [];

  for (const [catName, catConfig] of Object.entries(config.categories)) {
    let score = 0;
    const matched: string[] = [];
    const contributions: KeywordContribution[] = [];
    const seenNorm = new Set<string>();
    const prioritySet = new Set(
      (catConfig.priorityEntities ?? []).map((e) => normalize(e))
    );

    // ── Regular keyword scoring ────────────────────────────────────────────────
    for (const kw of catConfig.keywords) {
      const kwNorm = normalize(kw);
      if (!kwNorm) continue;
      if (seenNorm.has(kwNorm)) continue;
      seenNorm.add(kwNorm);

      const isPriority = prioritySet.has(kwNorm);
      const inTitle = titleNorm.includes(kwNorm);
      const inExcerpt = !inTitle && excerptNorm.includes(kwNorm);
      const inCombined = !inTitle && !inExcerpt && combined.includes(kwNorm);

      if (inTitle) {
        const kwScore = 30 + (isPriority ? 25 : 0);
        score += kwScore;
        matched.push(kw);
        contributions.push({ keyword: kw, location: 'title', isPriority, score: kwScore });
      } else if (inExcerpt) {
        const kwScore = 15 + (isPriority ? 25 : 0);
        score += kwScore;
        matched.push(kw);
        contributions.push({ keyword: kw, location: 'excerpt', isPriority, score: kwScore });
      } else if (inCombined) {
        score += 8;
        matched.push(kw);
        contributions.push({ keyword: kw, location: 'combined', isPriority, score: 8 });
      }
    }

    // ── mustPassTagGroups: whole-word, accent-insensitive matching ─────────────
    // Uses padded combined to avoid substring false positives (e.g. "κοκ" ≠ "κόκκινο").
    let mustPassForCat: MustPassTrigger | null = null;

    for (const [groupName, group] of Object.entries(catConfig.mustPassTagGroups ?? {})) {
      const matchedTags: string[] = [];
      for (const tag of group.tags) {
        const tagNorm = normalize(tag);
        if (tagNorm && paddedCombined.includes(` ${tagNorm} `)) {
          matchedTags.push(tag);
        }
      }
      if (matchedTags.length >= group.requiredMatches) {
        // If multiple groups trigger, keep the one with highest mustPassScore
        if (!mustPassForCat || group.mustPassScore > mustPassForCat.mustPassScore) {
          mustPassForCat = { groupName, matchedTags, mustPassScore: group.mustPassScore };
        }
      }
    }

    // Skip category if neither keywords nor mustPass contributed anything
    if (matched.length === 0 && !mustPassForCat) continue;

    const keywordsSubtotal = score;
    const multiKeywordBonus = matched.length >= 2 ? Math.min((matched.length - 1) * 10, 30) : 0;
    score += multiKeywordBonus;

    const reliabilityMultiplier = (input.reliabilityScore ?? 0) >= 90 ? 1.1 : 1.0;
    if (reliabilityMultiplier > 1.0) score = Math.round(score * reliabilityMultiplier);

    const weightMultiplier = catConfig.weight;
    score = Math.round(score * weightMultiplier);

    // mustPass guarantees a minimum score floor (applied after weight multiplier)
    if (mustPassForCat && score < mustPassForCat.mustPassScore) {
      score = mustPassForCat.mustPassScore;
    }

    categoryScores.push({
      category: catName,
      score,
      matchedKeywords: matched,
      breakdown: {
        category: catName,
        contributions,
        keywordsSubtotal,
        multiKeywordBonus,
        reliabilityMultiplier,
        weightMultiplier,
        finalScore: score,
        ...(mustPassForCat && { mustPassGroup: mustPassForCat }),
      },
    });
  }

  // ── Alias tag boosts from semantic-tags.json ──────────────────────────────────
  const tagResult = computeTagBoosts({ title: input.title, excerpt: input.excerpt ?? '' });

  for (const [catName, boost] of Object.entries(tagResult.categoryBoosts)) {
    if (boost <= 0) continue;
    const existing = categoryScores.find((c) => c.category === catName);
    if (existing) {
      existing.score += boost;
      existing.breakdown.finalScore = existing.score;
      existing.breakdown.tagBoost = (existing.breakdown.tagBoost ?? 0) + boost;
    } else {
      categoryScores.push({
        category: catName,
        score: boost,
        matchedKeywords: [],
        breakdown: {
          category: catName,
          contributions: [],
          keywordsSubtotal: 0,
          multiKeywordBonus: 0,
          reliabilityMultiplier: 1.0,
          weightMultiplier: 1.0,
          finalScore: boost,
          tagBoost: boost,
        },
      });
    }
  }

  // Sort by score desc
  categoryScores.sort((a, b) => b.score - a.score);

  const best = categoryScores[0] ?? null;
  const second = categoryScores[1] ?? null;
  const semanticScore = best?.score ?? 0;

  const allMatched = [...new Set(categoryScores.flatMap((c) => c.matchedKeywords))].slice(0, 10);

  // mustPass from the winning category
  const bestMustPass = best?.breakdown.mustPassGroup ?? null;
  const mustPassGroupTriggered = bestMustPass
    ? { category: best!.category, ...bestMustPass }
    : null;

  // Pass conditions
  const passedByScore = semanticScore >= config.thresholds.minSemanticScore;
  const passedByReliability =
    (input.reliabilityScore ?? 0) >= config.thresholds.alwaysKeepIfSourceReliabilityAbove;
  // Explicit override: mustPass on the winning category bypasses the threshold check.
  // In practice mustPassScore (80-90) >> minSemanticScore (35), so passedByScore would
  // already be true — but this remains correct if the threshold is ever raised.
  const passedByMustPass = bestMustPass !== null;
  const passedSemanticFilter = passedByScore || passedByReliability || passedByMustPass;

  // Log every mustPass trigger so it shows in pipeline logs
  if (passedByMustPass) {
    console.log('[semantic] must_pass_triggered', {
      title: input.title.slice(0, 80),
      category: best!.category,
      group: bestMustPass!.groupName,
      matchedTags: bestMustPass!.matchedTags,
      finalScore: semanticScore,
      bypassedThreshold: !passedByScore,
    });
  }

  let filteredReason: string | null = null;
  if (!passedSemanticFilter) {
    filteredReason =
      semanticScore > 0
        ? `semantic score ${semanticScore} < ${config.thresholds.minSemanticScore}`
        : 'no hot keywords matched';
  }

  // Log tag matches for debug visibility
  if (tagResult.matchedTags.length > 0) {
    console.log('[semantic] tag_boosts_applied', {
      title: input.title.slice(0, 80),
      tags: tagResult.matchedTags.map((t) => `${t.tag}(+${t.score}→${t.category})`).join(', '),
      winner: best?.category ?? 'none',
    });
  }

  return {
    id: input.id,
    semanticScore,
    matchedKeywords: allMatched,
    assignedCategory: best?.category ?? null,
    secondaryCategory: second?.category ?? null,
    passedSemanticFilter,
    filteredReason,
    breakdown: categoryScores.map((c) => c.breakdown),
    mustPassGroupTriggered,
    matchedSemanticTags: tagResult.matchedTags.length > 0 ? tagResult.matchedTags : undefined,
  };
}

// Estimated tokens saved per article skipped by semantic filter
export const SEMANTIC_TOKENS_SAVED = 400;
