import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { scoreArticles, type ArticleScore } from '@/lib/ai/content-scorer';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FEED_TIMEOUT_MS = 12_000;
const MAX_FEEDS = 2;
const ITEMS_PER_FEED = 3;

async function fetchWithTimeout(url: string, name: string) {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${FEED_TIMEOUT_MS}ms`)), FEED_TIMEOUT_MS)
  );
  try {
    const items = await Promise.race([fetchFeed(url), timer]);
    return { ok: true as const, name, url, items };
  } catch (err) {
    return { ok: false as const, name, url, error: err instanceof Error ? err.message : String(err) };
  }
}

function detectScale(rawMax: number): '0-1' | '0-10' | '0-100' | 'all_zero' {
  if (rawMax === 0) return 'all_zero';
  if (rawMax <= 1) return '0-1';
  if (rawMax <= 10) return '0-10';
  return '0-100';
}

function normalizer(scale: ReturnType<typeof detectScale>): number {
  if (scale === '0-1') return 100;
  if (scale === '0-10') return 10;
  return 1;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 1. Load settings ──────────────────────────────────────────────────────
  const settings = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  const threshold = settings?.minimumImportanceScore ?? 40;

  // ── 2. Load feeds ─────────────────────────────────────────────────────────
  const feedSources = await prisma.rssSource.findMany({
    where: { enabled: true, allowAutoGeneration: true },
    select: { id: true, name: true, url: true },
    take: MAX_FEEDS,
  });

  if (feedSources.length === 0) {
    return Response.json({
      ok: false,
      error: 'No feeds with enabled=true AND allowAutoGeneration=true found.',
      hint: 'Go to /admin/sources and enable at least one feed for Auto Pipeline.',
    });
  }

  // ── 3. Fetch RSS items (parallel, with per-feed timeout) ──────────────────
  const feedResults = await Promise.all(feedSources.map((s) => fetchWithTimeout(s.url, s.name)));

  const feedDiagnostics = feedResults.map((r) =>
    r.ok
      ? { feed: r.name, url: r.url, status: 'ok', itemsFetched: r.items.length }
      : { feed: r.name, url: r.url, status: 'error', error: r.error }
  );

  const rawItems: { feedName: string; title: string; url: string; excerpt: string }[] = [];
  for (const result of feedResults) {
    if (!result.ok) continue;
    for (const item of result.items.slice(0, ITEMS_PER_FEED)) {
      if (!item.title || !item.url) continue;
      rawItems.push({ feedName: result.name, title: item.title, url: item.url, excerpt: item.excerpt ?? '' });
    }
  }

  if (rawItems.length === 0) {
    return Response.json({
      ok: false,
      feeds: feedDiagnostics,
      error: 'All feeds returned 0 valid items (title+url required).',
    });
  }

  // ── 4. AI scoring ─────────────────────────────────────────────────────────
  const toScore = rawItems.map((item) => ({
    id: item.url,
    title: item.title,
    excerpt: item.excerpt || null,
  }));

  let scores: ArticleScore[] = [];
  let aiError: string | null = null;
  try {
    scores = await scoreArticles(toScore);
  } catch (err) {
    aiError = err instanceof Error ? err.message : String(err);
  }

  // ── 5. Scale detection ────────────────────────────────────────────────────
  const overallScores = scores.map((s) => s.overallScore);
  const rawMax = overallScores.length > 0 ? Math.max(...overallScores) : 0;
  const rawMin = overallScores.length > 0 ? Math.min(...overallScores) : 0;
  const rawAvg = overallScores.length > 0
    ? Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length)
    : 0;

  const scaleDetected = detectScale(rawMax);
  const mult = normalizer(scaleDetected);

  // ── 6. Per-item results ───────────────────────────────────────────────────
  const results = rawItems.map((item) => {
    const score = scores.find((s) => s.id === item.url);
    const rawScore = score?.overallScore ?? null;
    const normalizedScore = rawScore !== null ? Math.min(100, rawScore * mult) : null;
    const passed = normalizedScore !== null ? normalizedScore >= threshold : false;

    let reason: string;
    if (!score) {
      reason = 'AI scorer returned no score for this item (parse failure or ID mismatch)';
    } else if (normalizedScore === null) {
      reason = 'normalizedScore is null';
    } else if (!passed) {
      reason = `normalizedScore ${normalizedScore} < threshold ${threshold}`;
    } else {
      reason = `passed (${normalizedScore} >= ${threshold})`;
    }

    return {
      title: item.title,
      source: item.feedName,
      rawScore,
      normalizedScore,
      passed,
      reason,
      aiDetail: score
        ? {
            viralScore: score.viralScore,
            discussionScore: score.discussionScore,
            businessValueScore: score.businessValueScore,
            searchPotentialScore: score.searchPotentialScore,
            controversyScore: score.controversyScore,
            facebookDiscussionScore: score.facebookDiscussionScore,
            overallScore: score.overallScore,
            reasoning: score.reasoning,
          }
        : null,
    };
  });

  // ── 7. Bug detection ──────────────────────────────────────────────────────
  const normalizedScores = results.map((r) => r.normalizedScore ?? 0);
  const normMax = normalizedScores.length > 0 ? Math.max(...normalizedScores) : 0;
  const normAvg = normalizedScores.length > 0
    ? Math.round(normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length)
    : 0;
  const passedCount = results.filter((r) => r.passed).length;

  let bugFound = false;
  const bugs: string[] = [];

  if (aiError) {
    bugFound = true;
    bugs.push(`AI call failed: ${aiError}`);
  }
  if (scores.length === 0 && !aiError) {
    bugFound = true;
    bugs.push('scoreArticles() returned empty array — JSON parse failed or response_format mismatch');
  }
  if (scaleDetected === 'all_zero') {
    bugFound = true;
    bugs.push('All overallScore values are 0 — AI may be returning zeroed scores or parse failed');
  }
  if (scaleDetected === '0-1') {
    bugFound = true;
    bugs.push('AI is returning scores 0-1 (e.g. 0.7) instead of 0-100. Multiplied ×100 to normalize.');
  }
  if (scaleDetected === '0-10') {
    bugFound = true;
    bugs.push('AI is returning scores 0-10 instead of 0-100. Multiplied ×10 to normalize.');
  }
  if (scores.length > 0 && scores.length < rawItems.length) {
    bugFound = true;
    bugs.push(`ID mismatch: sent ${rawItems.length} items but got ${scores.length} scores back. ${rawItems.length - scores.length} items have no score.`);
  }
  if (!bugFound && passedCount === 0 && normalizedScores.some((s) => s > 0)) {
    bugFound = true;
    bugs.push(`Threshold ${threshold}/100 is too high — max normalized score is only ${normMax}. Lower minimumImportanceScore.`);
  }

  const recommendedThreshold = normMax > 0 ? Math.max(5, Math.round(normMax * 0.5)) : threshold;
  const expectedGeneratedArticles = passedCount;

  return Response.json({
    ok: true,

    config: {
      feedsChecked: feedSources.length,
      itemsPerFeed: ITEMS_PER_FEED,
      totalItemsSent: rawItems.length,
      threshold,
    },

    feeds: feedDiagnostics,

    rssItems: rawItems.length,
    threshold,

    rawScoreStats: {
      min: rawMin,
      max: rawMax,
      average: rawAvg,
      scaleAsReturned: `0-${rawMax === 0 ? '?' : rawMax <= 1 ? '1' : rawMax <= 10 ? '10' : '100'}`,
    },

    scoreStats: {
      min: normalizedScores.length > 0 ? Math.min(...normalizedScores) : 0,
      max: normMax,
      average: normAvg,
    },

    results,

    scoreScaleDetected: scaleDetected,
    scaleMultiplierApplied: mult,
    bugFound,
    bugs,
    recommendedThreshold,
    expectedGeneratedArticles,

    ...(aiError ? { aiError } : {}),
  });
}
