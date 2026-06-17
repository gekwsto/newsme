import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { getSemanticMatrixConfig } from '@/lib/semantic-filter';
import { COST_PER_TOKEN_GPT4O, TOKENS_PER_ARTICLE_ESTIMATE } from '@/lib/content-filter';
import { SEMANTIC_TOKENS_SAVED } from '@/lib/semantic-filter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Semantic Matrix | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

async function fetchStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    semanticPassedToday,
    semanticIgnoredToday,
    semanticPassedTotal,
    semanticIgnoredTotal,
    topCategories,
  ] = await Promise.all([
    // Passed semantic filter today
    prisma.discoveredArticle.count({
      where: {
        semanticScore: { not: null },
        passedSemanticFilter: true,
        createdAt: { gte: todayStart },
      },
    }),
    // Ignored by semantic filter today (passed local but failed semantic)
    prisma.discoveredArticle.count({
      where: {
        semanticScore: { not: null },
        passedSemanticFilter: false,
        createdAt: { gte: todayStart },
      },
    }),
    // All-time passed
    prisma.discoveredArticle.count({
      where: { semanticScore: { not: null }, passedSemanticFilter: true },
    }),
    // All-time ignored by semantic
    prisma.discoveredArticle.count({
      where: { semanticScore: { not: null }, passedSemanticFilter: false },
    }),
    // Top categories assigned by semantic filter (last 7 days)
    prisma.discoveredArticle.groupBy({
      by: ['semanticCategory'],
      where: {
        semanticCategory: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600000) },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ]);

  const costSavedToday = semanticIgnoredToday * SEMANTIC_TOKENS_SAVED * COST_PER_TOKEN_GPT4O;
  const costSavedTotal = semanticIgnoredTotal * SEMANTIC_TOKENS_SAVED * COST_PER_TOKEN_GPT4O;

  return {
    semanticPassedToday,
    semanticIgnoredToday,
    semanticPassedTotal,
    semanticIgnoredTotal,
    costSavedToday,
    costSavedTotal,
    topCategories: topCategories.map((c) => ({
      category: c.semanticCategory!,
      count: c._count.id,
    })),
  };
}

function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function SemanticMatrixPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const config = getSemanticMatrixConfig();
  const stats = await fetchStats();

  const categories = Object.entries(config.categories);
  const totalKeywords = categories.reduce((sum, [, cat]) => sum + cat.keywords.length, 0);

  const passRate =
    stats.semanticPassedTotal + stats.semanticIgnoredTotal > 0
      ? Math.round((stats.semanticPassedTotal / (stats.semanticPassedTotal + stats.semanticIgnoredTotal)) * 100)
      : null;

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              🧠 Semantic Matrix
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Pre-filter RSS άρθρων με hot keywords πριν από το OpenAI scoring.
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Config: <code className="font-mono text-violet-600 dark:text-violet-400">config/semantic-matrix.json</code>
            </p>
          </div>
          <Link
            href="/admin/news-discovery"
            className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            ← News Discovery
          </Link>
        </div>

        {/* Thresholds */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Ρυθμίσεις / Thresholds
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Min Semantic Score</p>
              <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">
                {config.thresholds.minSemanticScore}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">κατώφλι για πέρασμα</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Always Keep (Reliability ≥)</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {config.thresholds.alwaysKeepIfSourceReliabilityAbove}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">πολύ αξιόπιστες πηγές</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Max Articles to Score</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                {config.thresholds.maxArticlesToScorePerRefresh}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">ανά refresh</p>
            </div>
          </div>
        </section>

        {/* Today Stats */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Σήμερα
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label="Πέρασαν Semantic"
              value={stats.semanticPassedToday}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatBox
              label="Φιλτραρίστηκαν"
              value={stats.semanticIgnoredToday}
              color="text-red-500 dark:text-red-400"
              sub="αποφύγαμε OpenAI"
            />
            <StatBox
              label="Cost Saved (est.)"
              value={`$${stats.costSavedToday.toFixed(4)}`}
              color="text-green-600 dark:text-green-400"
            />
            <StatBox
              label="Tokens Saved (est.)"
              value={(stats.semanticIgnoredToday * SEMANTIC_TOKENS_SAVED).toLocaleString('el-GR')}
            />
          </div>
        </section>

        {/* All-time Stats */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Συνολικά
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Πέρασαν (σύνολο)" value={stats.semanticPassedTotal} />
            <StatBox label="Φιλτραρίστηκαν (σύνολο)" value={stats.semanticIgnoredTotal} />
            <StatBox
              label="Pass Rate"
              value={passRate !== null ? `${passRate}%` : '—'}
              color={passRate !== null && passRate < 40 ? 'text-emerald-600 dark:text-emerald-400' : undefined}
              sub="στόχος < 50% (αποταμιεύουμε)"
            />
            <StatBox
              label="Total Cost Saved"
              value={`$${stats.costSavedTotal.toFixed(3)}`}
              color="text-green-600 dark:text-green-400"
            />
          </div>
        </section>

        {/* Top Assigned Categories (last 7 days) */}
        {stats.topCategories.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Top Κατηγορίες (7 ημέρες)
            </h2>
            <div className="flex flex-wrap gap-2">
              {stats.topCategories.map(({ category, count }) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300"
                >
                  {category}
                  <span className="font-bold">{count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Category Matrix */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Κατηγορίες & Keywords ({categories.length} κατηγορίες · {totalKeywords} keywords)
          </h2>
          <div className="space-y-4">
            {categories.map(([catName, catConfig]) => (
              <div
                key={catName}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">{catName}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-mono">
                    weight × {catConfig.weight}
                  </span>
                  <span className="text-xs text-slate-400">
                    {catConfig.keywords.length} keywords
                    {catConfig.priorityEntities && ` · ${catConfig.priorityEntities.length} priority entities`}
                  </span>
                </div>

                {/* Priority entities */}
                {catConfig.priorityEntities && catConfig.priorityEntities.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                      ⚡ Priority Entities (+25 bonus)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {catConfig.priorityEntities.map((entity) => (
                        <span
                          key={entity}
                          className="text-[11px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-medium"
                        >
                          {entity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* All keywords */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {catConfig.keywords.map((kw) => {
                      const isPriority = catConfig.priorityEntities?.includes(kw);
                      return (
                        <span
                          key={kw}
                          className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                            isPriority
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {kw}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Πώς λειτουργεί
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-2">
              <span className="font-bold text-violet-600 dark:text-violet-400 mt-0.5">1.</span>
              <span>RSS fetch → ~100-300 νέα άρθρα</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-violet-600 dark:text-violet-400 mt-0.5">2.</span>
              <span>Local filter (blacklists, quality) → απορρίπτει spam/low-quality</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-violet-600 dark:text-violet-400 mt-0.5">3.</span>
              <span>
                <strong className="text-violet-700 dark:text-violet-300">Semantic Matrix</strong> → κρατάμε μόνο άρθρα με hot keywords
                <span className="text-slate-400 ml-1">(title match +30, excerpt +15, priority entity +25, multi-keyword bonus +10)</span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-violet-600 dark:text-violet-400 mt-0.5">4.</span>
              <span>OpenAI scoring → μόνο τα {config.thresholds.maxArticlesToScorePerRefresh} καλύτερα άρθρα</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-violet-600 dark:text-violet-400 mt-0.5">5.</span>
              <span>Article generation → τα άρθρα που περνούν το AI threshold</span>
            </div>
            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
              Για να αλλάξεις keywords/weights, επεξεργάσου το αρχείο{' '}
              <code className="font-mono text-violet-500">config/semantic-matrix.json</code>.
              Οι αλλαγές εφαρμόζονται αμέσως στο επόμενο fetch.
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
