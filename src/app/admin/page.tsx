import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CheckSquare, FileText, BookOpen, XSquare, Clock, Eye, TrendingUp,
  MessageSquare, Send, Radio,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatRelativeDate } from '@/lib/utils';
import { ArticleStatus, SocialPostStatus } from '@/generated/prisma/enums';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Dashboard | Admin ${BRAND.name}`,
};

const articleStatusConfig = {
  [ArticleStatus.PENDING_APPROVAL]: {
    label: 'Προς Έγκριση',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-700/40',
    href: '/admin/approvals',
  },
  [ArticleStatus.APPROVED]: {
    label: 'Εγκεκριμένα',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-700/40',
    href: '/admin/approvals',
  },
  [ArticleStatus.PUBLISHED]: {
    label: 'Δημοσιευμένα',
    icon: Eye,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-700/40',
    href: '/admin/articles',
  },
  [ArticleStatus.REJECTED]: {
    label: 'Απορριφθέντα',
    icon: XSquare,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-700/40',
    href: '/admin/approvals',
  },
  [ArticleStatus.DRAFT]: {
    label: 'Πρόχειρα',
    icon: FileText,
    color: 'text-slate-500',
    bg: 'bg-slate-50 dark:bg-slate-800/40',
    border: 'border-slate-200 dark:border-slate-700/40',
    href: '/admin/articles',
  },
} as const;

const socialStatusConfig = {
  [SocialPostStatus.PENDING_APPROVAL]: {
    label: 'Social Προς Έγκριση',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-700/40',
  },
  [SocialPostStatus.APPROVED]: {
    label: 'Social Εγκεκριμένα',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-700/40',
  },
  [SocialPostStatus.PUBLISHED]: {
    label: 'Social Δημοσιευμένα',
    icon: Send,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-700/40',
  },
} as const;

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [articleCounts, socialCounts, recentPending, recentPendingSocial] = await Promise.all([
    prisma.article.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.socialPost.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.article.findMany({
      where: { status: ArticleStatus.PENDING_APPROVAL },
      include: { category: true, author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.socialPost.findMany({
      where: { status: SocialPostStatus.PENDING_APPROVAL },
      include: { article: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);

  const articleCountMap = Object.fromEntries(
    articleCounts.map((c) => [c.status, c._count.id])
  ) as Record<ArticleStatus, number>;

  const socialCountMap = Object.fromEntries(
    socialCounts.map((c) => [c.status, c._count.id])
  ) as Record<SocialPostStatus, number>;

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Επισκόπηση του admin panel
          </p>
        </div>

        {/* Article stats */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Άρθρα
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {(Object.entries(articleStatusConfig) as [ArticleStatus, (typeof articleStatusConfig)[ArticleStatus]][]).map(
              ([status, cfg]) => {
                const Icon = cfg.icon;
                const count = articleCountMap[status] ?? 0;
                return (
                  <Link
                    key={status}
                    href={cfg.href}
                    className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border} hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {cfg.label}
                        </p>
                        <p className={`text-3xl font-black mt-1 ${cfg.color}`}>{count}</p>
                      </div>
                      <Icon size={20} className={`${cfg.color} opacity-60 mt-0.5`} />
                    </div>
                  </Link>
                );
              }
            )}
          </div>
        </div>

        {/* Social post stats */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Social Posts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(Object.entries(socialStatusConfig) as [keyof typeof socialStatusConfig, typeof socialStatusConfig[keyof typeof socialStatusConfig]][]).map(
              ([status, cfg]) => {
                const Icon = cfg.icon;
                const count = (socialCountMap as Record<string, number>)[status] ?? 0;
                return (
                  <Link
                    key={status}
                    href={`/admin/social-posts?status=${status}`}
                    className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border} hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {cfg.label}
                        </p>
                        <p className={`text-3xl font-black mt-1 ${cfg.color}`}>{count}</p>
                      </div>
                      <Icon size={20} className={`${cfg.color} opacity-60 mt-0.5`} />
                    </div>
                  </Link>
                );
              }
            )}
          </div>
        </div>

        {/* Recent pending articles */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-amber-500" />
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Πρόσφατα Άρθρα Προς Έγκριση
              </h2>
            </div>
            <Link
              href="/admin/approvals"
              className="text-xs text-red-600 dark:text-red-400 font-semibold hover:underline"
            >
              Δες όλα →
            </Link>
          </div>

          {recentPending.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">
              Δεν υπάρχουν άρθρα προς έγκριση
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {recentPending.map((article) => (
                <li key={article.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{article.category.name}</span>
                      <span>·</span>
                      <span>{article.author.name}</span>
                      <span>·</span>
                      <span>{formatRelativeDate(article.createdAt.toISOString())}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/articles/${article.id}/preview`}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1"
                    >
                      <BookOpen size={12} />
                      Preview
                    </Link>
                    <Link
                      href="/admin/approvals"
                      className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold px-2.5 py-1 rounded-full hover:bg-amber-200 transition-colors"
                    >
                      Έγκριση
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent pending social posts */}
        {recentPendingSocial.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-blue-500" />
                <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Pending Social Posts
                </h2>
              </div>
              <Link
                href="/admin/social-posts?status=PENDING_APPROVAL"
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Δες όλα →
              </Link>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {recentPendingSocial.map((post) => (
                <li key={post.id} className="px-5 py-3.5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {post.article.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{post.content}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/social-posts/${post.id}/preview`}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/admin/social-posts/${post.id}/edit`}
                      className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold px-2.5 py-1 rounded-full hover:bg-amber-200 transition-colors"
                    >
                      Έγκριση
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { href: '/admin/approvals', label: 'Approval Queue', icon: CheckSquare, desc: 'Έγκριση / απόρριψη άρθρων' },
            { href: '/admin/social-posts', label: 'Social Posts', icon: MessageSquare, desc: 'Έγκριση Facebook posts' },
            { href: '/admin/news-discovery', label: 'News Discovery', icon: Radio, desc: 'Νέα από RSS feeds' },
            { href: '/', label: 'Δες το Site', icon: TrendingUp, desc: 'Άνοιγμα public site', external: true },
          ].map(({ href, label, icon: Icon, desc, external }) => (
            <Link
              key={href}
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow flex items-start gap-3 group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors">
                <Icon size={18} className="text-slate-500 group-hover:text-red-600 transition-colors" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
