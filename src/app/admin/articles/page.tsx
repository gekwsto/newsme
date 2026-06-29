import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Edit, Eye, Users, FilePlus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatRelativeDate } from '@/lib/utils';
import { ArticleStatus, ArticleType, SourceType } from '@/generated/prisma/enums';
import AdminShell from '@/components/admin/AdminShell';
import ApprovalActions from '../approvals/ApprovalActions';
import EvergreenEngineButton from './EvergreenEngineButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Άρθρα | Admin ${BRAND.name}`,
};

const statusBadge: Record<ArticleStatus, { label: string; classes: string }> = {
  DRAFT: { label: 'Πρόχειρο', classes: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
  PENDING_APPROVAL: { label: 'Προς Έγκριση', classes: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  APPROVED: { label: 'Εγκεκριμένο', classes: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  PUBLISHED: { label: 'Δημοσιευμένο', classes: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  REJECTED: { label: 'Απορριφθέν', classes: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
};

const tabs = [
  { key: 'news', label: 'News', type: ArticleType.NEWS },
  { key: 'evergreen', label: 'Evergreen', type: ArticleType.EVERGREEN },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { type } = await searchParams;
  const activeTab: TabKey = type === 'evergreen' ? 'evergreen' : 'news';
  const activeType = activeTab === 'evergreen' ? ArticleType.EVERGREEN : ArticleType.NEWS;

  const [articles, newsCount, evergreenCount] = await Promise.all([
    prisma.article.findMany({
      where: { articleType: activeType },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        sourceType: true,
        updatedAt: true,
        views: true,
        qualityScore: true,
        aiSeoScore: true,
        readabilityScore: true,
        category: { select: { name: true, color: true } },
        author: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.article.count({ where: { articleType: ArticleType.NEWS } }),
    prisma.article.count({ where: { articleType: ArticleType.EVERGREEN } }),
  ]);

  const counts: Record<TabKey, number> = { news: newsCount, evergreen: evergreenCount };

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText size={22} className="text-slate-400" />
              Άρθρα
            </h1>
            <p className="text-slate-400 text-sm mt-1">{articles.length} άρθρα στην κατηγορία</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'evergreen' && <EvergreenEngineButton />}
            <Link
              href="/admin/articles/new"
              className="flex items-center gap-1.5 text-sm font-bold bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <FilePlus size={15} />
              Νέο Άρθρο
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/articles?type=${tab.key}`}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 border border-b-white dark:border-slate-700 dark:border-b-slate-800 text-slate-900 dark:text-slate-100 -mb-px'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    isActive
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {articles.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              {activeTab === 'evergreen'
                ? 'Δεν υπάρχουν Evergreen άρθρα ακόμα. Τρέξε τον Evergreen Engine.'
                : 'Δεν υπάρχουν News άρθρα ακόμα.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Τίτλος</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Κατηγορία</th>
                    {activeTab === 'evergreen' && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Ποιότητα</th>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Κατάσταση</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                      <span className="flex items-center gap-1"><Users size={12} />Views</span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Τελ. Αλλαγή</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {articles.map((article) => {
                    const badge = statusBadge[article.status];
                    return (
                      <tr key={article.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 max-w-xs">
                            {article.sourceType === SourceType.RSS_SUMMARY && (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 leading-none">
                                ⚡ Auto
                              </span>
                            )}
                            <p className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                              {article.title}
                            </p>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{article.author.name}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{article.category.name}</span>
                        </td>
                        {activeTab === 'evergreen' && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            {article.qualityScore != null ? (
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  article.qualityScore >= 8 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                  article.qualityScore >= 7 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                  'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}>
                                  Q:{article.qualityScore}
                                </span>
                                {article.aiSeoScore != null && (
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                    article.aiSeoScore >= 8 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                    article.aiSeoScore >= 7 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  }`}>
                                    S:{article.aiSeoScore}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.classes}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {article.views > 0 ? article.views.toLocaleString('el-GR') : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-slate-400">
                            {formatRelativeDate(article.updatedAt.toISOString())}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <Link
                              href={`/admin/articles/${article.id}/preview`}
                              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                              title="Preview"
                            >
                              <Eye size={14} />
                            </Link>
                            <Link
                              href={`/admin/articles/${article.id}/edit`}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="Επεξεργασία"
                            >
                              <Edit size={14} />
                            </Link>
                            {article.status === ArticleStatus.APPROVED && (
                              <ApprovalActions articleId={article.id} showPublish />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
