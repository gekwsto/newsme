import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatRelativeDate } from '@/lib/utils';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Pipeline Logs | Admin ${BRAND.name}`,
};

const PIPELINE_SERVICES = ['scheduler', 'rss', 'scoring', 'article', 'facebook'];

const statusIcon = {
  OK: <CheckCircle size={12} className="text-emerald-500" />,
  WARNING: <AlertTriangle size={12} className="text-amber-500" />,
  ERROR: <XCircle size={12} className="text-red-500" />,
};

const statusClass = {
  OK: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  WARNING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  ERROR: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

export default async function PipelineLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { service, status } = await searchParams;

  const logs = await prisma.systemEvent.findMany({
    where: {
      service: service ? service : { in: PIPELINE_SERVICES },
      ...(status ? { status: status as 'OK' | 'WARNING' | 'ERROR' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const errorCount = logs.filter((l) => l.status === 'ERROR').length;
  const warnCount = logs.filter((l) => l.status === 'WARNING').length;
  const okCount = logs.filter((l) => l.status === 'OK').length;

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity size={22} className="text-slate-400" />
              Pipeline Logs
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Τελευταία {logs.length} events · {errorCount} σφάλματα · {warnCount} warnings · {okCount} OK
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/admin/pipeline-logs" className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              !service && !status ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}>Όλα</a>

            {PIPELINE_SERVICES.map((s) => (
              <a key={s} href={`/admin/pipeline-logs?service=${s}`} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                service === s ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}>{s}</a>
            ))}

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 self-center" />

            {(['ERROR', 'WARNING', 'OK'] as const).map((st) => (
              <a key={st} href={`/admin/pipeline-logs?status=${st}`} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                status === st
                  ? st === 'ERROR' ? 'bg-red-600 text-white' : st === 'WARNING' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}>{st}</a>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">Δεν βρέθηκαν events</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Message</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Πότε</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${statusClass[log.status]}`}>
                          {statusIcon[log.status]}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">{log.service}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">{log.type}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-sm truncate">{log.message}</td>
                      <td className="px-4 py-2.5 text-slate-400 hidden lg:table-cell whitespace-nowrap">
                        {formatRelativeDate(log.createdAt.toISOString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
