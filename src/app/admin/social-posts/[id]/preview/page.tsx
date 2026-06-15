import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PublishToFacebookButton from './PublishToFacebookButton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Προς Έγκριση',
  APPROVED: 'Εγκεκριμένο',
  PUBLISHED: 'Δημοσιεύτηκε',
  REJECTED: 'Απορρίφθηκε',
  SCHEDULED: 'Scheduled',
  FAILED: 'Failed',
};

function formatFbTime(date?: Date | null): string {
  if (!date) return 'μόλις τώρα';
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return 'μόλις τώρα';
  if (diff < 3600) return `${Math.floor(diff / 60)} λεπτά`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ώρες`;
  return date.toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
}

export default async function SocialPostPreviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { id } = await params;

  const post = await prisma.socialPost.findUnique({
    where: { id },
    include: {
      article: {
        select: { id: true, title: true, excerpt: true, coverImage: true, slug: true },
      },
    },
  });

  if (!post) notFound();

  // Render post content with line breaks
  const lines = post.content.split('\n');

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/social-posts"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Social Posts
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Facebook Preview</span>
          </div>
          <div className="flex items-center gap-2">
            {post.status === 'APPROVED' && post.platform === 'FACEBOOK' && (
              <PublishToFacebookButton postId={id} />
            )}
            <Link
              href={`/admin/social-posts/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Επεξεργασία
            </Link>
          </div>
        </div>

        {/* Status badge */}
        <div className="mb-4 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {STATUS_LABELS[post.status] ?? post.status}
            </span>
            {post.scheduledAt && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400">
                  Προγραμματισμένο: {post.scheduledAt.toLocaleString('el-GR')}
                </span>
              </>
            )}
            {post.externalPostId && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400">
                  Facebook ID: <span className="font-mono">{post.externalPostId}</span>
                </span>
              </>
            )}
          </div>
          {post.errorMessage && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-0.5">Σφάλμα δημοσίευσης</p>
              <p className="text-xs text-red-600 dark:text-red-400">{post.errorMessage}</p>
            </div>
          )}
        </div>

        {/* ─── Mock Facebook Post ────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 font-sans">
          {/* Facebook-style page header */}
          <div className="bg-white dark:bg-[#1c1e21] px-4 pt-4 pb-2">
            <div className="flex items-start gap-2.5">
              {/* Page avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-lg leading-none">Α</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-tight">
                      ΑΙΣΧΟΛΙΑΣΜΟΣ
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFbTime(post.scheduledAt ?? post.createdAt)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs">·</span>
                      {/* Globe icon = public */}
                      <svg className="h-3 w-3 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                      </svg>
                    </div>
                  </div>
                  {/* Follow button */}
                  <button className="text-xs font-semibold text-[#1877F2] bg-[#E7F0FD] px-3 py-1.5 rounded-lg cursor-default">
                    + Ακολούθηση
                  </button>
                </div>
              </div>
            </div>

            {/* Post text */}
            <div className="mt-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-line">
              {post.content}
            </div>
          </div>

          {/* Link preview card */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-[#F2F3F5] dark:bg-[#2d2f33]">
            {/* Cover image placeholder */}
            {post.article.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.article.coverImage}
                alt={post.article.title}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-40 bg-gradient-to-br from-indigo-100 to-blue-200 dark:from-indigo-900 dark:to-blue-950 flex items-center justify-center">
                <svg className="h-12 w-12 text-indigo-400 dark:text-indigo-600 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            )}

            {/* Article meta */}
            <div className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">
                aisxoliasmos.gr
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
                {post.article.title}
              </p>
              {post.article.excerpt && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                  {post.article.excerpt}
                </p>
              )}
            </div>
          </div>

          {/* Reaction bar */}
          <div className="bg-white dark:bg-[#1c1e21] px-4 py-1.5 border-t border-gray-100 dark:border-gray-800">
            {/* Reaction counts (mock) */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px]">👍</span>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px]">❤️</span>
                142
              </span>
              <span>23 σχόλια · 18 κοινοποιήσεις</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center border-t border-gray-100 dark:border-gray-800 pt-1.5 gap-0">
              {[
                { icon: '👍', label: 'Μου αρέσει' },
                { icon: '💬', label: 'Σχόλιο' },
                { icon: '↗', label: 'Κοινοποίηση' },
              ].map(({ icon, label }) => (
                <button
                  key={label}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-default"
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* ─── End mock ─── */}

        <p className="mt-3 text-center text-xs text-gray-400">
          Mock preview — δεν αντικατοπτρίζει ακριβώς το Facebook UI
        </p>
      </div>
    </AdminShell>
  );
}
