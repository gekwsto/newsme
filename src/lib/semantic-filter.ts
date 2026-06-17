import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config/semantic-matrix.json');

// ─── Config types ──────────────────────────────────────────────────────────────

export interface SemanticCategoryConfig {
  weight: number;
  keywords: string[];
  priorityEntities?: string[];
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

export interface SemanticFilterResult {
  id: string;
  semanticScore: number;
  matchedKeywords: string[];
  assignedCategory: string | null;
  secondaryCategory: string | null;
  passedSemanticFilter: boolean;
  filteredReason: string | null;
}

// ─── Normalizer ────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .normalize('NFD')                    // decompose accented chars
    .replace(/[̀-ͯ]/g, '')     // strip diacritic marks (covers ά→α, etc.)
    .toLowerCase()
    .replace(/[^a-zα-ω0-9\s\-]/g, ' ') // keep letters, digits, hyphens
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Core scorer ──────────────────────────────────────────────────────────────

interface CategoryScore {
  category: string;
  score: number;
  matchedKeywords: string[];
}

export function computeSemanticScore(
  input: SemanticFilterInput,
  config: SemanticMatrixConfig
): SemanticFilterResult {
  const titleNorm = normalize(input.title);
  const excerptNorm = normalize(input.excerpt ?? '');
  const combined = `${titleNorm} ${excerptNorm}`.trim();

  const categoryScores: CategoryScore[] = [];

  for (const [catName, catConfig] of Object.entries(config.categories)) {
    let score = 0;
    const matched: string[] = [];
    const prioritySet = new Set(
      (catConfig.priorityEntities ?? []).map((e) => normalize(e))
    );

    for (const kw of catConfig.keywords) {
      const kwNorm = normalize(kw);
      if (!kwNorm) continue;

      const isPriority = prioritySet.has(kwNorm);
      const inTitle = titleNorm.includes(kwNorm);
      const inExcerpt = !inTitle && excerptNorm.includes(kwNorm);

      if (inTitle) {
        score += isPriority ? 30 : 30; // title match always +30
        if (isPriority) score += 25;   // priority entity bonus
        matched.push(kw);
      } else if (inExcerpt) {
        score += 15;                   // excerpt match +15
        if (isPriority) score += 25;   // priority entity bonus
        matched.push(kw);
      } else if (combined.includes(kwNorm)) {
        // Partial / combined match (possible overlap of title+excerpt join)
        score += 8;
        matched.push(kw);
      }
    }

    if (matched.length === 0) continue;

    // Multi-keyword bonus (+10 per additional keyword, capped at +30)
    if (matched.length >= 2) {
      score += Math.min((matched.length - 1) * 10, 30);
    }

    // Source reliability multiplier (slight boost for trusted sources)
    if ((input.reliabilityScore ?? 0) >= 90) {
      score = Math.round(score * 1.1);
    }

    // Category weight multiplier
    score = Math.round(score * catConfig.weight);

    categoryScores.push({ category: catName, score, matchedKeywords: matched });
  }

  // Sort by score desc
  categoryScores.sort((a, b) => b.score - a.score);

  const best = categoryScores[0] ?? null;
  const second = categoryScores[1] ?? null;
  const semanticScore = best?.score ?? 0;

  // Collect all matched keywords (deduplicated, max 10)
  const allMatched = [...new Set(categoryScores.flatMap((c) => c.matchedKeywords))].slice(0, 10);

  // Pass conditions
  const passedByScore = semanticScore >= config.thresholds.minSemanticScore;
  const passedByReliability =
    (input.reliabilityScore ?? 0) >= config.thresholds.alwaysKeepIfSourceReliabilityAbove;
  const passedSemanticFilter = passedByScore || passedByReliability;

  let filteredReason: string | null = null;
  if (!passedSemanticFilter) {
    filteredReason =
      semanticScore > 0
        ? `semantic score ${semanticScore} < ${config.thresholds.minSemanticScore}`
        : 'no hot keywords matched';
  }

  return {
    id: input.id,
    semanticScore,
    matchedKeywords: allMatched,
    assignedCategory: best?.category ?? null,
    secondaryCategory: second?.category ?? null,
    passedSemanticFilter,
    filteredReason,
  };
}

// Estimated tokens saved per article skipped by semantic filter
export const SEMANTIC_TOKENS_SAVED = 400;
