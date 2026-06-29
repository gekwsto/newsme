import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';
import FetchButton from './FetchButton';
import ReviewActions from './ReviewActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Article Review | Admin ${BRAND.name}`,
};

type Filter = 'pending' | 'accepted' | 'rejected' | 'all';

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function ArticleReviewPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { filter: rawFilter } = await searchParams;
  const filter: Filter = (['pending', 'accepted', 'rejected', 'all'] as const).includes(rawFilter as Filter)
    ? (rawFilter as Filter)
    : 'pending';

  const where =
    filter === 'pending'   ? { humanVerdict: null } :
    filter === 'accepted'  ? { humanVerdict: 'accepted' } :
    filter === 'rejected'  ? { humanVerdict: 'rejected' } :
    {};

  const [articles, counts] = await Promise.all([
    prisma.discoveredArticle.findMany({
      where,
      orderBy: [
        { score: { overallScore: 'desc' } },
        { createdAt: 'desc' },
      ],
      take: 100,
      select: {
        id: true,
        title: true,
        url: true,
        excerpt: true,
        createdAt: true,
        humanVerdict: true,
        humanVerdictAt: true,
        source: { select: { name: true, country: true } },
        category: { select: { name: true, color: true } },
        score: {
          select: {
            overallScore: true,
            greekInterestScore: true,
            facebookClickScore: true,
            rejected: true,
          },
        },
      },
    }),
    prisma.discoveredArticle.groupBy({
      by: ['humanVerdict'],
      _count: { id: true },
    }),
  ]);

  const countMap: Record<string, number> = { pending: 0, accepted: 0, rejected: 0 };
  let total = 0;
  for (const c of counts) {
    total += c._count.id;
    if (c.humanVerdict === null) countMap.pending = c._count.id;
    else if (c.humanVerdict === 'accepted') countMap.accepted = c._count.id;
    else if (c.humanVerdict === 'rejected') countMap.rejected = c._count.id;
  }
  const labeled = countMap.accepted + countMap.rejected;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'pending',  label: 'Αξιολόγηση', count: countMap.pending },
    { key: 'accepted', label: '✓ Accepted',  count: countMap.accepted },
    { key: 'rejected', label: '✗ Rejected',  count: countMap.rejected },
    { key: 'all',      label: 'Όλα',         count: total },
  ];

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Article Review
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Χειροκίνητη αξιολόγηση άρθρων για εκπαίδευση classifier. {labeled} labeled / {total} total.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <FetchButton />
            {labeled > 0 && (
              <a
                href="/api/admin/article-review/export"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
              >
                ↓ Export JSONL ({labeled})
              </a>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{countMap.accepted}</p>
            <p className="text-xs text-slate-500 mt-1">Accepted</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{countMap.rejected}</p>
            <p className="text-xs text-slate-500 mt-1">Rejected</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{countMap.pending}</p>
            <p className="text-xs text-slate-500 mt-1">Αξιολόγηση</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {tabs.map((tab) => {
            const isActive = filter === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/article-review?filter=${tab.key}`}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 border border-b-white dark:border-slate-700 dark:border-b-slate-800 text-slate-900 dark:text-slate-100 -mb-px'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  isActive
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Articles */}
        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-sm text-slate-400">
            {filter === 'pending'
              ? 'Δεν υπάρχουν άρθρα για αξιολόγηση. Πάτα "Fetch Νέα Άρθρα".'
              : 'Κανένα άρθρο σε αυτή την κατηγορία.'}
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className={`rounded-xl border bg-white dark:bg-slate-900 p-4 transition-colors ${
                  article.humanVerdict === 'accepted'
                    ? 'border-emerald-200 dark:border-emerald-900/50'
                    : article.humanVerdict === 'rejected'
                    ? 'border-red-200 dark:border-red-900/50 opacity-60'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Score */}
                  {article.score && (
                    <div className="shrink-0 text-center">
                      <div className={`text-sm font-bold w-10 h-10 rounded-lg flex items-center justify-center ${
                        article.score.overallScore >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                        article.score.overallScore >= 40 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                        'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {article.score.overallScore}
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-900 dark:text-white hover:underline line-clamp-2"
                        >
                          {article.title}
                        </a>
                        {article.excerpt && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {article.excerpt}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {/* Source */}
                      <span className="text-[11px] text-slate-400">
                        {article.source.name}
                        {article.source.country !== 'GLOBAL' && (
                          <span className="ml-1 opacity-60">{article.source.country}</span>
                        )}
                      </span>

                      {/* Category */}
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: article.category.color + '22', color: article.category.color }}
                      >
                        {article.category.name}
                      </span>

                      {/* Sub-scores */}
                      {article.score && (
                        <span className="text-[10px] text-slate-400">
                          🇬🇷 {article.score.greekInterestScore} · 📘 {article.score.facebookClickScore}
                          {article.score.rejected && (
                            <span className="ml-1 text-red-500 font-semibold">AI rejected</span>
                          )}
                        </span>
                      )}

                      {/* Date */}
                      <span className="text-[11px] text-slate-400 ml-auto">
                        {formatRelativeDate(article.createdAt.toISOString())}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-3">
                      <ReviewActions
                        articleId={article.id}
                        currentVerdict={article.humanVerdict}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
