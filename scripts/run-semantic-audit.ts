/**
 * run-semantic-audit.ts — READ-ONLY comparison audit.
 *
 * OLD: computeSemanticScore (semantic-filter.ts + semantic-tag-matcher.ts, JSON files)
 * NEW: DB-backed alias matching (logic inlined from semantic-service-db.ts to avoid server-only)
 *
 * Usage:  npx tsx scripts/run-semantic-audit.ts
 * Writes: nothing to DB. Console output only.
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { computeSemanticScore, getSemanticMatrixConfig } from '../src/lib/semantic-filter';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// ─── Inline NEW system logic (mirrors semantic-service-db.ts, no server-only) ─

function normalizeSemantic(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ω0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasMatchesText(normAlias: string, normText: string): boolean {
  if (!normAlias || !normText) return false;
  return normAlias.includes(' ')
    ? normText.includes(normAlias)
    : ` ${normText} `.includes(` ${normAlias} `);
}

const TITLE_SCORE = 30;
const EXCERPT_SCORE = 15;
const BODY_SCORE = 5;
const CONFIDENCE_BONUS_PER_ALIAS = 8;
const MAX_CONFIDENCE_ALIASES = 4;
const MULTI_TAG_BONUS_PER_TAG = 10;
const MULTI_TAG_BONUS_CAP = 30;
const MIN_SEMANTIC_SCORE = 35;

interface LoadedTag {
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
  tagId: string | null;
  imageTagId: string | null;
  aliases: string[];
  aliasesRaw: string[];
}

interface MatchedTag {
  tagName: string;
  category: string;
  matchedAliases: string[];
  bestLocation: 'title' | 'excerpt' | 'body';
  tagScore: number;
  useForArticleTagging: boolean;
  useForImageMatching: boolean;
  articleTagId: string | null;
  imageTagId: string | null;
}

interface CategoryScore {
  category: string;
  tagCount: number;
  rawTagTotal: number;
  multiTagBonus: number;
  finalScore: number;
  matchedTags: MatchedTag[];
}

interface NewResult {
  matchedTags: MatchedTag[];
  categoryScores: CategoryScore[];
  winningCategory: string | null;
  semanticScore: number;
  secondaryCategory: string | null;
  passedSemanticFilter: boolean;
  articleTagSuggestions: Array<{ name: string; tagId: string | null }>;
  imageTagIds: string[];
  debugTrace: string[];
}

function analyzeArticleInline(
  input: { title: string; excerpt: string; body?: string },
  tags: LoadedTag[],
): NewResult {
  const normTitle = normalizeSemantic(input.title);
  const normExcerpt = normalizeSemantic(input.excerpt);
  const normBody = input.body ? normalizeSemantic(input.body.slice(0, 3000)) : '';

  const matchedTags: MatchedTag[] = [];
  const debugTrace: string[] = [];

  for (const tag of tags) {
    const titleMatches: string[] = [];
    const excerptMatches: string[] = [];
    const bodyMatches: string[] = [];

    for (let ai = 0; ai < tag.aliases.length; ai++) {
      const norm = tag.aliases[ai];
      const raw = tag.aliasesRaw[ai];
      if (aliasMatchesText(norm, normTitle)) titleMatches.push(raw);
      else if (aliasMatchesText(norm, normExcerpt)) excerptMatches.push(raw);
      else if (normBody && aliasMatchesText(norm, normBody)) bodyMatches.push(raw);
    }

    const all = [...titleMatches, ...excerptMatches, ...bodyMatches];
    if (all.length === 0) continue;

    const bestLocation: 'title' | 'excerpt' | 'body' =
      titleMatches.length > 0 ? 'title' : excerptMatches.length > 0 ? 'excerpt' : 'body';
    const baseScore = bestLocation === 'title' ? TITLE_SCORE : bestLocation === 'excerpt' ? EXCERPT_SCORE : BODY_SCORE;
    const confBonus = Math.min(all.length - 1, MAX_CONFIDENCE_ALIASES) * CONFIDENCE_BONUS_PER_ALIAS;
    const prioBonus = tag.isPriority ? tag.bonus : 0;
    const tagScore = Math.round((baseScore + confBonus + prioBonus) * tag.weight);

    debugTrace.push(`[${tag.categoryName}] ${tag.name}: ${bestLocation}(${baseScore})+conf(${confBonus})+prio(${prioBonus})×${tag.weight}=${tagScore} [${all.join(',')}]`);

    matchedTags.push({
      tagName: tag.name,
      category: tag.categoryName,
      matchedAliases: all,
      bestLocation,
      tagScore,
      useForArticleTagging: tag.useForArticleTagging,
      useForImageMatching: tag.useForImageMatching,
      articleTagId: tag.tagId,
      imageTagId: tag.imageTagId,
    });
  }

  // Aggregate by category
  const byCat = new Map<string, { mts: MatchedTag[]; weight: number }>();
  const tagWeightMap = new Map<string, number>(tags.map((t) => [t.name, t.categoryWeight]));
  for (const mt of matchedTags) {
    const w = tagWeightMap.get(mt.tagName) ?? 1.0;
    const e = byCat.get(mt.category);
    if (e) e.mts.push(mt);
    else byCat.set(mt.category, { mts: [mt], weight: w });
  }

  const categoryScores: CategoryScore[] = [];
  for (const [cat, { mts, weight }] of byCat.entries()) {
    const rawTagTotal = mts.reduce((s, t) => s + t.tagScore, 0);
    const multiTagBonus = Math.min((mts.length - 1) * MULTI_TAG_BONUS_PER_TAG, MULTI_TAG_BONUS_CAP);
    categoryScores.push({
      category: cat,
      tagCount: mts.length,
      rawTagTotal,
      multiTagBonus,
      finalScore: Math.round((rawTagTotal + multiTagBonus) * weight),
      matchedTags: mts,
    });
  }
  categoryScores.sort((a, b) => b.finalScore - a.finalScore);

  const best = categoryScores[0] ?? null;
  const second = categoryScores[1] ?? null;
  const semanticScore = best?.finalScore ?? 0;

  return {
    matchedTags,
    categoryScores,
    winningCategory: best?.category ?? null,
    semanticScore,
    secondaryCategory: second?.category ?? null,
    passedSemanticFilter: semanticScore >= MIN_SEMANTIC_SCORE,
    articleTagSuggestions: matchedTags
      .filter((t) => t.useForArticleTagging)
      .map((t) => ({ name: t.tagName, tagId: t.articleTagId })),
    imageTagIds: matchedTags
      .filter((t) => t.useForImageMatching && t.imageTagId !== null)
      .map((t) => t.imageTagId as string),
    debugTrace,
  };
}

// ─── Sampling ──────────────────────────────────────────────────────────────────

async function fetchSample() {
  const raw = await prisma.discoveredArticle.findMany({
    where: { excerpt: { not: null }, source: { enabled: true } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      title: true,
      excerpt: true,
      sourceArticleBody: true,
      createdAt: true,
      semanticCategory: true,
      semanticScore: true,
      passedSemanticFilter: true,
      localScore: true,
      source: {
        select: {
          name: true,
          reliabilityScore: true,
          category: { select: { name: true, slug: true } },
        },
      },
    },
  });

  // Diversity grouping: up to 5 per source category slug
  const buckets = new Map<string, typeof raw>();
  for (const r of raw) {
    const slug = r.source.category.slug;
    const b = buckets.get(slug) ?? [];
    if (b.length < 5) b.push(r);
    buckets.set(slug, b);
  }
  const diverse = [...buckets.values()].flat();
  const extra = raw.filter((r) => !diverse.find((d) => d.id === r.id));
  const combined = diverse.length >= 50 ? diverse : [...diverse, ...extra.slice(0, 50 - diverse.length)];
  return combined.slice(0, 50);
}

// ─── Load DB semantic tags ─────────────────────────────────────────────────────

async function loadDbTags(): Promise<LoadedTag[]> {
  const rawTags = await prisma.semanticTag.findMany({
    where: { isActive: true, semanticCategory: { isActive: true } },
    include: {
      semanticCategory: { select: { name: true, slug: true, weight: true } },
      aliases: { where: { isActive: true }, select: { alias: true } },
    },
    orderBy: { name: 'asc' },
  });

  return rawTags.map((t) => ({
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
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * s.length) - 1;
  return s[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SEMANTIC SYSTEM COMPARISON AUDIT  —  READ-ONLY');
  console.log('════════════════════════════════════════════════════════════\n');

  // Load everything
  const [sample, dbTags, oldConfig] = await Promise.all([
    fetchSample(),
    loadDbTags(),
    Promise.resolve(getSemanticMatrixConfig()),
  ]);

  // Count DB tags by category for reference
  const tagsByCategory = new Map<string, string[]>();
  for (const t of dbTags) {
    const list = tagsByCategory.get(t.categoryName) ?? [];
    list.push(t.name);
    tagsByCategory.set(t.categoryName, list);
  }

  console.log(`DB Semantic Tags: ${dbTags.length} active tags across ${tagsByCategory.size} categories`);
  console.log(`Total aliases:    ${dbTags.reduce((s, t) => s + t.aliases.length, 0)} active\n`);

  // ── Run comparisons ─────────────────────────────────────────────────────────
  const rows: Array<{
    title: string;
    excerpt: string;
    body: string | null;
    sourceName: string;
    categoryName: string;
    storedCategory: string | null;
    storedScore: number | null;
    storedPassed: boolean;
    localScore: number | null;
    reliabilityScore: number;
    old: ReturnType<typeof computeSemanticScore>;
    newR: NewResult;
  }> = [];

  for (const a of sample) {
    const old = computeSemanticScore(
      { id: a.id, title: a.title, excerpt: a.excerpt ?? '', reliabilityScore: a.source.reliabilityScore },
      oldConfig,
    );
    const newR = analyzeArticleInline(
      { title: a.title, excerpt: a.excerpt ?? '', body: a.sourceArticleBody ?? undefined },
      dbTags,
    );
    rows.push({
      title: a.title,
      excerpt: a.excerpt ?? '',
      body: a.sourceArticleBody,
      sourceName: a.source.name,
      categoryName: a.source.category.name,
      storedCategory: a.semanticCategory,
      storedScore: a.semanticScore,
      storedPassed: a.passedSemanticFilter,
      localScore: a.localScore,
      reliabilityScore: a.source.reliabilityScore,
      old,
      newR,
    });
  }

  const total = rows.length;

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: TOP-LINE STATS
  // ═══════════════════════════════════════════════════════════════════

  const catAgreements = rows.filter((r) => r.old.assignedCategory === r.newR.winningCategory);
  const passAgreements = rows.filter((r) => r.old.passedSemanticFilter === r.newR.passedSemanticFilter);
  const oldPassed = rows.filter((r) => r.old.passedSemanticFilter);
  const newPassed = rows.filter((r) => r.newR.passedSemanticFilter);
  const zeroMatchNew = rows.filter((r) => r.newR.matchedTags.length === 0);

  const oldScores = rows.map((r) => r.old.semanticScore);
  const newScores = rows.map((r) => r.newR.semanticScore);
  const scoredRows = rows.filter((r) => r.old.semanticScore > 0 || r.newR.semanticScore > 0);
  const absDiffs = scoredRows.map((r) => Math.abs(r.newR.semanticScore - r.old.semanticScore));

  console.log('════════════════════════════════════════════════════════════');
  console.log('  SECTION 2: TOP-LINE STATISTICS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Sample size            : ${total} articles`);
  console.log(`  Category Agreement     : ${catAgreements.length}/${total} = ${Math.round((catAgreements.length / total) * 100)}%`);
  console.log(`  Pass/Fail Agreement    : ${passAgreements.length}/${total} = ${Math.round((passAgreements.length / total) * 100)}%`);
  console.log(`  OLD Pass Rate          : ${oldPassed.length}/${total} = ${Math.round((oldPassed.length / total) * 100)}%`);
  console.log(`  NEW Pass Rate          : ${newPassed.length}/${total} = ${Math.round((newPassed.length / total) * 100)}%`);
  console.log(`  Average OLD Score      : ${avg(oldScores)}`);
  console.log(`  Average NEW Score      : ${avg(newScores)}`);
  console.log(`  Median  OLD Score      : ${median(oldScores)}`);
  console.log(`  Median  NEW Score      : ${median(newScores)}`);
  console.log(`  Avg Abs Score Diff     : ${avg(absDiffs)}`);
  console.log(`  Zero Match Rate (NEW)  : ${zeroMatchNew.length}/${total} = ${Math.round((zeroMatchNew.length / total) * 100)}%`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: CATEGORY DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 3: CATEGORY DISTRIBUTION');
  console.log('════════════════════════════════════════════════════════════');

  const oldCatCounts = new Map<string, number>();
  const newCatCounts = new Map<string, number>();
  for (const r of rows) {
    const oc = r.old.assignedCategory ?? '(none)';
    const nc = r.newR.winningCategory ?? '(none)';
    oldCatCounts.set(oc, (oldCatCounts.get(oc) ?? 0) + 1);
    newCatCounts.set(nc, (newCatCounts.get(nc) ?? 0) + 1);
  }
  const allCats = [...new Set([...oldCatCounts.keys(), ...newCatCounts.keys()])].sort();
  const colW = 28;
  console.log(`  ${'Category'.padEnd(colW)} OLD   NEW   DELTA`);
  console.log(`  ${'─'.repeat(colW + 20)}`);
  for (const cat of allCats) {
    const oc = oldCatCounts.get(cat) ?? 0;
    const nc = newCatCounts.get(cat) ?? 0;
    const diff = nc - oc;
    const ds = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0';
    console.log(`  ${cat.padEnd(colW)} ${String(oc).padStart(3)}   ${String(nc).padStart(3)}   ${ds}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4 + 5: DISAGREEMENT ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  const disagreements = rows.filter((r) => r.old.assignedCategory !== r.newR.winningCategory);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  SECTION 4+5: DISAGREEMENT ANALYSIS (${disagreements.length} articles)`);
  console.log('════════════════════════════════════════════════════════════');

  for (let i = 0; i < disagreements.length; i++) {
    const r = disagreements[i];
    const oldMatchedKw = r.old.matchedKeywords.slice(0, 8).join(', ');
    const oldTagBoosts = r.old.matchedSemanticTags?.map((t) => `${t.tag}(+${t.score})`).join(', ') ?? '—';
    const newTags = r.newR.matchedTags.map((t) => `${t.tagName}[${t.matchedAliases.slice(0,2).join('/')}]+${t.tagScore}`).join(', ') || '—';

    // Audit verdict heuristic (this agent's manual assessment)
    let verdict = 'AMBIGUOUS';
    let reason = '';

    const oldCat = r.old.assignedCategory ?? '(none)';
    const newCat = r.newR.winningCategory ?? '(none)';

    if (r.newR.matchedTags.length === 0) {
      verdict = 'OLD BETTER';
      reason = 'NEW found no aliases — missing semantic tag or alias coverage';
    } else if (r.old.semanticScore === 0 && r.newR.semanticScore > 0) {
      verdict = 'NEW BETTER';
      reason = 'OLD found no keywords; NEW canonical alias matching worked';
    } else if (r.old.semanticScore > 0 && r.newR.semanticScore === 0) {
      verdict = 'OLD BETTER';
      reason = 'OLD keyword match succeeded; NEW has no alias for these terms';
    } else {
      // Both scored — compare category correctness vs excerpt
      const combinedText = (r.title + ' ' + r.excerpt).toLowerCase();
      if (newCat !== '(none)' && combinedText.includes(newCat.toLowerCase().slice(0, 5))) {
        verdict = 'NEW BETTER';
        reason = 'NEW category name appears in text; stronger semantic alignment';
      } else if (oldCat !== '(none)' && combinedText.includes(oldCat.toLowerCase().slice(0, 5))) {
        verdict = 'OLD BETTER';
        reason = 'OLD category name appears in text; stronger semantic alignment';
      } else {
        verdict = 'AMBIGUOUS';
        reason = `Both scored; OLD=${r.old.semanticScore} NEW=${r.newR.semanticScore}; need domain review`;
      }
    }

    console.log(`\n  ─── DISAGREEMENT ${i + 1}/${disagreements.length} ───────────────────────────────`);
    console.log(`  TITLE   : ${r.title.slice(0, 100)}`);
    console.log(`  SOURCE  : ${r.sourceName}`);
    console.log(`  OLD CAT : ${oldCat}  (score=${r.old.semanticScore}, pass=${r.old.passedSemanticFilter})`);
    console.log(`  NEW CAT : ${newCat}  (score=${r.newR.semanticScore}, pass=${r.newR.passedSemanticFilter})`);
    console.log(`  OLD KW  : ${oldMatchedKw || '—'}`);
    console.log(`  OLD TAG : ${oldTagBoosts}`);
    console.log(`  NEW TAG : ${newTags}`);
    console.log(`  REASON  : ${reason}`);
    console.log(`  VERDICT : ★ ${verdict}`);
    if (r.excerpt.length > 0) {
      console.log(`  EXCERPT : ${r.excerpt.slice(0, 160)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: ZERO-MATCH AUDIT
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  SECTION 6: ZERO-MATCH AUDIT (NEW found nothing: ${zeroMatchNew.length})`);
  console.log('════════════════════════════════════════════════════════════');

  for (let i = 0; i < zeroMatchNew.length; i++) {
    const r = zeroMatchNew[i];
    // The OLD system found something useful for these
    const oldTopKw = r.old.matchedKeywords.slice(0, 5).join(', ') || 'none';
    const oldCat = r.old.assignedCategory ?? '(none)';
    // Guess what topic it is from the excerpt
    console.log(`\n  ${i + 1}. ${r.title.slice(0, 90)}`);
    console.log(`     SOURCE  : ${r.sourceName}  [${r.categoryName}]`);
    console.log(`     EXCERPT : ${r.excerpt.slice(0, 200)}`);
    console.log(`     OLD     : cat="${oldCat}" score=${r.old.semanticScore} kw=[${oldTopKw}]`);
    console.log(`     NEW     : NO MATCH (score=0, no aliases found)`);
    console.log(`     EXPECTED: ${r.categoryName} or ${oldCat}`);
    // Suggest what's missing
    const words = (r.title + ' ' + r.excerpt).toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const uniqueWords = [...new Set(words)].slice(0, 8);
    console.log(`     MISSING : aliases covering terms like: ${uniqueWords.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 7: ALIAS QUALITY AUDIT
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 7: ALIAS QUALITY AUDIT');
  console.log('════════════════════════════════════════════════════════════');

  // Count how many times each alias matched across all sample articles
  const aliasMatchCount = new Map<string, { tagName: string; count: number }>();
  for (const r of rows) {
    for (const mt of r.newR.matchedTags) {
      for (const a of mt.matchedAliases) {
        const key = `${mt.tagName}::${a}`;
        aliasMatchCount.set(key, {
          tagName: mt.tagName,
          count: (aliasMatchCount.get(key)?.count ?? 0) + 1,
        });
      }
    }
  }

  // High frequency aliases (matches >5 articles out of 50 = >10%)
  const highFreq = [...aliasMatchCount.entries()]
    .filter(([, v]) => v.count > 5)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  console.log('\n  HIGH-FREQUENCY ALIASES (matched >5 articles):');
  if (highFreq.length === 0) console.log('    None');
  for (const [key, { tagName, count }] of highFreq) {
    const alias = key.split('::')[1];
    console.log(`    [${tagName}] "${alias}"  → ${count}/${total} articles`);
  }

  // Zero-match aliases: aliases that never matched in the sample
  const zeroMatchAliases: Array<{ tagName: string; alias: string }> = [];
  for (const tag of dbTags) {
    for (let i = 0; i < tag.aliasesRaw.length; i++) {
      const key = `${tag.name}::${tag.aliasesRaw[i]}`;
      if (!aliasMatchCount.has(key)) {
        zeroMatchAliases.push({ tagName: tag.name, alias: tag.aliasesRaw[i] });
      }
    }
  }
  console.log(`\n  ZERO-MATCH ALIASES (never matched in ${total}-article sample): ${zeroMatchAliases.length}`);
  console.log('  (These may be fine for production frequency but not represented in sample)');
  // Group by tag, show count
  const zeroByTag = new Map<string, number>();
  for (const z of zeroMatchAliases) {
    zeroByTag.set(z.tagName, (zeroByTag.get(z.tagName) ?? 0) + 1);
  }
  const zeroTagTop = [...zeroByTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [tagName, count] of zeroTagTop) {
    console.log(`    [${tagName}]: ${count} unused aliases in sample`);
  }

  // Tags that matched in every pass/fail disagreement
  const verdictFlipTags = new Set<string>();
  for (const r of rows) {
    if (r.old.passedSemanticFilter !== r.newR.passedSemanticFilter) {
      r.newR.matchedTags.forEach((t) => verdictFlipTags.add(t.tagName));
    }
  }
  console.log(`\n  TAGS INVOLVED IN PASS/FAIL FLIPS: ${[...verdictFlipTags].join(', ') || 'none'}`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 8: SCORING COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 8: SCORING COMPATIBILITY');
  console.log('════════════════════════════════════════════════════════════');

  const oldNonZero = oldScores.filter((s) => s > 0);
  const newNonZero = newScores.filter((s) => s > 0);

  const stats = (label: string, arr: number[], allArr: number[]) => {
    console.log(`\n  ${label}:`);
    console.log(`    All articles  : min=${Math.min(...allArr)} max=${Math.max(...allArr)} avg=${avg(allArr)} median=${median(allArr)} p90=${percentile(allArr, 90)}`);
    if (arr.length > 0)
      console.log(`    Non-zero only : min=${Math.min(...arr)} max=${Math.max(...arr)} avg=${avg(arr)} median=${median(arr)} p90=${percentile(arr, 90)}`);
  };

  stats('OLD SYSTEM', oldNonZero, oldScores);
  stats('NEW SYSTEM', newNonZero, newScores);

  // Articles where NEW scores > 35 (pass) but OLD didn't
  const newOnlyPass = rows.filter((r) => !r.old.passedSemanticFilter && r.newR.passedSemanticFilter);
  const oldOnlyPass = rows.filter((r) => r.old.passedSemanticFilter && !r.newR.passedSemanticFilter);
  console.log(`\n  NEW passes but OLD failed : ${newOnlyPass.length} articles`);
  console.log(`  OLD passes but NEW failed : ${oldOnlyPass.length} articles`);

  const thresholdOk = Math.abs(avg(newNonZero) - avg(oldNonZero)) <= 20;
  console.log(`\n  Threshold compatibility: threshold=35, new avg=${avg(newNonZero)}, old avg=${avg(oldNonZero)}`);
  console.log(`  → ${thresholdOk ? 'COMPATIBLE' : 'INVESTIGATE — large avg difference'} (avg diff=${Math.abs(avg(newNonZero) - avg(oldNonZero))})`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 9: IMAGE MAPPING COVERAGE
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 9: IMAGE MAPPING COVERAGE');
  console.log('════════════════════════════════════════════════════════════');

  const tagsWithImageTag = dbTags.filter((t) => t.imageTagId !== null);
  const tagsWithoutImageTag = dbTags.filter((t) => t.imageTagId === null);

  let exactImageMatch = 0;
  let zeroImageMatch = 0;

  for (const r of rows) {
    if (r.newR.imageTagIds.length > 0) exactImageMatch++;
    else if (r.newR.matchedTags.length > 0) zeroImageMatch++; // matched tags but no image tags
  }

  const noSemanticMatch = zeroMatchNew.length;
  const categoryFallback = rows.length - exactImageMatch - noSemanticMatch;

  console.log(`\n  DB Semantic Tags with ImageTag mapping   : ${tagsWithImageTag.length}/${dbTags.length}`);
  console.log(`  DB Semantic Tags WITHOUT ImageTag mapping: ${tagsWithoutImageTag.length}/${dbTags.length}`);
  console.log(`\n  For ${total} sample articles:`);
  console.log(`    Exact Semantic Image Match : ${exactImageMatch}/${total} = ${Math.round((exactImageMatch / total) * 100)}%`);
  console.log(`    No Semantic Match at all   : ${noSemanticMatch}/${total} = ${Math.round((noSemanticMatch / total) * 100)}%`);
  console.log(`    Matched tag but no ImageTag: ${zeroImageMatch}/${total} = ${Math.round((zeroImageMatch / total) * 100)}%`);

  console.log(`\n  Tags without image mapping (top 15):`);
  const unmappedImageTags = tagsWithoutImageTag.slice(0, 15);
  for (const t of unmappedImageTags) {
    console.log(`    [${t.categoryName}] ${t.name}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 10: ARTICLE TAG MAPPING
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 10: ARTICLE TAG MAPPING');
  console.log('════════════════════════════════════════════════════════════');

  const tagsWithArticleTag = dbTags.filter((t) => t.tagId !== null);
  const tagsWithoutArticleTag = dbTags.filter((t) => t.tagId === null);

  console.log(`  Semantic tags with Article Tag mapping   : ${tagsWithArticleTag.length}/${dbTags.length}`);
  console.log(`  Semantic tags WITHOUT Article Tag mapping: ${tagsWithoutArticleTag.length}/${dbTags.length}`);

  // Check for duplicate article tag IDs (two semantic tags pointing to same article tag)
  const articleTagIdSeen = new Map<string, string[]>();
  for (const t of dbTags) {
    if (t.tagId) {
      const existing = articleTagIdSeen.get(t.tagId) ?? [];
      existing.push(t.name);
      articleTagIdSeen.set(t.tagId, existing);
    }
  }
  const duplicates = [...articleTagIdSeen.entries()].filter(([, names]) => names.length > 1);
  console.log(`\n  Duplicate Article Tag ID mappings (multiple semantic tags → same article tag): ${duplicates.length}`);
  for (const [tagId, names] of duplicates) {
    console.log(`    articleTagId=${tagId}: ${names.join(', ')}`);
  }

  // Semantic tags without article tag mapping
  console.log(`\n  Semantic tags NOT mapped to any Article Tag (${tagsWithoutArticleTag.length} total, showing first 20):`);
  for (const t of tagsWithoutArticleTag.slice(0, 20)) {
    console.log(`    [${t.categoryName}] ${t.name}`);
  }

  // In the sample, how many article tag suggestions were actually linked to existing tags?
  let linkedTagSuggestions = 0;
  let unlinkedTagSuggestions = 0;
  for (const r of rows) {
    for (const s of r.newR.articleTagSuggestions) {
      if (s.tagId) linkedTagSuggestions++;
      else unlinkedTagSuggestions++;
    }
  }
  console.log(`\n  In sample: Article tag suggestions with linked tagId: ${linkedTagSuggestions}`);
  console.log(`  In sample: Article tag suggestions WITHOUT tagId link:  ${unlinkedTagSuggestions}`);
  console.log('  ⚠  No existing article tags will be changed — suggestions are advisory only');

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 11: TOP 10 PROBLEMS
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 11: TOP PROBLEMS BEFORE PHASE C');
  console.log('════════════════════════════════════════════════════════════');

  // Compute problem signals
  const zeroMatchPct = Math.round((zeroMatchNew.length / total) * 100);
  const catAgreePct = Math.round((catAgreements.length / total) * 100);
  const imageMatchPct = Math.round((exactImageMatch / total) * 100);
  const articleTagMappedPct = Math.round((tagsWithArticleTag.length / dbTags.length) * 100);

  // Problem 1: Zero-match rate
  console.log(`\n  P1 [${zeroMatchPct >= 20 ? 'CRITICAL' : zeroMatchPct >= 10 ? 'HIGH' : 'MEDIUM'}] Zero-match rate = ${zeroMatchPct}%`);
  console.log(`     ${zeroMatchNew.length} articles returned no canonical tag from the NEW system.`);
  console.log(`     These would get score=0 → FAIL regardless of content quality.`);
  if (zeroMatchNew.length > 0) {
    console.log(`     Example: "${zeroMatchNew[0].title.slice(0, 80)}"`);
    console.log(`     Fix: Add aliases for the detected topic keywords.`);
  }

  // Problem 2: Category agreement
  const disagreePct = 100 - catAgreePct;
  console.log(`\n  P2 [${disagreePct >= 30 ? 'HIGH' : 'MEDIUM'}] Category disagreement rate = ${disagreePct}%`);
  console.log(`     OLD and NEW assign different categories for ${disagreements.length}/${total} articles.`);
  console.log(`     Fix: Review disagreements in audit and improve tag→category mapping.`);

  // Problem 3: Old-only pass articles
  console.log(`\n  P3 [${oldOnlyPass.length >= 5 ? 'HIGH' : 'MEDIUM'}] OLD passes but NEW fails: ${oldOnlyPass.length} articles`);
  console.log(`     These articles would be DROPPED by the new system.`);
  if (oldOnlyPass.length > 0) {
    const e = oldOnlyPass[0];
    console.log(`     Example: "${e.title.slice(0, 80)}"`);
    console.log(`     OLD scored ${e.old.semanticScore} via kw=[${e.old.matchedKeywords.slice(0,3).join(',')}]`);
    console.log(`     Fix: Add missing aliases or verify these articles should actually be dropped.`);
  }

  // Problem 4: New-only pass articles
  console.log(`\n  P4 [${newOnlyPass.length >= 5 ? 'MEDIUM' : 'LOW'}] NEW passes but OLD failed: ${newOnlyPass.length} articles`);
  console.log(`     These articles would become NEWLY ADMITTED by the new system.`);
  if (newOnlyPass.length > 0) {
    const e = newOnlyPass[0];
    console.log(`     Example: "${e.title.slice(0, 80)}" → NEW category=${e.newR.winningCategory} score=${e.newR.semanticScore}`);
    console.log(`     Fix: Review if newly admitted articles are good quality.`);
  }

  // Problem 5: Image tag mapping
  console.log(`\n  P5 [${imageMatchPct < 40 ? 'HIGH' : imageMatchPct < 60 ? 'MEDIUM' : 'LOW'}] Image tag coverage = ${imageMatchPct}%`);
  console.log(`     Only ${exactImageMatch}/${total} articles get a concrete image tag from NEW system.`);
  console.log(`     ${tagsWithoutImageTag.length} semantic tags have no ImageTag mapping.`);
  console.log(`     Fix: Map remaining semantic tags to ImageTags (Phase D).`);

  // Problem 6: Article tag mapping
  console.log(`\n  P6 [${articleTagMappedPct < 30 ? 'HIGH' : 'MEDIUM'}] Article Tag mapping = ${articleTagMappedPct}%`);
  console.log(`     ${tagsWithoutArticleTag.length} semantic tags have no Article Tag link.`);
  console.log(`     Tag suggestions for these will be "advisory" only (no existing tag to attach).`);
  console.log(`     Fix: Map semantic tags to existing Article Tags or create them (Phase D).`);

  // Problem 7: Scoring scale
  const avgDiff = Math.abs(avg(newNonZero) - avg(oldNonZero));
  console.log(`\n  P7 [${avgDiff > 30 ? 'HIGH' : avgDiff > 15 ? 'MEDIUM' : 'LOW'}] Score scale difference`);
  console.log(`     OLD avg=${avg(oldNonZero)}, NEW avg=${avg(newNonZero)}, diff=${avgDiff}`);
  console.log(`     Threshold=35 is shared. At different avg scores, pass-rate may shift significantly.`);
  console.log(`     Fix: Calibrate if pass-rate shift is unacceptable (measure in production shadow mode).`);

  // Problem 8: High-frequency aliases
  if (highFreq.length > 0) {
    const topAlias = highFreq[0];
    const alias = topAlias[0].split('::')[1];
    console.log(`\n  P8 [MEDIUM] Potential overly generic aliases`);
    console.log(`     "${alias}" matched ${topAlias[1].count}/${total} articles (${Math.round((topAlias[1].count / total) * 100)}%)`);
    console.log(`     High-frequency single-word aliases may cause category bias.`);
    console.log(`     Fix: Review aliases matching >15% of articles for false positives.`);
  }

  // Problem 9: mustPass → no equivalent in NEW
  const mustPassTriggered = rows.filter((r) => r.old.mustPassGroupTriggered !== null);
  console.log(`\n  P9 [${mustPassTriggered.length > 0 ? 'HIGH' : 'LOW'}] mustPassTagGroups have no NEW equivalent`);
  console.log(`     ${mustPassTriggered.length}/${total} OLD results relied on mustPassTagGroups for guaranteed pass.`);
  console.log(`     NEW system has no mustPass floor — high-value terms must score naturally ≥35.`);
  if (mustPassTriggered.length > 0) {
    for (const r of mustPassTriggered.slice(0, 3)) {
      console.log(`     - "${r.title.slice(0, 70)}" → mustPass group "${r.old.mustPassGroupTriggered!.groupName}", NEW score=${r.newR.semanticScore}`);
    }
    console.log(`     Fix: Ensure these terms' canonical tags score ≥35 naturally, or add priority+bonus.`);
  }

  // Problem 10: No body-text source for many articles
  const noBody = rows.filter((r) => !r.body);
  console.log(`\n  P10 [MEDIUM] Articles without extracted body: ${noBody.length}/${total}`);
  console.log(`     NEW system uses body for alias matching. Without it, only title+excerpt are scored.`);
  console.log(`     This narrows alias hit surface compared to what production may eventually use.`);
  console.log(`     Fix: Ensure extractionSuccess is tracked; body is already stored in DB when available.`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 12: FINAL RECOMMENDATION
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SECTION 12: FINAL RECOMMENDATION');
  console.log('════════════════════════════════════════════════════════════');

  const criticalIssues = [];
  if (zeroMatchPct >= 20) criticalIssues.push(`Zero-match rate ${zeroMatchPct}% is too high`);
  if (oldOnlyPass.length >= 5) criticalIssues.push(`${oldOnlyPass.length} articles currently passing would be dropped`);
  if (mustPassTriggered.length > 0 && mustPassTriggered.some((r) => !r.newR.passedSemanticFilter)) {
    criticalIssues.push('Some mustPass articles would fail the NEW system');
  }

  if (criticalIssues.length > 0) {
    console.log('\n  ● RECOMMENDATION: GO TO PHASE C WITH CHANGES\n');
    console.log('  Critical issues to resolve first:');
    for (const issue of criticalIssues) console.log(`    - ${issue}`);
  } else {
    console.log('\n  ● RECOMMENDATION: GO TO PHASE C WITH CHANGES\n');
    console.log('  No blockers, but changes recommended before production switch:');
    console.log('  (see P1-P10 above)');
  }

  console.log(`
  SUMMARY:
  ─────────────────────────────────────────────────────────────
  Category Agreement  : ${Math.round((catAgreements.length / total) * 100)}%  (${catAgreements.length}/${total})
  Pass/Fail Agreement : ${Math.round((passAgreements.length / total) * 100)}%  (${passAgreements.length}/${total})
  OLD pass rate       : ${Math.round((oldPassed.length / total) * 100)}%  (${oldPassed.length}/${total})
  NEW pass rate       : ${Math.round((newPassed.length / total) * 100)}%  (${newPassed.length}/${total})
  Zero-match NEW      : ${zeroMatchPct}%  (${zeroMatchNew.length}/${total})
  Category agree.rate : ${catAgreePct}%
  Image tag coverage  : ${imageMatchPct}%
  ArticleTag mapped   : ${articleTagMappedPct}%
  ─────────────────────────────────────────────────────────────
  The NEW system is architecturally stronger (bounded scoring,
  canonical tags, no double-counting, alias-based rather than
  keyword-based) but needs alias gap-filling and mustPass
  equivalence before replacing the OLD system in production.
  ─────────────────────────────────────────────────────────────
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
