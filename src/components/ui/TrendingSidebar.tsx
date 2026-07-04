import Link from 'next/link';
import { Flame, Hash } from 'lucide-react';
import { prisma } from '@/lib/db';
import CategoryBadge from './CategoryBadge';

export default async function TrendingSidebar() {
  const [recentArticles, trendClusters, categories] = await Promise.all([
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        slug: true,
        title: true,
        generatedImageUrl: true,
        publishedAt: true,
        category: { select: { name: true, slug: true, color: true } },
      },
    }),
    prisma.trendCluster.findMany({
      where: { lastSeenAt: { gte: new Date(Date.now() - 48 * 3600000) } },
      orderBy: { trendScore: 'desc' },
      take: 8,
      select: { id: true, topic: true, articleCount: true },
    }),
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, slug: true, color: true },
    }),
  ]);

  return (
    <aside className="space-y-6">
      {/* Recent/popular articles */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
          <Flame size={15} className="text-red-500" />
          <h2 className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase tracking-widest">
            Πρόσφατα Άρθρα
          </h2>
        </div>

        {recentArticles.length === 0 ? (
          <p className="px-4 py-6 text-xs text-slate-400 text-center">Δεν υπάρχουν δημοσιευμένα άρθρα ακόμη.</p>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {recentArticles.map((article, index) => (
              <Link
                key={article.id}
                href={`/${article.category.slug}/${article.slug}`}
                className="flex gap-3 px-4 py-3 group hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
              >
                <span
                  className={`text-xl font-black leading-none w-6 shrink-0 pt-0.5 ${
                    index === 0 ? 'text-red-500' : index === 1 ? 'text-orange-400' : index === 2 ? 'text-amber-400' : 'text-slate-200 dark:text-slate-600'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-flex items-center font-semibold rounded-full border text-[10px] px-2 py-0.5 tracking-wide"
                    style={{
                      color: article.category.color,
                      backgroundColor: `${article.category.color}20`,
                      borderColor: `${article.category.color}50`,
                    }}
                  >
                    {article.category.name}
                  </span>
                  <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 group-hover:text-red-600 transition-colors leading-snug">
                    {article.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Trending topics from AI clusters */}
      {trendClusters.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <Hash size={15} className="text-violet-600" />
            <h2 className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase tracking-widest">
              Hot Topics
            </h2>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {trendClusters.map((cluster) => (
              <div key={cluster.id} className="group cursor-default">
                <span className="inline-flex flex-col bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{cluster.topic}</span>
                  <span className="text-[10px] text-slate-400">{cluster.articleCount} άρθρα</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <h2 className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase tracking-widest">
              Κατηγορίες
            </h2>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Link key={cat.slug} href={`/category/${cat.slug}`}>
                <CategoryBadge category={cat} size="md" linkable={false} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
