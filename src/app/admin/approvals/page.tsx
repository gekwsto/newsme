import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, CheckSquare } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatRelativeDate } from '@/lib/utils';
import { ArticleStatus, SourceType } from '@/generated/prisma/enums';
import AdminShell from '@/components/admin/AdminShell';
import ApprovalActions from './ApprovalActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Approval Queue | Admin ${BRAND.name}`,
};

const sourceLabels: Record<SourceType, string> = {
  MANUAL: 'Χειροκίνητο',
  AI_GENERATED: '🤖 AI',
  AI_ASSISTED: '🤖 AI-Assisted',
  RSS_SUMMARY: '📡 RSS',
};

export default async function ApprovalsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [pending, other] = await Promise.all([
    prisma.article.findMany({
      where: { status: ArticleStatus.PENDING_APPROVAL },
      include: { category: true, author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.article.findMany({
      where: { status: { in: [ArticleStatus.APPROVED, ArticleStatus.REJECTED] } },
      include: { category: true, author: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckSquare size={22} className="text-amber-500" />
              Approval Queue
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {pending.length} άρθρα αναμένουν έγκριση
            </p>
          </div>
        </div>

        {/* Pending articles */}
        {pending.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <CheckSquare size={36} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-900 dark:text-slate-100 font-semibold">Όλα ενήμερα!</p>
            <p className="text-slate-400 text-sm mt-1">Δεν υπάρχουν άρθρα προς έγκριση αυτή τη στιγμή.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((article) => (
              <div
                key={article.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-700/40 shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock size={10} />
                          Προς Έγκριση
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                          {article.category.name}
                        </span>
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full">
                          {sourceLabels[article.sourceType]}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {article.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {article.excerpt}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>{article.author.name}</span>
                        <span>·</span>
                        <span>{formatRelativeDate(article.createdAt.toISOString())}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link
                        href={`/admin/articles/${article.id}/preview`}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/admin/articles/${article.id}/edit`}
                        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Επεξεργασία
                      </Link>
                      <ApprovalActions articleId={article.id} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recently reviewed */}
        {other.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Πρόσφατα Ελεγμένα
              </h2>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {other.map((article) => (
                <li key={article.id} className="px-5 py-3 flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      article.status === ArticleStatus.APPROVED
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                    }`}
                  />
                  <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                    {article.title}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0">
                    {article.status === ArticleStatus.APPROVED ? 'Εγκρίθηκε' : 'Απορρίφθηκε'}
                  </span>
                  {article.status === ArticleStatus.APPROVED && (
                    <ApprovalActions articleId={article.id} showPublish />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
