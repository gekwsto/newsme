import { prisma } from '@/lib/db';
import { PipelineRunStatus } from '@/generated/prisma/enums';
import { formatRelativeDate } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, SkipForward, AlertTriangle } from 'lucide-react';

const STATUS_STYLE: Record<PipelineRunStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  COMPLETED: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 size={15} className="text-emerald-500" />,
  },
  RUNNING: {
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
    icon: <Clock size={15} className="text-blue-500 animate-pulse" />,
  },
  FAILED: {
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    icon: <XCircle size={15} className="text-red-500" />,
  },
  SKIPPED: {
    bg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    text: 'text-slate-500 dark:text-slate-400',
    icon: <SkipForward size={15} className="text-slate-400" />,
  },
};

export default async function PipelineLastRun() {
  const [lastRun, cronSecretSet] = await Promise.all([
    prisma.pipelineRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    Promise.resolve(Boolean(process.env.CRON_SECRET)),
  ]);

  const style = lastRun ? STATUS_STYLE[lastRun.status] : null;

  return (
    <div className="space-y-3">
      {/* CRON_SECRET warning */}
      {!cronSecretSet && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>CRON_SECRET δεν έχει οριστεί.</strong> Οι εξωτερικές κλήσεις cron θα απαντούν 401.
            Πρόσθεσε <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">CRON_SECRET=...</code> στο <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env</code> του server.
          </span>
        </div>
      )}

      {/* Last run card */}
      {!lastRun ? (
        <div className="text-xs text-slate-400 px-1">
          Δεν έχει τρέξει ακόμα κανένα pipeline run. Πάτα «Εκτέλεση Pipeline Τώρα» για να δοκιμάσεις.
        </div>
      ) : (
        <div className={`rounded-lg border px-4 py-3 text-xs space-y-2 ${style!.bg}`}>
          <div className={`flex items-center gap-2 font-semibold ${style!.text}`}>
            {style!.icon}
            <span>{lastRun.status}</span>
            <span className="font-normal text-slate-400 dark:text-slate-500 ml-auto">
              {formatRelativeDate(lastRun.startedAt.toISOString())}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            {[
              { label: 'RSS items', v: lastRun.fetchedItems },
              { label: 'Επιλέχθηκαν', v: lastRun.selectedForGeneration },
              { label: 'Δημιουργήθηκαν', v: lastRun.generatedArticles },
              { label: 'Feeds', v: lastRun.totalFeeds },
            ].map(({ label, v }) => (
              <div key={label} className="bg-white/60 dark:bg-slate-800/60 rounded-lg py-1.5">
                <div className="font-black text-sm text-slate-900 dark:text-slate-100">{v ?? '—'}</div>
                <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
              </div>
            ))}
          </div>

          {lastRun.reason && (
            <div className="text-slate-500 dark:text-slate-400">
              Λόγος παράλειψης: <span className="font-mono">{lastRun.reason}</span>
            </div>
          )}
          {lastRun.errorMessage && (
            <div className="font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded px-2 py-1">
              {lastRun.errorMessage}
            </div>
          )}

          <div className="text-slate-400 pt-0.5">
            <a href="/admin/pipeline-runs" className="hover:underline">
              Δες όλα τα runs →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
