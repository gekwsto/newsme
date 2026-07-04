import Link from 'next/link';
import { MessageCircle, TrendingUp, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { ArticleStatus } from '@/generated/prisma/enums';
import { BRAND } from '@/config/brand';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function DiscussionTopics() {
  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    orderBy: { views: 'desc' },
    take: 7,
    select: { id: true, title: true, slug: true, views: true, category: { select: { slug: true } } },
  });

  if (articles.length === 0) return null;

  const hotSet = new Set(articles.slice(0, 3).map((a) => a.id));

  return (
    <section className="bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-800/60 dark:to-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            💬 Συζητιέται Τώρα
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
          <Users size={11} />
          Μοιράσου την άποψή σου
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {articles.map((article) => {
          const isHot = hotSet.has(article.id);
          return (
            <Link
              key={article.id}
              href={`/${article.category.slug}/${article.slug}`}
              className={`relative group flex-grow min-w-[200px] max-w-full sm:max-w-[calc(50%-0.375rem)] bg-white dark:bg-slate-800 border rounded-xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-slate-900/40 ${
                isHot
                  ? 'border-red-200 dark:border-red-800/50 hover:border-red-400 dark:hover:border-red-600'
                  : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {isHot && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full leading-none">
                  HOT
                </span>
              )}

              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                {article.title}
              </p>

              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <TrendingUp size={10} className="text-blue-400" />
                  {formatCount(article.views)} προβολές
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
        Συμμετείχε στη συζήτηση στην{' '}
        <a
          href={BRAND.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
        >
          σελίδα μας στο Facebook
        </a>
      </p>
    </section>
  );
}
