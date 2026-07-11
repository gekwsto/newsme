/**
 * /admin/semantic-system/compare
 *
 * Read-only audit: OLD (JSON-based) vs NEW (DB-backed) semantic system.
 *
 * Safety:  Reads from DB.  Writes nothing.  No articles created/tagged/published.
 * Runs both scoring systems in-memory using current configs.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';
import {
  computeSemanticScore,
  getSemanticMatrixConfig,
  type CategoryBreakdown,
} from '@/lib/semantic-filter';
import {
  analyzeArticle,
  loadSemanticConfig,
  type SemanticAnalysisResult,
  type CategoryScore,
} from '@/lib/semantic-service-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata: Metadata = {
  title: `Semantic Comparison | Admin ${BRAND.name}`,
};

// ─── Data types ────────────────────────────────────────────────────────────────

interface ArticleForCompare {
  id: string;
  title: string;
  excerpt: string;
  body: string | null;
  sourceName: string;
  categoryName: string;   // assigned category from RSS source
  reliabilityScore: number;
  createdAt: Date;
  storedSemanticCategory: string | null;
  storedSemanticScore: number | null;
  storedPassedFilter: boolean;
}

interface ComparisonRow {
  article: ArticleForCompare;
  old: ReturnType<typeof computeSemanticScore>;
  newResult: SemanticAnalysisResult;
  sameCategory: boolean;
  samePassed: boolean;
  scoreDiff: number;
}

// ─── Article sampling ──────────────────────────────────────────────────────────
// Aim for ≥5 per category slug, minimum 30 total.

async function fetchDiverseSample(target = 50): Promise<ArticleForCompare[]> {
  // Fetch recent articles with enough text
  const raw = await prisma.discoveredArticle.findMany({
    where: {
      excerpt: { not: null },
      source: { enabled: true },
    },
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
      source: {
        select: {
          name: true,
          reliabilityScore: true,
          category: { select: { name: true, slug: true } },
        },
      },
    },
  });

  // Group by source category slug, pick up to 5 per group
  const buckets = new Map<string, typeof raw>();
  for (const r of raw) {
    const slug = r.source.category.slug;
    const bucket = buckets.get(slug) ?? [];
    if (bucket.length < 5) bucket.push(r);
    buckets.set(slug, bucket);
  }

  // Flatten, then fill to target if needed
  const diverse = [...buckets.values()].flat();
  const extra = raw.filter((r) => !diverse.find((d) => d.id === r.id));
  const combined = diverse.length >= target ? diverse : [...diverse, ...extra.slice(0, target - diverse.length)];
  const sample = combined.slice(0, target);

  return sample.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: r.excerpt ?? '',
    body: r.sourceArticleBody,
    sourceName: r.source.name,
    categoryName: r.source.category.name,
    reliabilityScore: r.source.reliabilityScore,
    createdAt: r.createdAt,
    storedSemanticCategory: r.semanticCategory,
    storedSemanticScore: r.semanticScore,
    storedPassedFilter: r.passedSemanticFilter,
  }));
}

// ─── Comparison runner ─────────────────────────────────────────────────────────

async function runComparisons(): Promise<ComparisonRow[]> {
  const [articles, newConfig, oldConfig] = await Promise.all([
    fetchDiverseSample(50),
    loadSemanticConfig(),
    Promise.resolve(getSemanticMatrixConfig()),
  ]);

  const rows = await Promise.all(
    articles.map(async (article) => {
      const old = computeSemanticScore(
        {
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          reliabilityScore: article.reliabilityScore,
        },
        oldConfig,
      );

      const newResult = await analyzeArticle({
        title: article.title,
        excerpt: article.excerpt,
        body: article.body ?? undefined,
        config: newConfig,
      });

      const oldCat = old.assignedCategory ?? null;
      const newCat = newResult.winningCategory ?? null;
      const sameCategory = oldCat === newCat;
      const samePassed = old.passedSemanticFilter === newResult.passedSemanticFilter;
      const scoreDiff = newResult.semanticScore - old.semanticScore;

      return { article, old, newResult, sameCategory, samePassed, scoreDiff };
    }),
  );

  return rows;
}

// ─── Helper components ────────────────────────────────────────────────────────

function PassBadge({ passed }: { passed: boolean }) {
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
      passed
        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
    }`}>
      {passed ? 'PASS' : 'FAIL'}
    </span>
  );
}

function CatBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium">
      {name}
    </span>
  );
}

function ScoreBadge({ score, passed }: { score: number; passed: boolean }) {
  return (
    <span className={`text-xl font-bold ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
      {score}
    </span>
  );
}

function OldBreakdown({ breakdown }: { breakdown: CategoryBreakdown[] }) {
  const top = breakdown.slice(0, 5);
  if (top.length === 0) return <p className="text-xs text-slate-400">No keyword matches</p>;
  return (
    <div className="space-y-1">
      {top.map((bd) => (
        <div key={bd.category} className="text-xs flex items-baseline gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300 w-28 flex-shrink-0 truncate">{bd.category}</span>
          <span className="font-mono font-bold text-violet-600 dark:text-violet-400 w-8 text-right">{bd.finalScore}</span>
          {bd.contributions.length > 0 && (
            <span className="text-slate-400 truncate">
              [{bd.contributions.slice(0, 4).map((c) => `${c.keyword}(${c.location[0]}${c.isPriority ? '⚡' : ''}+${c.score})`).join(' ')}
              {bd.contributions.length > 4 ? ` +${bd.contributions.length - 4}` : ''}]
            </span>
          )}
          {bd.tagBoost !== undefined && bd.tagBoost > 0 && (
            <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">+{bd.tagBoost} tag</span>
          )}
          {bd.mustPassGroup && (
            <span className="text-violet-500 flex-shrink-0">mustPass</span>
          )}
        </div>
      ))}
      {breakdown.length > 5 && (
        <p className="text-[10px] text-slate-400">+{breakdown.length - 5} more categories</p>
      )}
    </div>
  );
}

function NewBreakdown({ scores }: { scores: CategoryScore[] }) {
  const top = scores.slice(0, 5);
  if (top.length === 0) return <p className="text-xs text-slate-400">No alias matches</p>;
  return (
    <div className="space-y-1">
      {top.map((cs) => (
        <div key={cs.category} className="text-xs flex items-baseline gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300 w-28 flex-shrink-0 truncate">{cs.category}</span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 w-8 text-right">{cs.finalScore}</span>
          <span className="text-slate-400 truncate">
            [{cs.matchedTags.map((t) => `${t.tagName}(${t.bestLocation[0]}+${t.tagScore})`).join(' ')}]
          </span>
          {cs.multiTagBonus > 0 && (
            <span className="text-blue-500 flex-shrink-0">+{cs.multiTagBonus}multi</span>
          )}
        </div>
      ))}
      {scores.length > 5 && (
        <p className="text-[10px] text-slate-400">+{scores.length - 5} more categories</p>
      )}
    </div>
  );
}

function AgreementBadge({ same }: { same: boolean }) {
  return (
    <span className={`text-sm font-bold ${same ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
      {same ? '✓ AGREE' : '△ DIFFER'}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SemanticComparePage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const rows = await runComparisons();

  const total = rows.length;
  const catAgreements = rows.filter((r) => r.sameCategory).length;
  const passAgreements = rows.filter((r) => r.samePassed).length;
  const oldPassCount = rows.filter((r) => r.old.passedSemanticFilter).length;
  const newPassCount = rows.filter((r) => r.newResult.passedSemanticFilter).length;
  const disagreements = rows.filter((r) => !r.sameCategory);
  const agreements = rows.filter((r) => r.sameCategory);

  // Score correlation: avg |new - old| for articles where both have a score
  const scoredRows = rows.filter((r) => r.old.semanticScore > 0 || r.newResult.semanticScore > 0);
  const avgAbsDiff = scoredRows.length > 0
    ? Math.round(scoredRows.reduce((s, r) => s + Math.abs(r.scoreDiff), 0) / scoredRows.length)
    : 0;

  // Category distribution comparison
  const oldCatCounts = new Map<string, number>();
  const newCatCounts = new Map<string, number>();
  for (const r of rows) {
    const oc = r.old.assignedCategory ?? '(none)';
    const nc = r.newResult.winningCategory ?? '(none)';
    oldCatCounts.set(oc, (oldCatCounts.get(oc) ?? 0) + 1);
    newCatCounts.set(nc, (newCatCounts.get(nc) ?? 0) + 1);
  }
  const allCats = [...new Set([...oldCatCounts.keys(), ...newCatCounts.keys()])].sort();

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Semantic Comparison Audit
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              OLD (JSON-based) vs NEW (DB-backed) · Read-only · {total} articles · fresh re-calculation
            </p>
          </div>
          <Link href="/admin/semantic-system" className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Semantic System
          </Link>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Category Agreement</p>
            <p className={`text-2xl font-bold mt-1 ${catAgreements / total >= 0.7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {Math.round((catAgreements / total) * 100)}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{catAgreements}/{total} same category</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Pass/Fail Agreement</p>
            <p className={`text-2xl font-bold mt-1 ${passAgreements / total >= 0.8 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {Math.round((passAgreements / total) * 100)}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{passAgreements}/{total} same verdict</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Pass Rate OLD → NEW</p>
            <p className="text-xl font-bold mt-1 text-slate-700 dark:text-slate-300">
              {Math.round((oldPassCount / total) * 100)}% → {Math.round((newPassCount / total) * 100)}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{oldPassCount} vs {newPassCount} articles</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Avg Score Diff |new−old|</p>
            <p className={`text-2xl font-bold mt-1 ${avgAbsDiff <= 15 ? 'text-emerald-600 dark:text-emerald-400' : avgAbsDiff <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
              {avgAbsDiff}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">pts avg absolute diff</p>
          </div>
        </div>

        {/* ── Category distribution matrix ── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Category Distribution: OLD vs NEW
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Category</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-violet-600 dark:text-violet-400">OLD count</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">NEW count</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {allCats.map((cat) => {
                  const oc = oldCatCounts.get(cat) ?? 0;
                  const nc = newCatCounts.get(cat) ?? 0;
                  const diff = nc - oc;
                  return (
                    <tr key={cat} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-1.5 font-medium text-slate-700 dark:text-slate-300">{cat}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-violet-600 dark:text-violet-400">{oc}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-indigo-600 dark:text-indigo-400">{nc}</td>
                      <td className={`px-4 py-1.5 text-right font-mono ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Disagreements (highlight first) ── */}
        {disagreements.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Category Disagreements ({disagreements.length})
            </h2>
            <div className="space-y-3">
              {disagreements.map((row) => (
                <ArticleRow key={row.article.id} row={row} />
              ))}
            </div>
          </section>
        )}

        {/* ── Agreements ── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Category Agreements ({agreements.length})
          </h2>
          <div className="space-y-3">
            {agreements.map((row) => (
              <ArticleRow key={row.article.id} row={row} />
            ))}
          </div>
        </section>

      </div>
    </AdminShell>
  );
}

// ─── Per-article row component ─────────────────────────────────────────────────

function ArticleRow({ row }: { row: ComparisonRow }) {
  const { article, old, newResult, sameCategory, samePassed, scoreDiff } = row;

  const oldMatchedSemanticTags = old.matchedSemanticTags ?? [];

  return (
    <div className={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden ${
      sameCategory
        ? 'border-slate-200 dark:border-slate-700'
        : 'border-amber-200 dark:border-amber-800'
    }`}>
      {/* ── Article header ── */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white text-sm leading-snug">{article.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {article.sourceName} · {article.categoryName} ·{' '}
            {article.createdAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
          </p>
        </div>
        <AgreementBadge same={sameCategory} />
      </div>

      {/* ── Side by side comparison ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800">

        {/* OLD */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            OLD (JSON)
          </div>
          <div className="flex items-center gap-3">
            <ScoreBadge score={old.semanticScore} passed={old.passedSemanticFilter} />
            <PassBadge passed={old.passedSemanticFilter} />
            <CatBadge name={old.assignedCategory} />
          </div>

          {/* Keywords */}
          {old.matchedKeywords.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Matched keywords</p>
              <div className="flex flex-wrap gap-1">
                {old.matchedKeywords.map((kw, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 font-mono">{kw}</span>
                ))}
              </div>
            </div>
          )}

          {/* Semantic tag matches from JSON */}
          {oldMatchedSemanticTags.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Semantic tag boosts</p>
              <div className="flex flex-wrap gap-1">
                {oldMatchedSemanticTags.map((t, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                    {t.tag} +{t.score}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* mustPass triggered */}
          {old.mustPassGroupTriggered && (
            <div className="text-[11px] px-2 py-1 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
              mustPass: {old.mustPassGroupTriggered.groupName} [{old.mustPassGroupTriggered.matchedTags.join(', ')}] → floor {old.mustPassGroupTriggered.mustPassScore}
            </div>
          )}

          {/* Category breakdown details */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              Category breakdown ({old.breakdown.length})
            </summary>
            <div className="mt-2">
              <OldBreakdown breakdown={old.breakdown} />
            </div>
          </details>
        </div>

        {/* NEW */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            NEW (DB)
          </div>
          <div className="flex items-center gap-3">
            <ScoreBadge score={newResult.semanticScore} passed={newResult.passedSemanticFilter} />
            <PassBadge passed={newResult.passedSemanticFilter} />
            <CatBadge name={newResult.winningCategory} />
          </div>

          {/* Matched canonical tags */}
          {newResult.matchedTags.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Matched canonical tags</p>
              <div className="flex flex-wrap gap-1">
                {newResult.matchedTags.slice(0, 10).map((t, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">
                    {t.tagName} [{t.matchedAliases.map((a) => a.alias).join(', ')}] +{t.tagScore}
                  </span>
                ))}
                {newResult.matchedTags.length > 10 && (
                  <span className="text-[11px] text-slate-400">+{newResult.matchedTags.length - 10}</span>
                )}
              </div>
            </div>
          )}

          {/* Article tag suggestions */}
          {newResult.articleTagSuggestions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Article tag suggestions</p>
              <div className="flex flex-wrap gap-1">
                {newResult.articleTagSuggestions.map((t, i) => (
                  <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    t.tagId
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>{t.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Category breakdown details */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              Category breakdown ({newResult.categoryScores.length})
            </summary>
            <div className="mt-2">
              <NewBreakdown scores={newResult.categoryScores} />
            </div>
          </details>

          {/* Debug trace */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              Debug trace ({newResult.debugTrace.length} entries)
            </summary>
            <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
              {newResult.debugTrace.map((line, i) => (
                <p key={i} className="font-mono text-[10px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{line}</p>
              ))}
            </div>
          </details>
        </div>
      </div>

      {/* ── Comparison footer ── */}
      <div className={`px-5 py-2 border-t text-xs flex flex-wrap items-center gap-4 ${
        sameCategory
          ? 'border-slate-100 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-900/10'
          : 'border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/10'
      }`}>
        <div>
          <span className="font-medium text-slate-600 dark:text-slate-400">Category: </span>
          <AgreementBadge same={sameCategory} />
        </div>
        <div>
          <span className="font-medium text-slate-600 dark:text-slate-400">Verdict: </span>
          {samePassed
            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">same</span>
            : <span className="text-amber-600 dark:text-amber-400 font-medium">
                OLD={old.passedSemanticFilter ? 'PASS' : 'FAIL'} NEW={newResult.passedSemanticFilter ? 'PASS' : 'FAIL'}
              </span>
          }
        </div>
        <div>
          <span className="font-medium text-slate-600 dark:text-slate-400">Score: </span>
          <span className="font-mono">old={old.semanticScore} new={newResult.semanticScore} </span>
          <span className={`font-mono font-bold ${scoreDiff > 0 ? 'text-emerald-600' : scoreDiff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
            ({scoreDiff > 0 ? '+' : ''}{scoreDiff})
          </span>
        </div>
        {!sameCategory && (
          <div className="flex-1">
            <span className="font-medium text-amber-700 dark:text-amber-400">Possible reason: </span>
            <span className="text-slate-500 dark:text-slate-400">
              {old.assignedCategory === null && newResult.winningCategory !== null
                ? `NEW found aliases the OLD keyword list missed → classified as "${newResult.winningCategory}"`
                : old.assignedCategory !== null && newResult.winningCategory === null
                ? `OLD matched keywords but NEW found no aliases in DB`
                : old.assignedCategory !== null && newResult.winningCategory !== null
                ? `Score split differently: OLD "${old.assignedCategory}" won with ${old.semanticScore}, NEW "${newResult.winningCategory}" won with ${newResult.semanticScore}`
                : 'Both returned no category'}
            </span>
          </div>
        )}

        {/* Stored vs fresh comparison */}
        {article.storedSemanticCategory && article.storedSemanticCategory !== old.assignedCategory && (
          <div className="w-full text-[10px] text-slate-400">
            Stored category in DB differs from fresh OLD calc: stored=&quot;{article.storedSemanticCategory}&quot; fresh=&quot;{old.assignedCategory}&quot; (config may have changed since pipeline ran)
          </div>
        )}
      </div>
    </div>
  );
}
