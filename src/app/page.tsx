import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/db';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import { websiteJsonLd } from '@/lib/seo';
import { BRAND } from '@/config/brand';
import { SITE } from '@/config/site';
import { DISPLAY_CATEGORIES } from '@/config/categories';
import FeaturedArticle from '@/components/articles/FeaturedArticle';
import ArticleCard from '@/components/articles/ArticleCard';
import ArticleGrid from '@/components/articles/ArticleGrid';
import TrendingSidebar from '@/components/ui/TrendingSidebar';
import NewsletterSection from '@/components/sections/NewsletterSection';
import DiscussionTopics from '@/components/sections/DiscussionTopics';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
  alternates: { canonical: BRAND.domain },
  openGraph: {
    type: 'website',
    url: BRAND.domain,
    siteName: BRAND.name,
    locale: SITE.locale,
  },
};

export default async function HomePage() {
  const [rawArticles, categories] = await Promise.all([
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: ARTICLE_PUBLIC_SELECT,
    }),
    prisma.category.findMany({
      where: { slug: { in: DISPLAY_CATEGORIES.map((c) => c.slug) } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  const articles = rawArticles.map(mapPrismaArticle);
  const featuredArticle = articles[0];
  const latestArticles = articles.slice(1, 7);

  if (!featuredArticle) {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <p className="text-xl text-slate-400">Δεν υπάρχουν ακόμη δημοσιευμένα άρθρα.</p>
          <p className="text-sm text-slate-400 mt-2">Χρησιμοποίησε το admin panel για να δημιουργήσεις και να εγκρίνεις άρθρα.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero: Featured + latest 4 in column */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <div className="lg:col-span-2">
          <FeaturedArticle article={featuredArticle} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1 h-4 bg-red-600 rounded-full" />
              Τελευταία
            </h2>
            <Link href="/articles" className="text-xs text-red-600 hover:text-red-700 font-semibold">
              Όλα →
            </Link>
          </div>
          {articles.slice(1, 5).map((article) => (
            <ArticleCard key={article.id} article={article} variant="horizontal" />
          ))}
        </div>
      </section>

      {/* Main 2/3 + Sidebar 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-12">
          {latestArticles.length > 0 && (
            <ArticleGrid
              articles={latestArticles}
              columns={2}
              title="Νέα Άρθρα"
              showViewAll="/articles"
            />
          )}

          <DiscussionTopics />
          <NewsletterSection />
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <TrendingSidebar />
          </div>
        </div>
      </div>

      {/* Categories quick links */}
      {categories.length > 0 && (
        <section className="mt-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-8">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 text-center mb-6">
            Εξερεύνησε τις Κατηγορίες
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 transition-colors"
              >
                {cat.name}
                <ChevronRight size={14} className="text-slate-400" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
