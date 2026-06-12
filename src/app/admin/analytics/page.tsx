import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';
import SyncButton from './SyncButton';

export const dynamic = 'force-dynamic';

async function fetchData() {
  const posts = await prisma.socialPost.findMany({
    where: { platform: 'FACEBOOK' },
    include: {
      article: { select: { title: true, slug: true } },
      performance: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const published = posts.filter((p) => p.status === 'PUBLISHED' && p.performance);
  const withPerformance = posts.filter((p) => p.performance);

  const topByReactions = [...withPerformance]
    .sort((a, b) => (b.performance?.actualReactions ?? 0) - (a.performance?.actualReactions ?? 0))
    .slice(0, 5);

  const topByComments = [...withPerformance]
    .sort((a, b) => (b.performance?.actualComments ?? 0) - (a.performance?.actualComments ?? 0))
    .slice(0, 5);

  const topByShares = [...withPerformance]
    .sort((a, b) => (b.performance?.actualShares ?? 0) - (a.performance?.actualShares ?? 0))
    .slice(0, 5);

  const topByReach = [...withPerformance]
    .sort((a, b) => (b.performance?.actualReach ?? 0) - (a.performance?.actualReach ?? 0))
    .slice(0, 5);

  const totalReactions = withPerformance.reduce((s, p) => s + (p.performance?.actualReactions ?? 0), 0);
  const totalComments = withPerformance.reduce((s, p) => s + (p.performance?.actualComments ?? 0), 0);
  const totalShares = withPerformance.reduce((s, p) => s + (p.performance?.actualShares ?? 0), 0);

  return {
    allPosts: posts,
    withPerformance,
    published,
    topByReactions,
    topByComments,
    topByShares,
    topByReach,
    totalReactions,
    totalComments,
    totalShares,
  };
}

type PostWithPerf = Awaited<ReturnType<typeof fetchData>>['allPosts'][0];

function PredictionBar({ predicted, actual, label }: { predicted: number; actual: number; label: string }) {
  const pct = Math.min(predicted, 100);
  const accuracy = predicted > 0 ? Math.round((Math.min(actual, predicted * 2) / (predicted * 2)) * 100) : null;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{label}</span>
        <span>pred: {predicted} · actual: {actual}{accuracy !== null ? ` · ${accuracy}%` : ''}</span>
      </div>
      <div className="flex gap-1 h-1.5 rounded overflow-hidden">
        <div className="bg-indigo-200 dark:bg-indigo-900/60 rounded" style={{ width: `${pct}%`, minWidth: 2 }} />
        {actual > 0 && (
          <div className="bg-green-400 dark:bg-green-500 rounded" style={{ width: `${Math.min(actual, 100)}%`, minWidth: 2 }} />
        )}
      </div>
    </div>
  );
}

function PostRow({ post, metric }: { post: PostWithPerf; metric: 'reactions' | 'comments' | 'shares' | 'reach' }) {
  const perf = post.performance;
  const value = perf
    ? { reactions: perf.actualReactions, comments: perf.actualComments, shares: perf.actualShares, reach: perf.actualReach }[metric]
    : null;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{post.article.title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeDate(post.createdAt.toISOString())}</p>
      </div>
      {value !== null && (
        <span className="text-sm font-bold text-gray-700 dark:text-gray-200 tabular-nums">{value.toLocaleString()}</span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
        post.status === 'PUBLISHED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
        post.status === 'SCHEDULED' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
        'bg-gray-100 dark:bg-gray-800 text-gray-500'
      }`}>
        {post.status}
      </span>
    </div>
  );
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const data = await fetchData();
  const lastSync = data.withPerformance
    .flatMap((p) => (p.performance?.lastSyncedAt ? [p.performance.lastSyncedAt] : []))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📊 Analytics</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Facebook post performance — predicted vs actual
            </p>
            {lastSync && (
              <p className="text-xs text-gray-400 mt-0.5">
                Last sync: {formatRelativeDate(lastSync.toISOString())}
              </p>
            )}
          </div>
          <SyncButton />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Posts', value: data.allPosts.length, emoji: '📝' },
            { label: 'Reactions', value: data.totalReactions, emoji: '❤️' },
            { label: 'Comments', value: data.totalComments, emoji: '💬' },
            { label: 'Shares', value: data.totalShares, emoji: '🔁' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.emoji} {stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
                {stat.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* No data state */}
        {data.withPerformance.length === 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
            <p className="text-gray-400 mb-2">Δεν υπάρχουν δεδομένα performance ακόμη.</p>
            <p className="text-sm text-gray-400">
              Δημοσίευσε posts στο Facebook και πάτα <strong>Sync from Facebook</strong> για να φέρεις metrics.
              <br />
              Τα predicted scores δημιουργούνται αυτόματα κατά την παραγωγή draft.
            </p>
          </div>
        )}

        {/* Tables grid */}
        {data.withPerformance.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Reactions */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">❤️ Top Reactions</h2>
              {data.topByReactions.map((p) => <PostRow key={p.id} post={p} metric="reactions" />)}
            </div>

            {/* Best Discussion */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">💬 Best Discussion</h2>
              {data.topByComments.map((p) => <PostRow key={p.id} post={p} metric="comments" />)}
            </div>

            {/* Most Shared */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">🔁 Most Shared</h2>
              {data.topByShares.map((p) => <PostRow key={p.id} post={p} metric="shares" />)}
            </div>

            {/* Most Reached */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">👁 Most Reached</h2>
              {data.topByReach.map((p) => <PostRow key={p.id} post={p} metric="reach" />)}
            </div>
          </div>
        )}

        {/* All posts with prediction vs actual */}
        {data.withPerformance.length > 0 && (
          <div className="mt-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">📈 Predicted vs Actual</h2>
            <div className="space-y-4">
              {data.withPerformance.slice(0, 20).map((post) => (
                <div key={post.id} className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2 line-clamp-1">
                    {post.article.title}
                  </p>
                  {post.performance && (
                    <div className="space-y-1.5">
                      <PredictionBar
                        predicted={post.performance.predictedReach}
                        actual={post.performance.actualReach}
                        label="Reach"
                      />
                      <PredictionBar
                        predicted={post.performance.predictedComments}
                        actual={post.performance.actualComments}
                        label="Comments"
                      />
                      <PredictionBar
                        predicted={post.performance.predictedShares}
                        actual={post.performance.actualShares}
                        label="Shares"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
