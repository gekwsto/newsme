import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config/semantic-tags.json');

// ─── Config types ──────────────────────────────────────────────────────────────

interface SemanticTagEntry {
  tag: string;
  category: string;
  aliases: string[];
  weight?: number;
  priority?: boolean;
}

export interface SemanticTagsConfig {
  settings: {
    titleMatchPoints: number;
    excerptMatchPoints: number;
    bodyMatchPoints: number;
    multiAliasBonus: number;
    maxBonusAliases: number;
    priorityBonus: number;
  };
  tags: SemanticTagEntry[];
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TagMatch {
  tag: string;
  category: string;
  matchedAliases: string[];
  titleAliases: string[];
  excerptAliases: string[];
  score: number;
}

export interface TagBoostResult {
  matchedTags: TagMatch[];
  categoryBoosts: Record<string, number>;
}

// ─── Config loading with module-level cache ────────────────────────────────────

let _cache: SemanticTagsConfig | null = null;

const DEFAULTS: SemanticTagsConfig = {
  settings: {
    titleMatchPoints: 30,
    excerptMatchPoints: 15,
    bodyMatchPoints: 5,
    multiAliasBonus: 8,
    maxBonusAliases: 4,
    priorityBonus: 25,
  },
  tags: [],
};

export function getSemanticTagsConfig(): SemanticTagsConfig {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SemanticTagsConfig>;
    _cache = {
      settings: { ...DEFAULTS.settings, ...parsed.settings },
      tags: parsed.tags ?? [],
    };
    return _cache;
  } catch {
    return DEFAULTS;
  }
}

export function clearSemanticTagsCache(): void {
  _cache = null;
}

// ─── Text normalizer (accent-insensitive, consistent with semantic-filter.ts) ──

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ωa-z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Alias matching ────────────────────────────────────────────────────────────

function aliasMatchesText(normAlias: string, normText: string): boolean {
  if (!normAlias || !normText) return false;
  const isMultiWord = normAlias.includes(' ');
  if (isMultiWord) {
    // Substring match for multi-word aliases (order matters)
    return normText.includes(normAlias);
  }
  // Whole-word match for single-word aliases: boundary via padded spaces
  const padded = ` ${normText} `;
  return padded.includes(` ${normAlias} `);
}

// ─── Core computation ──────────────────────────────────────────────────────────

export function computeTagBoosts(
  input: { title: string; excerpt: string; body?: string },
  config?: SemanticTagsConfig,
): TagBoostResult {
  const cfg = config ?? getSemanticTagsConfig();
  const { settings } = cfg;

  const normTitle = normalize(input.title);
  const normExcerpt = normalize(input.excerpt);
  // Truncate body to avoid excessive computation
  const normBody = input.body ? normalize(input.body.slice(0, 3000)) : '';

  const matchedTags: TagMatch[] = [];
  const categoryBoosts: Record<string, number> = {};

  for (const tagEntry of cfg.tags) {
    const titleAliases: string[] = [];
    const excerptAliases: string[] = [];
    const seenNorm = new Set<string>();

    for (const alias of tagEntry.aliases) {
      const normAlias = normalize(alias);
      if (!normAlias || seenNorm.has(normAlias)) continue;
      seenNorm.add(normAlias);

      if (aliasMatchesText(normAlias, normTitle)) {
        titleAliases.push(alias);
      } else if (aliasMatchesText(normAlias, normExcerpt)) {
        excerptAliases.push(alias);
      } else if (normBody && aliasMatchesText(normAlias, normBody)) {
        // body matches count as excerpt-level for scoring
        excerptAliases.push(alias);
      }
    }

    const allMatched = [...titleAliases, ...excerptAliases];
    if (allMatched.length === 0) continue;

    // Base score: title aliases worth more than excerpt aliases
    let score = 0;
    score += titleAliases.length * settings.titleMatchPoints;
    score += excerptAliases.length * settings.excerptMatchPoints;

    // Multi-alias bonus: every extra alias beyond the first gives bonus points
    const bonusCount = Math.min(allMatched.length - 1, settings.maxBonusAliases);
    score += bonusCount * settings.multiAliasBonus;

    // Priority tag bonus
    if (tagEntry.priority) {
      score += settings.priorityBonus;
    }

    // Apply per-tag weight multiplier
    score = Math.round(score * (tagEntry.weight ?? 1.0));

    matchedTags.push({
      tag: tagEntry.tag,
      category: tagEntry.category,
      matchedAliases: allMatched,
      titleAliases,
      excerptAliases,
      score,
    });

    categoryBoosts[tagEntry.category] = (categoryBoosts[tagEntry.category] ?? 0) + score;
  }

  matchedTags.sort((a, b) => b.score - a.score);

  return { matchedTags, categoryBoosts };
}
