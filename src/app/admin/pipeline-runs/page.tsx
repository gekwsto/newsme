import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatRelativeDate } from '@/lib/utils';
import AdminShell from '@/components/admin/AdminShell';
import { PipelineRunStatus } from '@/generated/prisma/enums';
import type { CategoryBreakdown } from '@/lib/semantic-filter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Pipeline Runs | Admin ${BRAND.name}`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RUN_STATUS_STYLE: Record<PipelineRunStatus, string> = {
  RUNNING:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  COMPLETED: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  FAILED:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  SKIPPED:   'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
};

function scoreStyle(v: number | null | undefined): string {
  if (v == null) return 'bg-slate-100 dark:bg-slate-700 text-slate-400';
  if (v < 35)   return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
  if (v < 61)   return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
  if (v < 91)   return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
  return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
}

function scoreText(v: number | null | undefined): string {
  if (v == null) return 'text-slate-400';
  if (v < 35)   return 'text-red-600 dark:text-red-400';
  if (v < 61)   return 'text-orange-600 dark:text-orange-400';
  if (v < 91)   return 'text-yellow-700 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

function genStyle(status: string | null): string {
  if (status === 'success')           return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
  if (status === 'failed')            return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
  if (status === 'rejected_compound') return 'bg-slate-100 dark:bg-slate-700 text-slate-500';
  return 'bg-slate-100 dark:bg-slate-700 text-slate-400';
}

function genLabel(status: string | null): string {
  if (status === 'success')           return '✓ Generated';
  if (status === 'failed')            return '✗ Failed';
  if (status === 'rejected_compound') return '— Rejected';
  if (status === 'pending')           return '⋯ Pending';
  return status ?? '—';
}

function articleStatusStyle(status: string): string {
  if (status === 'PUBLISHED')       return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
  if (status === 'APPROVED')        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
  if (status === 'PENDING_APPROVAL') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  if (status === 'REJECTED')        return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
  return 'bg-slate-100 dark:bg-slate-700 text-slate-500';
}

function wc(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PipelineRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { runId } = await searchParams;

  const runs = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 30,
    include: { _count: { select: { items: true } } },
  });

  const targetId = runId ?? runs[0]?.id;

  const selectedRun = targetId
    ? await prisma.pipelineRun.findUnique({
        where: { id: targetId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      })
    : null;

  // ── Supplementary data ─────────────────────────────────────────────────────
  const urls    = selectedRun?.items.map(i => i.rssUrl) ?? [];
  const genIds  = selectedRun?.items.flatMap(i => i.generatedArticleId ? [i.generatedArticleId] : []) ?? [];

  const [discoveredList, articleList] = await Promise.all([
    urls.length > 0
      ? prisma.discoveredArticle.findMany({
          where: { url: { in: urls } },
          select: { url: true, excerpt: true, imageUrl: true, sourceArticleBody: true, extractionSuccess: true, extractionWordCount: true },
        })
      : Promise.resolve([] as { url: string; excerpt: string | null; imageUrl: string | null; sourceArticleBody: string | null; extractionSuccess: boolean | null; extractionWordCount: number | null }[]),

    genIds.length > 0
      ? prisma.article.findMany({
          where: { id: { in: genIds } },
          select: {
            id: true, title: true, slug: true, content: true,
            seoTitle: true, seoDescription: true, aiCommentary: true,
            status: true, readTime: true,
            aiDraft: { select: { model: true, promptVersion: true, generatorVersion: true } },
            trainingExample: { select: { id: true, systemPrompt: true, userPrompt: true, aiCompletion: true } },
            tags: { select: { tag: { select: { name: true } } } },
            socialPosts: { where: { platform: 'FACEBOOK' }, take: 1, select: { content: true, status: true } },
          },
        })
      : Promise.resolve([] as {
          id: string; title: string; slug: string; content: string;
          seoTitle: string | null; seoDescription: string | null; aiCommentary: string | null;
          status: string; readTime: number;
          aiDraft: { model: string; promptVersion: string | null; generatorVersion: string | null } | null;
          trainingExample: { id: string; systemPrompt: string; userPrompt: string; aiCompletion: string } | null;
          tags: { tag: { name: string } }[];
          socialPosts: { content: string; status: string }[];
        }[]),
  ]);

  const discoveredMap = new Map(discoveredList.map(d => [d.url, d]));
  const articleMap    = new Map(articleList.map(a => [a.id, a]));

  // ── Summary stats ──────────────────────────────────────────────────────────
  const items = selectedRun?.items ?? [];
  const semScores  = items.flatMap(i => i.semanticScore  != null ? [i.semanticScore]  : []);
  const compScores = items.flatMap(i => i.compoundScore  != null ? [i.compoundScore]  : []);
  const avgSemantic = semScores.length  > 0 ? Math.round(semScores.reduce((a,b)  => a+b, 0) / semScores.length)  : null;
  const avgCompound = compScores.length > 0 ? Math.round(compScores.reduce((a,b) => a+b, 0) / compScores.length * 10) / 10 : null;
  const durationSec = selectedRun?.finishedAt
    ? Math.round((selectedRun.finishedAt.getTime() - selectedRun.startedAt.getTime()) / 1000)
    : null;

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Pipeline Runs</h1>
          <p className="text-slate-400 text-sm mt-1">Full trace κάθε pipeline execution — editorial review dashboard</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── Left: run list ── */}
          <div className="lg:col-span-1 space-y-2">
            {runs.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 text-sm">
                Δεν υπάρχουν runs ακόμα
              </div>
            ) : runs.map((run) => (
              <a
                key={run.id}
                href={`/admin/pipeline-runs?runId=${run.id}`}
                className={`block bg-white dark:bg-slate-800 rounded-xl border transition-colors p-3 ${
                  selectedRun?.id === run.id
                    ? 'border-red-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${RUN_STATUS_STYLE[run.status]}`}>
                    {run.status}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatRelativeDate(run.startedAt.toISOString())}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'RSS', v: run.fetchedItems, c: 'text-slate-700 dark:text-slate-200' },
                    { label: 'Επιλ.', v: run.selectedForGeneration, c: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Άρθρα', v: run.generatedArticles, c: run.generatedArticles > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400' },
                  ].map(({ label, v, c }) => (
                    <div key={label}>
                      <div className={`text-xs font-bold ${c}`}>{v}</div>
                      <div className="text-[10px] text-slate-400">{label}</div>
                    </div>
                  ))}
                </div>
                {run.reason && (
                  <div className="mt-1.5 text-[10px] text-slate-400 truncate">{run.reason}</div>
                )}
              </a>
            ))}
          </div>

          {/* ── Right: run detail ── */}
          <div className="lg:col-span-3 space-y-4">
            {!selectedRun ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 text-sm">
                Επίλεξε ένα run
              </div>
            ) : (
              <>
                {/* ── Run summary card ── */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded ${RUN_STATUS_STYLE[selectedRun.status]}`}>
                        {selectedRun.status}
                      </span>
                      {selectedRun.forceRun && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">FORCE</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {selectedRun.startedAt.toLocaleString('el-GR', { timeZone: 'Europe/Athens' })}
                      {durationSec != null && (
                        <> · <span className="font-semibold text-slate-600 dark:text-slate-300">{durationSec}s</span></>
                      )}
                    </div>
                  </div>

                  {/* Funnel grid */}
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
                    {[
                      { label: 'RSS',       v: selectedRun.fetchedItems,        c: 'text-slate-700 dark:text-slate-200' },
                      { label: 'Loc.rej.',  v: selectedRun.localRejected,       c: 'text-orange-500' },
                      { label: 'Sem.rej.',  v: selectedRun.semanticRejected,    c: 'text-orange-500' },
                      { label: 'Comp.rej.', v: selectedRun.compoundRejected,    c: 'text-orange-500' },
                      { label: 'Επιλέχθηκαν', v: selectedRun.selectedForGeneration, c: 'text-blue-600 dark:text-blue-400' },
                      { label: 'Generated', v: selectedRun.generatedArticles,   c: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Failed',    v: selectedRun.failedGenerations,   c: selectedRun.failedGenerations > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400' },
                      { label: 'Feeds',     v: selectedRun.totalFeeds,          c: 'text-slate-500' },
                    ].map(({ label, v, c }) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                        <div className={`text-lg font-black ${c}`}>{v}</div>
                        <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Context + averages */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { label: 'Model',        v: selectedRun.modelUsed,           mono: true, color: '' },
                      { label: 'Threshold',    v: String(selectedRun.compoundThreshold ?? '—'), mono: true, color: '' },
                      { label: 'Avg Semantic', v: avgSemantic != null ? String(avgSemantic) : '—', mono: true, color: scoreText(avgSemantic) },
                      { label: 'Avg Compound', v: avgCompound != null ? String(avgCompound) : '—', mono: true, color: scoreText(avgCompound) },
                      { label: 'Prompt Ver.',     v: selectedRun.promptVersion,    mono: false, color: '' },
                      { label: 'Generator Ver.',  v: selectedRun.generatorVersion, mono: false, color: '' },
                    ].map(({ label, v, mono, color }) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
                        <div className={`${mono ? 'font-mono' : ''} font-semibold truncate ${color || 'text-slate-800 dark:text-slate-200'}`}>
                          {v ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedRun.reason && (
                    <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">{selectedRun.reason}</div>
                  )}
                  {selectedRun.errorMessage && (
                    <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 font-mono">{selectedRun.errorMessage}</div>
                  )}
                </div>

                {/* ── Items ── */}
                {items.length === 0 ? (
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 text-sm">
                    Δεν υπάρχουν scored items σε αυτό το run
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
                      {items.length} compound-scored items · κάνε κλικ για full trace
                    </p>

                    {items.map((item) => {
                      const disc = discoveredMap.get(item.rssUrl);
                      const art  = item.generatedArticleId ? articleMap.get(item.generatedArticleId) : undefined;
                      const bd   = Array.isArray(item.semanticBreakdown)
                        ? (item.semanticBreakdown as unknown as CategoryBreakdown[])
                        : [];
                      const tags   = art?.tags.map(t => t.tag.name) ?? [];
                      const fbPost = art?.socialPosts[0] ?? null;
                      const words  = art ? wc(art.content) : 0;

                      return (
                        <details key={item.id} className="group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

                          {/* ── Collapsed header ── */}
                          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              item.generationStatus === 'success'           ? 'bg-emerald-500' :
                              item.generationStatus === 'failed'            ? 'bg-red-500' :
                              item.generationStatus === 'rejected_compound' ? 'bg-slate-300 dark:bg-slate-600' :
                              'bg-blue-400'
                            }`} />

                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.rssTitle}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{item.sourceName}</div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${scoreStyle(item.localScore)}`}>
                                L:{item.localScore?.toFixed(0) ?? '—'}
                              </span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${scoreStyle(item.semanticScore)}`}>
                                S:{item.semanticScore?.toFixed(0) ?? '—'}
                              </span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${scoreStyle(item.compoundScore)}`}>
                                C:{item.compoundScore?.toFixed(0) ?? '—'}
                              </span>
                            </div>

                            {(item.resolvedCategory || item.semanticCategory) && (
                              <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 flex-shrink-0">
                                {item.resolvedCategory || item.semanticCategory}
                              </span>
                            )}

                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${genStyle(item.generationStatus)}`}>
                              {genLabel(item.generationStatus)}
                            </span>

                            <span className="text-slate-300 dark:text-slate-600 text-xs flex-shrink-0 transition-transform group-open:rotate-90">▶</span>
                          </summary>

                          {/* ── Expanded content ── */}
                          <div className="border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">

                            {/* SECTION 1 — RSS */}
                            <div className="px-5 py-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">§1 — RSS Source</div>
                                {/* Extraction badge */}
                                {item.extractionStatus === 'success' ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                    ✓ Full Article ({item.extractionWordCount ?? 0} words)
                                  </span>
                                ) : item.extractionStatus === 'fallback' ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                    ↩ Fallback to RSS excerpt
                                  </span>
                                ) : disc?.extractionSuccess === true ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                    ✓ Full Article ({disc.extractionWordCount ?? 0} words)
                                  </span>
                                ) : disc?.extractionSuccess === false ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                    ↩ Fallback to RSS excerpt
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex gap-4">
                                {disc?.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={disc.imageUrl} alt="" className="w-28 h-20 object-cover rounded-lg flex-shrink-0 bg-slate-100 dark:bg-slate-700" />
                                )}
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">{item.rssTitle}</div>
                                  {disc?.excerpt && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">{disc.excerpt}</p>
                                  )}
                                  <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{item.sourceName}</span>
                                    <a href={item.rssUrl} target="_blank" rel="noopener noreferrer"
                                       className="hover:text-blue-500 truncate max-w-xs transition-colors">
                                      {item.rssUrl}
                                    </a>
                                  </div>
                                </div>
                              </div>

                              {/* Extracted source article */}
                              {disc?.sourceArticleBody && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer select-none list-none bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-400 font-medium transition-colors">
                                    ▸ Extracted Source Article ({disc.extractionWordCount ?? '?'} words)
                                  </summary>
                                  <pre className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap font-sans leading-relaxed">
                                    {disc.sourceArticleBody}
                                  </pre>
                                </details>
                              )}
                            </div>

                            {/* SECTION 2 — Semantic */}
                            <div className="px-5 py-4 space-y-3">
                              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">§2 — Semantic Scoring</div>

                              {/* Score grid */}
                              <div className="grid grid-cols-3 gap-2 text-center">
                                {[
                                  { label: 'Local Score', v: item.localScore },
                                  { label: 'Semantic Score', v: item.semanticScore },
                                  { label: 'Compound Score', v: item.compoundScore },
                                ].map(({ label, v }) => (
                                  <div key={label} className={`rounded-xl p-3 ${scoreStyle(v)}`}>
                                    <div className="text-2xl font-black">{v?.toFixed(0) ?? '—'}</div>
                                    <div className="text-[10px] opacity-75 mt-0.5">{label}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Category */}
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-400">Assigned Category:</span>
                                {item.resolvedCategory || item.semanticCategory ? (
                                  <span className="font-semibold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                                    {item.resolvedCategory || item.semanticCategory}
                                  </span>
                                ) : <span className="text-slate-400">—</span>}
                              </div>

                              {/* Matched keywords */}
                              {item.matchedKeywords.length > 0 && (
                                <div>
                                  <div className="text-[10px] text-slate-400 mb-1">Matched Keywords</div>
                                  <div className="flex flex-wrap gap-1">
                                    {item.matchedKeywords.map((kw) => (
                                      <span key={kw} className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Breakdown */}
                              {bd.length > 0 && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer select-none list-none text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                    ▸ Category breakdown ({bd.length})
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {bd.map((cat) => (
                                      <div key={cat.category} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">{cat.category}</span>
                                          <span className={`font-mono font-black text-base ${scoreText(cat.finalScore)}`}>{cat.finalScore}</span>
                                        </div>
                                        {cat.contributions.map((c, i) => (
                                          <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500 py-px">
                                            <span className={`w-3 text-center font-bold ${c.location === 'title' ? 'text-blue-500' : c.location === 'excerpt' ? 'text-amber-500' : 'text-slate-400'}`}>
                                              {c.location === 'title' ? 'T' : c.location === 'excerpt' ? 'E' : 'C'}
                                            </span>
                                            <span className="flex-1 truncate">{c.keyword}</span>
                                            {c.isPriority && <span className="text-violet-500">★</span>}
                                            <span className="font-mono ml-auto">+{c.score}</span>
                                          </div>
                                        ))}
                                        <div className="mt-1 text-[10px] text-slate-400 font-mono border-t border-slate-200 dark:border-slate-600 pt-1 flex gap-3">
                                          {cat.multiKeywordBonus > 0 && <span>+{cat.multiKeywordBonus} multi</span>}
                                          <span>×{cat.reliabilityMultiplier} rel</span>
                                          <span>×{cat.weightMultiplier} weight</span>
                                          <span className="ml-auto font-bold">= {cat.finalScore}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>

                            {/* SECTION 3 — AI Generation */}
                            {art ? (
                              <div className="px-5 py-4 space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">§3 — AI Generation</div>

                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  {[
                                    { label: 'Model',     v: art.aiDraft?.model },
                                    { label: 'Prompt V.', v: art.aiDraft?.promptVersion },
                                    { label: 'Gen. V.',   v: art.aiDraft?.generatorVersion },
                                  ].map(({ label, v }) => (
                                    <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                                      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
                                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">{v ?? '—'}</div>
                                    </div>
                                  ))}
                                </div>

                                {art.trainingExample && (
                                  <div className="space-y-1.5">
                                    {[
                                      { label: 'System Prompt', body: art.trainingExample.systemPrompt },
                                      { label: 'User Prompt',   body: art.trainingExample.userPrompt },
                                      { label: 'AI Completion', body: art.trainingExample.aiCompletion },
                                    ].map(({ label, body }) => (
                                      <details key={label} className="text-xs">
                                        <summary className="cursor-pointer select-none list-none bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-400 font-medium transition-colors">
                                          ▸ {label} <span className="font-normal text-slate-400 ml-1">({body.length} chars)</span>
                                        </summary>
                                        <pre className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 overflow-auto max-h-52 whitespace-pre-wrap font-mono leading-relaxed">
                                          {body}
                                        </pre>
                                      </details>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : item.selectedForGeneration && (
                              <div className="px-5 py-4">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">§3 — AI Generation</div>
                                <div className="text-xs text-slate-400">
                                  {item.generationStatus === 'failed'
                                    ? 'Generation failed — see error below'
                                    : 'Generation data not available'}
                                </div>
                              </div>
                            )}

                            {/* SECTION 4 — Result */}
                            {art ? (
                              <div className="px-5 py-4 space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">§4 — Result</div>

                                {/* Title */}
                                <div>
                                  <div className="text-[10px] text-slate-400 mb-0.5">Generated Title</div>
                                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">{art.title}</div>
                                </div>

                                {/* SEO */}
                                {(art.seoTitle || art.seoDescription) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {art.seoTitle && (
                                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5">
                                        <div className="text-[10px] text-slate-400 mb-0.5">SEO Title</div>
                                        <div className="text-slate-700 dark:text-slate-300">{art.seoTitle}</div>
                                      </div>
                                    )}
                                    {art.seoDescription && (
                                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5">
                                        <div className="text-[10px] text-slate-400 mb-0.5">SEO Description</div>
                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">{art.seoDescription}</div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Tags */}
                                {tags.length > 0 && (
                                  <div>
                                    <div className="text-[10px] text-slate-400 mb-1">Tags</div>
                                    <div className="flex flex-wrap gap-1">
                                      {tags.map((t) => (
                                        <span key={t} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">{t}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Stats */}
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="text-slate-500"><span className="font-semibold text-slate-700 dark:text-slate-200">{words}</span> words</span>
                                  <span className="text-slate-500"><span className="font-semibold text-slate-700 dark:text-slate-200">{art.readTime}</span> min</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${articleStatusStyle(art.status)}`}>{art.status}</span>
                                  <span className="text-slate-400 text-[10px]">AI Commentary: <span className={art.aiCommentary ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}>{art.aiCommentary ? 'YES' : 'NO'}</span></span>
                                  <span className="text-slate-400 text-[10px]">FB Post: <span className={fbPost ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'}>{fbPost ? 'YES' : 'NO'}</span></span>
                                </div>

                                {/* AI Commentary */}
                                {art.aiCommentary && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer select-none list-none bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-400 font-medium transition-colors">
                                      ▸ AI Commentary
                                    </summary>
                                    <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 leading-relaxed">
                                      {art.aiCommentary}
                                    </div>
                                  </details>
                                )}

                                {/* Facebook post */}
                                {fbPost && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer select-none list-none bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg px-3 py-2 text-blue-700 dark:text-blue-400 font-medium transition-colors">
                                      ▸ Facebook Post <span className="font-normal text-[10px] ml-1">({fbPost.status})</span>
                                    </summary>
                                    <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                                      {fbPost.content}
                                    </div>
                                  </details>
                                )}

                                {/* Quick links */}
                                <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                                  <a href={`/admin/article-review/${art.id}`}
                                     className="text-xs bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 rounded-lg font-semibold hover:opacity-80 transition-opacity">
                                    Open Article
                                  </a>
                                  <a href={`/article/${art.slug}`} target="_blank" rel="noopener noreferrer"
                                     className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-semibold hover:opacity-80 transition-opacity">
                                    View Live ↗
                                  </a>
                                  {art.trainingExample && (
                                    <a href="/admin/training-data"
                                       className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-3 py-1.5 rounded-lg font-semibold hover:opacity-80 transition-opacity">
                                      Training Data ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {/* Failure reason */}
                            {item.failureReason && (
                              <div className="px-5 py-3">
                                <div className="text-[10px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 font-mono">{item.failureReason}</div>
                              </div>
                            )}

                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
