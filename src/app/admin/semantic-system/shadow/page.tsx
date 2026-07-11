import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Shadow Mode Results | Admin ${BRAND.name}`,
};

async function fetchRunSummaries() {
  const runs = await prisma.pipelineRun.findMany({
    where: { shadowResults: { some: {} } },
    orderBy: { startedAt: 'desc' },
    take: 30,
    select: {
      id: true,
      startedAt: true,
      status: true,
      generatedArticles: true,
    },
  });

  return Promise.all(
    runs.map(async (run) => {
      const [total, zeroMatch, disagreements, catAgree, passAgree] = await Promise.all([
        prisma.shadowSemanticResult.count({ where: { pipelineRunId: run.id } }),
        prisma.shadowSemanticResult.count({ where: { pipelineRunId: run.id, zeroMatch: true } }),
        prisma.shadowSemanticResult.count({ where: { pipelineRunId: run.id, disagreement: true } }),
        prisma.shadowSemanticResult.count({ where: { pipelineRunId: run.id, categoryAgree: true } }),
        prisma.shadowSemanticResult.count({ where: { pipelineRunId: run.id, passAgree: true } }),
      ]);
      return { ...run, total, zeroMatch, disagreements, catAgree, passAgree };
    })
  );
}

function pct(n: number, d: number) {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
}

export default async function ShadowResultsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const runs = await fetchRunSummaries();

  const [gTotal, gZero, gDisagree, gCatAgree, gPassAgree] = await Promise.all([
    prisma.shadowSemanticResult.count(),
    prisma.shadowSemanticResult.count({ where: { zeroMatch: true } }),
    prisma.shadowSemanticResult.count({ where: { disagreement: true } }),
    prisma.shadowSemanticResult.count({ where: { categoryAgree: true } }),
    prisma.shadowSemanticResult.count({ where: { passAgree: true } }),
  ]);

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Shadow Mode Results</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              NEW DB semantic system runs in parallel with OLD (production). No output is affected.
            </p>
          </div>
          <Link href="/admin/semantic-system" className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Semantic System
          </Link>
        </div>

        {/* Global stats */}
        {gTotal > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total analyzed', value: String(gTotal), color: 'slate' },
              { label: 'Category agree', value: pct(gCatAgree, gTotal), color: 'emerald' },
              { label: 'Pass agree', value: pct(gPassAgree, gTotal), color: 'blue' },
              { label: 'Disagreements', value: pct(gDisagree, gTotal), color: 'amber' },
              { label: 'Zero-match (NEW)', value: pct(gZero, gTotal), color: 'red' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold text-${color}-600 dark:text-${color}-400`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {runs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-10 text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No shadow results yet. Shadow analysis runs automatically with each pipeline execution.
            </p>
          </div>
        )}

        {runs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Recent Pipeline Runs with Shadow Data
            </h2>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {runs.map((run) => (
                <Link
                  key={run.id}
                  href={`/admin/semantic-system/shadow/${run.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-36 shrink-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {new Date(run.startedAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(run.startedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="w-20 shrink-0">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{run.total}</span>
                    <span className="text-xs text-slate-400 ml-1">items</span>
                  </div>

                  <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                    <StatPill label="cat" value={pct(run.catAgree, run.total)} color="emerald" />
                    <StatPill label="pass" value={pct(run.passAgree, run.total)} color="blue" />
                    <StatPill label="diff" value={pct(run.disagreements, run.total)} color="amber" />
                    <StatPill label="zero" value={pct(run.zeroMatch, run.total)} color="red" />
                  </div>

                  <div className="w-16 shrink-0 text-right">
                    <p className="text-xs text-slate-400">generated</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{run.generatedArticles}</p>
                  </div>

                  <span className="text-slate-300 dark:text-slate-600 shrink-0">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">What do these metrics mean?</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              ['Cat agree', 'OLD and NEW assigned the same category'],
              ['Pass agree', 'OLD and NEW agree on PASS/FAIL for semantic filter'],
              ['Diff', 'Any mismatch between OLD and NEW (category OR pass/fail)'],
              ['Zero', 'NEW system matched 0 canonical tags — would score 0 if primary'],
            ].map(([term, def]) => (
              <div key={term as string} className="flex gap-2">
                <dt className="font-medium text-slate-700 dark:text-slate-300 shrink-0 w-20">{term}</dt>
                <dd className="text-slate-500 dark:text-slate-400">{def}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </AdminShell>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-400`}>
      <span className="text-slate-500 dark:text-slate-500">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
