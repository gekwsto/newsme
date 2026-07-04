import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SITE_NAME, canonicalUrl } from '@/lib/seo';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import ArticleCard from '@/components/articles/ArticleCard';

export const revalidate = 3600;

export async function generateStaticParams() {
  const tags = await prisma.tag.findMany({ select: { name: true } });
  return tags.map((t) => ({ name: encodeURIComponent(t.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  const tagName = decodeURIComponent(name);
  const tag = await prisma.tag.findUnique({ where: { name: tagName } });
  if (!tag) return { title: 'Tag δεν βρέθηκε' };

  const url = canonicalUrl(`/tags/${encodeURIComponent(tagName)}`);
  const title = `#${tagName} | ${SITE_NAME}`;

  return {
    title,
    description: `Όλα τα άρθρα με tag #${tagName} στο ${SITE_NAME}.`,
    alternates: { canonical: url },
    openGraph: {
      title,
      url,
      siteName: SITE_NAME,
      locale: 'el_GR',
    },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const tagName = decodeURIComponent(name);

  const tag = await prisma.tag.findUnique({
    where: { name: tagName },
    include: {
      articles: {
        where: { article: { status: 'PUBLISHED' } },
        select: { article: { select: ARTICLE_PUBLIC_SELECT } },
        orderBy: { article: { publishedAt: 'desc' } },
        take: 48,
      },
    },
  });

  if (!tag) notFound();

  const articles = tag.articles.map((a) => mapPrismaArticle(a.article));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
        <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full mb-3">
          <span className="text-slate-400 font-bold">#</span>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">{tagName}</h1>
        </div>
        <p className="text-slate-400 text-sm">{articles.length} δημοσιευμένα άρθρα</p>
      </div>

      {/* Articles */}
      {articles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <p className="text-slate-400 text-center py-16">Δεν βρέθηκαν άρθρα για αυτό το tag.</p>
      )}
    </div>
  );
}
