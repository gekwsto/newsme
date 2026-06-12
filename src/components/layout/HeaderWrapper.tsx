import { prisma } from '@/lib/db';
import { ArticleStatus } from '@/generated/prisma/enums';
import Header from './Header';

export default async function HeaderWrapper() {
  const [categories, recentArticles] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, slug: true },
    }),
    prisma.article.findMany({
      where: { status: ArticleStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      take: 8,
      select: { title: true },
    }),
  ]);

  const newsItems = recentArticles.map((a) => a.title);
  return <Header categories={categories} newsItems={newsItems} />;
}
