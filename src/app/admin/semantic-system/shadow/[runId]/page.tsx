import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';

export const dynamic = 'force-dynamic';

type MatchedTagSummary = {
  tag: string;
  category: string;
  score: number;
  location: string;
  aliases: string[];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  return { title: `Shadow Run ${runId.slice(-6)} | Admin ${BRAND.name}` };
}

export default async function ShadowRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { runId } = await params;
  const { filter } = await searchParams;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, startedAt: true, status: true, generatedArticles: true },
  });
  if (!run) notFound();

  const filterWhere = {
    disagree: { disagreement: true },
    zero: { zeroMatch: true },
    'old-pass-new-fail': { oldPassed: true, newPassed: false },
    'old-fail-new-pass': { oldPassed: false, newPassed: true },
  }[filter ?? ''] ?? {};

  const [results, total, zero, disagree, catAgree, passAgree, oldPassedCount, newPassedCount] =
    await Promise.all([
      prisma.shadowSemanticResult.findMany({
        where: { pipelineRunId: runId, ...filterWhere },
        orderBy: [{ disagreement: 'desc' }, { createdAt: 'asc' }],
        take: 200,
      }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, zeroMatch: true } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, disagreement: true } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, categoryAgree: true } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, passAgree: true } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, oldPassed: true } }),
      prisma.shadowSemanticResult.count({ where: { pipelineRunId: runId, newPassed: true } }),
    ]);

  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—');

  const tabs = [
    { key: undefined, label: `All (${total})` },
    { key: 'disagree', label: `Disagree (${disagree})` },
    { key: 'zero', label: `Zero-match (${zero})` },
    { key: 'old-pass-new-fail', label: 'OLD✓ NEW✗' },
    { key: 'old-fail-new-pass', label: 'OLD✗ NEW✓' },
  ];

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Shadow Run —{' '}
              {new Date(run.startedAt).toLocaleString('el-GR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Run ID: {run.id} · {total} items analyzed · {run.generatedArticles} articles generated
            </p>
          </div>
          <Link
            href="/admin/semantic-system/shadow"
            className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          >
            ← All runs
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Cat agree', value: pct(catAgree), color: 'emerald' },
            { label: 'Pass agree', value: pct(passAgree), color: 'blue' },
            { label: 'Disagree', value: pct(disagree), color: 'amber' },
            { label: 'Zero-match', value: pct(zero), color: 'red' },
            { label: 'OLD pass', value: pct(oldPassedCount), color: 'violet' },
            { label: 'NEW pass', value: pct(newPassedCount), color: 'indigo' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
            >
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
              <p className={`mt-0.5 text-xl font-bold text-${color}-600 dark:text-${color}-400`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(({ key, label }) => (
            <Link
              key={label}
              href={key ? `?filter=${key}` : '?'}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key || (!filter && !key)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No results for this filter.</p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => {
              const tags = r.newMatchedTags as MatchedTagSummary[];
              const borderColor = r.disagreement
                ? r.oldPassed && !r.newPassed
                  ? 'border-red-300 dark:border-red-800'
                  : !r.oldPassed && r.newPassed
                  ? 'border-emerald-300 dark:border-emerald-800'
                  : 'border-amber-300 dark:border-amber-800'
                : 'border-slate-200 dark:border-slate-700';

              return (
                <div
                  key={r.id}
                  className={`rounded-xl border ${borderColor} bg-white dark:bg-slate-900 p-4`}
                >
                  <div className="flex items-start gap-3">
                    {r.disagreement && (
                      <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        DIFF
                      </span>
                    )}
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 line-clamp-2">
                      {r.rssTitle}
                    </p>
                    {r.zeroMatch && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                        ZERO
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400">OLD</span>
                      <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
                        r.oldPassed
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {r.oldPassed ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="text-slate-500 text-xs">score={r.oldScore}</span>
                      {r.oldCategory && (
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                          {r.oldCategory}
                        </span>
                      )}
                    </div>

                    <span className="text-slate-300 dark:text-slate-600">vs</span>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400">NEW</span>
                      <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
                        r.newPassed
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {r.newPassed ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="text-slate-500 text-xs">score={r.newScore}</span>
                      {r.newCategory && (
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {r.newCategory}
                        </span>
                      )}
                    </div>
                  </div>

                  {r.disagreementReason && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-mono">
                      {r.disagreementReason}
                    </p>
                  )}

                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800"
                        >
                          <span className="font-medium">{t.tag}</span>
                          <span className="text-indigo-400 dark:text-indigo-600">{t.score}</span>
                          {t.aliases[0] && (
                            <span className="text-indigo-300 dark:text-indigo-700">
                              via &quot;{t.aliases[0]}&quot;
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
