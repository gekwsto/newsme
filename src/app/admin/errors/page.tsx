import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SystemEventStatus } from '@/generated/prisma/enums';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SERVICES = ['rss', 'scoring', 'clustering', 'article', 'facebook', 'scheduler', 'analytics', 'openai'];

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/admin/login');
  const user = { name: session.user.name!, email: session.user.email!, role: session.user.role };

  const params = await searchParams;
  const serviceFilter = params.service ?? 'all';
  const statusFilter = params.status ?? 'errors';

  const since = new Date(Date.now() - 7 * 24 * 3600000);

  const serviceWhere = serviceFilter !== 'all' ? { service: serviceFilter } : {};
  const statusIn: SystemEventStatus[] = statusFilter === 'all'
    ? [SystemEventStatus.OK, SystemEventStatus.WARNING, SystemEventStatus.ERROR]
    : [SystemEventStatus.WARNING, SystemEventStatus.ERROR];
  const where = {
    createdAt: { gte: since },
    status: { in: statusIn },
    ...serviceWhere,
  };

  const [events, counts] = await Promise.all([
    prisma.systemEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.systemEvent.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <AdminShell user={user}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Error Center</h1>
          <p className="text-sm text-muted-foreground">System events — τελευταίες 7 ημέρες</p>
        </div>

        {/* Summary counts */}
        <div className="flex gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/20">
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              {countByStatus['ERROR'] ?? 0} Errors
            </span>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 dark:border-yellow-900 dark:bg-yellow-950/20">
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              {countByStatus['WARNING'] ?? 0} Warnings
            </span>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 dark:border-green-900 dark:bg-green-950/20">
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {countByStatus['OK'] ?? 0} OK
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {[
              { value: 'errors', label: 'Errors + Warnings' },
              { value: 'all', label: 'Όλα' },
            ].map((opt) => (
              <a
                key={opt.value}
                href={`/admin/errors?status=${opt.value}&service=${serviceFilter}`}
                className={`rounded px-3 py-1 text-sm ${
                  statusFilter === opt.value
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted'
                }`}
              >
                {opt.label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {['all', ...SERVICES].map((svc) => (
              <a
                key={svc}
                href={`/admin/errors?status=${statusFilter}&service=${svc}`}
                className={`rounded px-3 py-1 text-sm capitalize ${
                  serviceFilter === svc
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted'
                }`}
              >
                {svc}
              </a>
            ))}
          </div>
        </div>

        {/* Events table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Service</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Message</th>
                <th className="px-4 py-2 text-right font-medium">Χρόνος</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const statusCls =
                  ev.status === 'ERROR'
                    ? 'text-red-600 dark:text-red-400'
                    : ev.status === 'WARNING'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-green-600 dark:text-green-400';
                return (
                  <tr key={ev.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className={`px-4 py-2 font-medium ${statusCls}`}>{ev.status}</td>
                    <td className="px-4 py-2 font-mono text-xs uppercase">{ev.service}</td>
                    <td className="px-4 py-2 text-muted-foreground">{ev.type}</td>
                    <td className="px-4 py-2 max-w-md truncate">{ev.message}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground/70 whitespace-nowrap">
                      {formatRelativeDate(ev.createdAt.toISOString())}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Δεν βρέθηκαν events για τα επιλεγμένα φίλτρα
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
