import { prisma } from '@/lib/db';
import { ArticleStatus } from '@/generated/prisma/enums';
import { DISPLAY_CATEGORIES } from '@/config/categories';
import Header from './Header';

export default async function HeaderWrapper() {
  const displaySlugs = DISPLAY_CATEGORIES.map((c) => c.slug);

  const [rawCategories, recentArticles] = await Promise.all([
    prisma.category.findMany({
      where: { slug: { in: displaySlugs } },
      select: { name: true, slug: true },
    }),
    prisma.article.findMany({
      where: { status: ArticleStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      take: 8,
      select: { title: true },
    }),
  ]);

  // Sort categories by the canonical DISPLAY_CATEGORIES order
  const categories = DISPLAY_CATEGORIES
    .map((dc) => rawCategories.find((c) => c.slug === dc.slug))
    .filter((c): c is { name: string; slug: string } => c != null);

  const newsItems = recentArticles.map((a) => a.title);
  return <Header categories={categories} newsItems={newsItems} />;
}
