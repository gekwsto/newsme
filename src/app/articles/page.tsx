import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import ArticleCard from '@/components/articles/ArticleCard';
import TrendingSidebar from '@/components/ui/TrendingSidebar';
import { BRAND } from '@/config/brand';
import { DISPLAY_CATEGORIES } from '@/config/categories';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `Όλα τα Άρθρα | ${BRAND.name}`,
  description: `Εξερεύνησε όλα τα άρθρα του ${BRAND.name} — AI, Τεχνολογία, Οικονομία και πολλά άλλα.`,
};

export default async function ArticlesPage() {
  const [rawArticles, categories] = await Promise.all([
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: ARTICLE_PUBLIC_SELECT,
    }),
    prisma.category.findMany({
      where: { slug: { in: DISPLAY_CATEGORIES.map((c) => c.slug) } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  const articles = rawArticles.map(mapPrismaArticle);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-2">Όλα τα Άρθρα</h1>
        <p className="text-slate-500 dark:text-slate-400">
          {articles.length} δημοσιευμένα άρθρα σε {categories.length} κατηγορίες
        </p>
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
        <a href="/articles" className="px-4 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          Όλα
        </a>
        {categories.map((cat) => (
          <a
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className="px-4 py-2 rounded-full text-sm font-semibold border transition-colors hover:opacity-80"
            style={{ color: cat.color, borderColor: `${cat.color}50`, backgroundColor: `${cat.color}15` }}
          >
            {cat.name}
          </a>
        ))}
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <p className="text-5xl mb-4">📭</p>
          <p className="font-semibold text-lg">Δεν υπάρχουν ακόμη δημοσιευμένα άρθρα.</p>
          <p className="text-sm mt-1">Ελέγξτε ξανά σύντομα!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <TrendingSidebar />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
