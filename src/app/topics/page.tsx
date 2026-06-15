import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { CLUSTERS } from '@/services/evergreen-clusters';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Θέματα & Clusters | ΑΙΣΧΟΛΙΑΣΜΟΣ',
  description: 'Εξερευνήστε 20 θεματικά clusters με 500+ evergreen άρθρα για AI, Τεχνολογία, Επιχειρηματικότητα και Οικονομία.',
  alternates: { canonical: 'https://aisxoliasmos.gr/topics' },
};

export default async function TopicsIndexPage() {
  const counts = await prisma.article.groupBy({
    by: ['secondaryKeywords'],
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: ArticleType.EVERGREEN,
    },
    _count: { id: true },
  });

  const articleCountByCluster: Record<string, number> = {};
  for (const cluster of CLUSTERS) {
    const tag = `cluster:${cluster.name}`;
    const total = await prisma.article.count({
      where: {
        status: ArticleStatus.PUBLISHED,
        articleType: ArticleType.EVERGREEN,
        secondaryKeywords: { has: tag },
      },
    });
    articleCountByCluster[cluster.slug] = total;
  }

  const totalArticles = Object.values(articleCountByCluster).reduce((s, c) => s + c, 0);

  const byCategory = CLUSTERS.reduce(
    (acc, c) => {
      if (!acc[c.dbCategory]) acc[c.dbCategory] = [];
      acc[c.dbCategory].push(c);
      return acc;
    },
    {} as Record<string, typeof CLUSTERS>,
  );

  const categoryOrder = ['AI', 'Τεχνολογία', 'Επιχειρηματικότητα', 'Οικονομία'];
  const categoryColors: Record<string, string> = {
    AI: '#6366f1',
    Τεχνολογία: '#0ea5e9',
    Επιχειρηματικότητα: '#10b981',
    Οικονομία: '#f59e0b',
  };

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 py-14">
        <div className="max-w-5xl mx-auto px-4">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-3">
            Θεματικά Clusters
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {CLUSTERS.length} clusters · {CLUSTERS.reduce((s, c) => s + c.topics.length, 0)} θέματα ·{' '}
            {totalArticles} δημοσιευμένα άρθρα
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">
        {categoryOrder.map((cat) => {
          const clusters = byCategory[cat] ?? [];
          if (!clusters.length) return null;
          return (
            <section key={cat}>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: categoryColors[cat] ?? '#6366f1' }}
                />
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{cat}</h2>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {clusters.map((cluster) => {
                  const count = articleCountByCluster[cluster.slug] ?? 0;
                  return (
                    <Link
                      key={cluster.slug}
                      href={`/topics/${cluster.slug}`}
                      className="group border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                    >
                      <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1.5">
                        {cluster.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                        {cluster.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <BookOpen size={11} />
                          {count > 0 ? `${count} άρθρα` : 'Έρχεται σύντομα'}
                        </span>
                        <span>{cluster.topics.length} θέματα</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
