import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';
import SocialPostFilters from './SocialPostFilters';
import SocialPostActions from './SocialPostActions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    platform?: string;
    q?: string;
    date?: string;
  }>;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  DRAFT:            { label: 'Draft',         className: 'bg-gray-100 dark:bg-gray-800 text-gray-500' },
  PENDING_APPROVAL: { label: 'Προς Έγκριση',  className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  APPROVED:         { label: 'Εγκρίθηκε',     className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  SCHEDULED:        { label: 'Scheduled',     className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  PUBLISHED:        { label: 'Δημοσιεύτηκε', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  REJECTED:         { label: 'Απορρίφθηκε',  className: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  FAILED:           { label: 'Failed',        className: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
};

const platformBadge: Record<string, { label: string; className: string }> = {
  FACEBOOK:  { label: 'Facebook',  className: 'bg-blue-600 text-white' },
  INSTAGRAM: { label: 'Instagram', className: 'bg-pink-600 text-white' },
  TWITTER:   { label: 'X / Twitter', className: 'bg-black text-white' },
};

export default async function SocialPostsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { status, platform, q, date } = await searchParams;

  const fromDate = date ? new Date(date) : undefined;

  const posts = await prisma.socialPost.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(platform ? { platform: platform as never } : {}),
      ...(q ? { article: { title: { contains: q, mode: 'insensitive' } } } : {}),
      ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      article: { select: { id: true, title: true, slug: true } },
    },
  });

  const counts = await prisma.socialPost.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Social Posts</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Διαχείριση Facebook posts πριν τη δημοσίευση.
            </p>
            {/* Status summary */}
            <div className="mt-2 flex flex-wrap gap-2">
              {(['DRAFT','PENDING_APPROVAL','APPROVED','PUBLISHED','REJECTED'] as const).map((s) => (
                countMap[s] ? (
                  <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[s].className}`}>
                    {statusBadge[s].label}: {countMap[s]}
                  </span>
                ) : null
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5">
          <SocialPostFilters
            currentStatus={status ?? ''}
            currentPlatform={platform ?? ''}
            currentSearch={q ?? ''}
            currentDate={date ?? ''}
          />
        </div>

        {/* Posts table */}
        {posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="mx-auto h-10 w-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <p className="font-medium">Δεν βρέθηκαν posts</p>
            <p className="text-sm mt-1">Δοκίμασε διαφορετικά φίλτρα.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
            {/* Table header */}
            <div className="hidden lg:grid grid-cols-[80px_130px_1fr_200px_110px_110px_auto] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <span>Πλατφ.</span>
              <span>Status</span>
              <span>Άρθρο / Post</span>
              <span>Content</span>
              <span>Scheduled</span>
              <span>Δημιουργήθηκε</span>
              <span>Ενέργειες</span>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {posts.map((post) => {
                const sb = statusBadge[post.status] ?? { label: post.status, className: 'bg-gray-100 text-gray-500' };
                const pb = platformBadge[post.platform] ?? { label: post.platform, className: 'bg-gray-500 text-white' };

                return (
                  <div
                    key={post.id}
                    className="grid grid-cols-1 lg:grid-cols-[80px_130px_1fr_200px_110px_110px_auto] gap-3 px-4 py-3.5 items-start"
                  >
                    {/* Platform */}
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pb.className}`}>
                        {pb.label}
                      </span>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sb.className}`}>
                        {sb.label}
                      </span>
                    </div>

                    {/* Article + post preview */}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/articles/${post.article.id}/preview`}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline line-clamp-1"
                      >
                        {post.article.title}
                      </Link>
                    </div>

                    {/* Content preview */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                      {post.content}
                    </div>

                    {/* scheduledAt */}
                    <div className="text-xs text-gray-400">
                      {post.scheduledAt
                        ? formatRelativeDate(post.scheduledAt.toISOString())
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </div>

                    {/* createdAt */}
                    <div className="text-xs text-gray-400">
                      {formatRelativeDate(post.createdAt.toISOString())}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      <SocialPostActions postId={post.id} status={post.status} platform={post.platform} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
