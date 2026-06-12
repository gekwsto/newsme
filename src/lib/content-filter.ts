import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config/content-filters.json');

interface ContentFiltersConfig {
  blacklistKeywords: string[];
  lowValueKeywords: string[];
  priorityKeywords: string[];
  controversyKeywords: string[];
  priorityCategories: string[];
  minTitleLength: number;
  minExcerptLength: number;
  localScoreThreshold: number;
  maxBatchSize: number;
}

const DEFAULTS: ContentFiltersConfig = {
  blacklistKeywords: ['betting', 'casino', 'astrology', 'adult', 'crypto scam'],
  lowValueKeywords: ['sale', 'discount', 'coupon', 'promo', 'giveaway'],
  priorityKeywords: ['AI', 'OpenAI', 'Google', 'Apple', 'Microsoft', 'economy', 'inflation', 'jobs', 'layoffs', 'Greece', 'Europe'],
  controversyKeywords: ['ban', 'fine', 'lawsuit', 'crash', 'fired', 'layoffs', 'scandal', 'hack', 'breach', 'fraud'],
  priorityCategories: ['AI', 'Technology', 'Τεχνολογία', 'Economy', 'Οικονομία', 'Business', 'Επιχειρήσεις'],
  minTitleLength: 20,
  minExcerptLength: 40,
  localScoreThreshold: 40,
  maxBatchSize: 50,
};

export function getContentFiltersConfig(): ContentFiltersConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ContentFiltersConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export interface PreFilterInput {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
  categoryName: string;
  isPrioritySource?: boolean;
}

export interface PreFilterResult {
  id: string;
  localScore: number;
  shouldIgnore: boolean;
  filteredReason: string | null;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-zα-ωάέήίόύώ0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsAny(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function isSimilarTitle(title: string, existingTitles: string[]): boolean {
  const words = normalise(title).split(' ').filter((w) => w.length > 4);
  if (words.length < 3) return false;
  for (const existing of existingTitles) {
    const existingWords = normalise(existing).split(' ').filter((w) => w.length > 4);
    if (existingWords.length < 3) continue;
    const setA = new Set(words);
    const setB = new Set(existingWords);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    if (intersection / union >= 0.65) return true;
  }
  return false;
}

export function computeLocalScore(
  input: PreFilterInput,
  config: ContentFiltersConfig,
  existingTitles: string[] = []
): PreFilterResult {
  const combined = `${input.title} ${input.excerpt ?? ''}`;
  let score = 50;
  const reasons: string[] = [];

  // ── Hard rejects (blacklist) ──────────────────────────────────
  const blacklisted = containsAny(combined, config.blacklistKeywords);
  if (blacklisted) {
    score -= 30;
    reasons.push(`blacklist: "${blacklisted}"`);
  }

  // ── Low value keywords ────────────────────────────────────────
  const lowValue = containsAny(combined, config.lowValueKeywords);
  if (lowValue) {
    score -= 15;
    reasons.push(`low-value: "${lowValue}"`);
  }

  // ── Short title penalty ───────────────────────────────────────
  if (input.title.trim().length < config.minTitleLength) {
    score -= 20;
    reasons.push('title too short');
  }

  // ── Short/missing excerpt penalty ────────────────────────────
  if (!input.excerpt || input.excerpt.trim().length < config.minExcerptLength) {
    score -= 20;
    reasons.push('excerpt too short');
  }

  // ── Duplicate title penalty ───────────────────────────────────
  const isDuplicate = isSimilarTitle(input.title, existingTitles);
  if (isDuplicate) {
    score -= 20;
    reasons.push('probable duplicate');
  }

  // ── Priority keywords bonus ───────────────────────────────────
  const priorityKw = containsAny(combined, config.priorityKeywords);
  if (priorityKw) {
    score += 20;
  }

  // ── Controversy keywords bonus ────────────────────────────────
  const controversyKw = containsAny(combined, config.controversyKeywords);
  if (controversyKw) {
    score += 10;
  }

  // ── Priority category bonus ───────────────────────────────────
  const inPriorityCategory = config.priorityCategories.some(
    (cat) => input.categoryName.toLowerCase().includes(cat.toLowerCase())
  );
  if (inPriorityCategory) {
    score += 15;
  }

  // ── Priority source safety override ──────────────────────────
  // Never ignore articles from priority sources that have a priority keyword
  const safetyOverride = input.isPrioritySource && !!priorityKw;

  const finalScore = Math.min(100, Math.max(0, score));
  const shouldIgnore = !safetyOverride && finalScore < config.localScoreThreshold;

  return {
    id: input.id,
    localScore: finalScore,
    shouldIgnore,
    filteredReason: shouldIgnore ? reasons.join(', ') || 'low local score' : null,
  };
}

// Estimated tokens saved per skipped article (input + output overhead for scoring)
export const TOKENS_PER_ARTICLE_ESTIMATE = 400;
export const COST_PER_TOKEN_GPT4O = 10 / 1e6; // average of input ($5) + output ($15) / 2
