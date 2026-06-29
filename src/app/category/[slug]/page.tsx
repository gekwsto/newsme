import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import { SITE_URL, categoryCanonical, breadcrumbJsonLd, categoryPageJsonLd, DEFAULT_OG_IMAGE, SITE_NAME, SITE_TWITTER } from '@/lib/seo';
import { isDisplayCategory, DISPLAY_CATEGORY_MAP, DISPLAY_CATEGORIES } from '@/config/categories';
import ArticleCard from '@/components/articles/ArticleCard';
import TrendingSidebar from '@/components/ui/TrendingSidebar';

export async function generateStaticParams() {
  const categories = await prisma.category.findMany({ select: { slug: true } });
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug }, select: { name: true, slug: true } });
  if (!category) return { title: 'Κατηγορία δεν βρέθηκε' };
  const description = `Τα τελευταία άρθρα για ${category.name} — AI, Τεχνολογία, Οικονομία και πολλά άλλα από το ${SITE_NAME}.`;
  return {
    title: `${category.name} — Άρθρα & Αναλύσεις | ${SITE_NAME}`,
    description,
    alternates: { canonical: categoryCanonical(slug) },
    openGraph: {
      title: `${category.name} | ${SITE_NAME}`,
      description,
      url: categoryCanonical(slug),
      type: 'website',
      locale: 'el_GR',
      siteName: SITE_NAME,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: `${category.name} — ${SITE_NAME}` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE_TWITTER,
      creator: SITE_TWITTER,
      title: `${category.name} | ${SITE_NAME}`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // For display categories (e.g. "plus"), aggregate articles from all mapped internal slugs
  const articleSlugsToQuery = isDisplayCategory(slug) ? DISPLAY_CATEGORY_MAP[slug] : [slug];
  const displaySlugs = DISPLAY_CATEGORIES.map((c) => c.slug);

  const [category, rawCategories, rawArticles] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, color: true } }),
    prisma.category.findMany({
      where: { slug: { in: displaySlugs } },
      select: { name: true, slug: true, color: true },
    }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED', category: { slug: { in: articleSlugsToQuery } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: ARTICLE_PUBLIC_SELECT,
    }),
  ]);

  if (!category) notFound();

  // Sort nav categories by DISPLAY_CATEGORIES order
  const categories = DISPLAY_CATEGORIES
    .map((dc) => rawCategories.find((c) => c.slug === dc.slug))
    .filter((c): c is { name: string; slug: string; color: string } => c != null);

  const articles = rawArticles.map(mapPrismaArticle);
  const catDescription = `Τα τελευταία άρθρα για ${category.name} — ειδήσεις, αναλύσεις και πολλά άλλα από το ${SITE_NAME}.`;

  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Αρχική', url: SITE_URL },
    { name: category.name, url: categoryCanonical(slug) },
  ]);

  const collectionLd = categoryPageJsonLd({
    name: category.name,
    slug: category.slug,
    description: catDescription,
    articleCount: articles.length,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Category header */}
      <div
        className="rounded-2xl p-8 mb-8 border"
        style={{ backgroundColor: `${category.color}15`, borderColor: `${category.color}30` }}
      >
        <span
          className="inline-flex items-center font-bold rounded-full px-3 py-1 text-sm border mb-3"
          style={{ color: category.color, backgroundColor: `${category.color}20`, borderColor: `${category.color}50` }}
        >
          {category.name}
        </span>
        <h1 className="text-3xl font-black mt-1 mb-2" style={{ color: category.color }}>
          {category.name}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          {articles.length > 0
            ? `${articles.length} άρθρα στην κατηγορία`
            : 'Δεν υπάρχουν άρθρα ακόμα σε αυτή την κατηγορία'}
        </p>
      </div>

      {/* Category nav */}
      <div className="flex flex-wrap gap-2 mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
        {categories.map((cat) => (
          <a
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className="px-4 py-2 rounded-full text-sm font-semibold border transition-colors hover:opacity-80"
            style={
              cat.slug === slug
                ? { color: cat.color, backgroundColor: `${cat.color}20`, borderColor: `${cat.color}50` }
                : { color: '#64748b', backgroundColor: 'white', borderColor: '#e2e8f0' }
            }
          >
            {cat.name}
          </a>
        ))}
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
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
    </>
  );
}
