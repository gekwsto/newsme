import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { fetchAllHealthChecks, type ServiceHealth } from '@/lib/monitoring/health';
import { formatRelativeDate } from '@/lib/utils';
import { RefreshButton } from './RefreshButton';
import { TOKENS_PER_ARTICLE_ESTIMATE, COST_PER_TOKEN_GPT4O } from '@/lib/content-filter';

export const dynamic = 'force-dynamic';

async function fetchData() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    rssToday,
    scoredToday,
    draftsToday,
    approvedToday,
    publishedToday,
    fbPostsToday,
    scheduledPending,
    trendingActive,
    recentEvents,
    rssSources,
    openaiUsage,
    health,
  ] = await Promise.all([
    // RSS Today: discovered articles created today
    prisma.discoveredArticle.count({ where: { createdAt: { gte: todayStart } } }),
    // Scored Today: content scores created today
    prisma.contentScore.count({ where: { scoredAt: { gte: todayStart } } }),
    // Drafts Today: articles created today in PENDING_APPROVAL
    prisma.article.count({ where: { createdAt: { gte: todayStart } } }),
    // Approved Today: articles approved today
    prisma.article.count({ where: { updatedAt: { gte: todayStart }, status: 'PUBLISHED' } }),
    // Published Today: social posts published today
    prisma.socialPost.count({ where: { publishedAt: { gte: todayStart } } }),
    // FB Posts Today: facebook posts created today
    prisma.socialPost.count({ where: { createdAt: { gte: todayStart }, platform: 'FACEBOOK' } }),
    // Scheduled Pending
    prisma.scheduledPost.count({ where: { status: 'PENDING' } }),
    // Trending Active: clusters updated in last 48h
    prisma.trendCluster.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 48 * 3600000) } } }),
    // Activity Feed: last 25 system events
    prisma.systemEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    // RSS Sources with per-source stats
    prisma.rssSource.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        url: true,
        lastFetchedAt: true,
        _count: { select: { articles: true } },
      },
      orderBy: { name: 'asc' },
    }),
    // OpenAI usage last 7 days
    prisma.systemEvent.findMany({
      where: {
        service: 'openai',
        type: 'usage',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    // Health checks
    fetchAllHealthChecks(),
  ]);

  // Pre-filter stats today
  const preFilteredToday = await prisma.discoveredArticle.count({
    where: { filteredReason: { not: null }, createdAt: { gte: todayStart } },
  });
  const aiScoringCallsToday = await prisma.systemEvent.count({
    where: { service: 'openai', type: 'usage', createdAt: { gte: todayStart },
      message: { contains: 'Scoring' } },
  });
  const aiGenerationCallsToday = await prisma.systemEvent.count({
    where: { service: 'openai', type: 'usage', createdAt: { gte: todayStart },
      message: { contains: 'Generation' } },
  });

  // Viral Active: discovered articles with discussion/viral/controversy >= 88
  const viralActive = await prisma.contentScore.count({
    where: {
      OR: [
        { facebookDiscussionScore: { gte: 88 } },
        { discussionScore: { gte: 88 } },
        { controversyScore: { gte: 88 } },
      ],
      discoveredArticle: { status: 'NEW' },
    },
  });

  // Top topic today
  const topCluster = await prisma.trendCluster.findFirst({
    orderBy: { trendScore: 'desc' },
    where: { lastSeenAt: { gte: new Date(Date.now() - 24 * 3600000) } },
  });

  // Top article today (highest overall score, discovered today)
  const topArticle = await prisma.discoveredArticle.findFirst({
    where: { createdAt: { gte: todayStart }, score: { isNot: null } },
    orderBy: { score: { overallScore: 'desc' } },
    select: { title: true, score: { select: { overallScore: true } } },
  });

  // Pending scheduler posts
  const overdueScheduled = await prisma.scheduledPost.count({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });

  // Compute OpenAI cost totals
  type UsageMeta = { estimatedCostUsd?: number; model?: string; inputTokens?: number; outputTokens?: number; originService?: string };
  const openaiStats = openaiUsage.reduce(
    (acc, ev) => {
      const meta = (ev.metadata ?? {}) as UsageMeta;
      acc.totalCost += meta.estimatedCostUsd ?? 0;
      acc.totalTokens += (meta.inputTokens ?? 0) + (meta.outputTokens ?? 0);
      acc.calls++;
      return acc;
    },
    { totalCost: 0, totalTokens: 0, calls: 0 }
  );

  const tokensSavedToday = preFilteredToday * TOKENS_PER_ARTICLE_ESTIMATE;
  const costSavedToday = tokensSavedToday * COST_PER_TOKEN_GPT4O;

  return {
    stats: {
      rssToday,
      scoredToday,
      draftsToday,
      approvedToday,
      publishedToday,
      fbPostsToday,
      scheduledPending,
      trendingActive,
      viralActive,
    },
    costSavings: {
      preFilteredToday,
      tokensSavedToday,
      costSavedToday,
      aiScoringCallsToday,
      aiGenerationCallsToday,
    },
    topCluster,
    topArticle,
    overdueScheduled,
    recentEvents,
    rssSources,
    openaiStats,
    openaiUsage,
    health,
  };
}

function StatusDot({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const color =
    status === 'ok' ? 'bg-green-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function HealthCard({ health }: { health: ServiceHealth }) {
  const border =
    health.status === 'ok'
      ? 'border-green-200 dark:border-green-900'
      : health.status === 'warning'
      ? 'border-yellow-200 dark:border-yellow-900'
      : 'border-red-200 dark:border-red-900';

  return (
    <div className={`rounded-lg border ${border} bg-card p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{health.label}</span>
        <StatusDot status={health.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{health.message}</p>
      {health.lastRun && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          {formatRelativeDate(health.lastRun.toISOString())}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${warn && value > 0 ? 'border-yellow-400' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn && value > 0 ? 'text-yellow-500' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function EventBadge({ status }: { status: string }) {
  const cls =
    status === 'OK'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : status === 'WARNING'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default async function OperationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/admin/login');

  const data = await fetchData();
  const { stats, costSavings, health, recentEvents, rssSources, openaiStats, topCluster, topArticle, overdueScheduled } = data;

  const healthValues = Object.values(health);
  const hasAlert = healthValues.some((h) => h.status === 'error');
  const hasWarning = healthValues.some((h) => h.status === 'warning');

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Operations</h1>
            <p className="text-sm text-muted-foreground">System health &amp; activity monitoring</p>
          </div>
          <RefreshButton />
        </div>

        {/* Alert banner */}
        {(hasAlert || hasWarning || overdueScheduled > 0) && (
          <div className={`rounded-lg border p-4 ${hasAlert ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20'}`}>
            <p className={`font-medium ${hasAlert ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
              {hasAlert ? '🔴 Κρίσιμο πρόβλημα' : '⚠️ Προειδοποίηση'}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {healthValues.filter((h) => h.status !== 'ok').map((h) => (
                <li key={h.label} className="text-muted-foreground">{h.label}: {h.message}</li>
              ))}
              {overdueScheduled > 0 && (
                <li className="text-muted-foreground">{overdueScheduled} scheduled post(s) overdue by &gt;10 min</li>
              )}
            </ul>
          </div>
        )}

        {/* Today stats */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Σήμερα</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            <StatCard label="RSS Άρθρα" value={stats.rssToday} />
            <StatCard label="Βαθμολογήθηκαν" value={stats.scoredToday} />
            <StatCard label="Drafts" value={stats.draftsToday} />
            <StatCard label="Εγκρίθηκαν" value={stats.approvedToday} />
            <StatCard label="Δημοσιεύτηκαν" value={stats.publishedToday} />
            <StatCard label="FB Posts" value={stats.fbPostsToday} />
            <StatCard label="Προγρ/νοι" value={stats.scheduledPending} warn />
            <StatCard label="Trending" value={stats.trendingActive} />
            <StatCard label="Viral Alerts" value={stats.viralActive} warn />
          </div>
        </section>

        {/* Top content today */}
        {(topCluster || topArticle) && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Σήμερα</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {topCluster && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Top Trending Topic</p>
                  <p className="mt-1 font-semibold">{topCluster.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {topCluster.articleCount} άρθρα · {topCluster.sourceCount} πηγές · score {topCluster.trendScore}
                  </p>
                </div>
              )}
              {topArticle && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Top Άρθρο (Overall Score)</p>
                  <p className="mt-1 line-clamp-2 font-semibold">{topArticle.title}</p>
                  <p className="text-xs text-muted-foreground">Score: {topArticle.score?.overallScore ?? 0}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* System Health */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">System Health</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <HealthCard health={health.database} />
            <HealthCard health={health.openai} />
            <HealthCard health={health.facebook} />
            <HealthCard health={health.scheduler} />
            <HealthCard health={health.rssEngine} />
            <HealthCard health={health.trendClustering} />
            <HealthCard health={health.analyticsSync} />
          </div>
        </section>

        {/* RSS Sources */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">RSS Πηγές</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Πηγή</th>
                  <th className="px-4 py-2 text-right font-medium">Άρθρα</th>
                  <th className="px-4 py-2 text-right font-medium">Τελευταία Ανάκτηση</th>
                </tr>
              </thead>
              <tbody>
                {rssSources.map((src) => {
                  const ageH = src.lastFetchedAt
                    ? (Date.now() - src.lastFetchedAt.getTime()) / 3600000
                    : Infinity;
                  const stale = ageH > 24;
                  return (
                    <tr key={src.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium">{src.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{src._count.articles}</td>
                      <td className={`px-4 py-2 text-right ${stale ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {src.lastFetchedAt ? formatRelativeDate(src.lastFetchedAt.toISOString()) : 'Ποτέ'}
                      </td>
                    </tr>
                  );
                })}
                {rssSources.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Δεν υπάρχουν ενεργές πηγές</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cost Optimization */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cost Optimization (σήμερα)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Skipped before AI</p>
              <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400">{costSavings.preFilteredToday}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tokens Saved (est.)</p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{costSavings.tokensSavedToday.toLocaleString('el-GR')}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Cost Saved (est.)</p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">${costSavings.costSavedToday.toFixed(4)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">AI Scoring Calls</p>
              <p className="mt-1 text-2xl font-bold">{costSavings.aiScoringCallsToday}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">AI Generation Calls</p>
              <p className="mt-1 text-2xl font-bold">{costSavings.aiGenerationCallsToday}</p>
            </div>
          </div>
        </section>

        {/* OpenAI Usage (last 7 days) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">OpenAI Usage (7 ημέρες)</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">API Calls</p>
              <p className="mt-1 text-2xl font-bold">{openaiStats.calls}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tokens</p>
              <p className="mt-1 text-2xl font-bold">{openaiStats.totalTokens.toLocaleString('el-GR')}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Εκτιμώμενο Κόστος</p>
              <p className="mt-1 text-2xl font-bold">${openaiStats.totalCost.toFixed(4)}</p>
            </div>
          </div>
        </section>

        {/* Activity Feed */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity Feed</h2>
          <div className="space-y-1 rounded-lg border border-border bg-card">
            {recentEvents.map((ev, i) => (
              <div
                key={ev.id}
                className={`flex items-start gap-3 px-4 py-2.5 ${i !== recentEvents.length - 1 ? 'border-b border-border' : ''}`}
              >
                <EventBadge status={ev.status} />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">[{ev.service}]</span>{' '}
                  <span className="text-sm">{ev.message}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground/60">
                  {formatRelativeDate(ev.createdAt.toISOString())}
                </span>
              </div>
            ))}
            {recentEvents.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν events ακόμη</p>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
