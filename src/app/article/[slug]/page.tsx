import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { prisma } from '@/lib/db';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import { addHeadingIds, extractHeadings } from '@/lib/toc';
import CategoryBadge from '@/components/ui/CategoryBadge';
import ShareButtons from '@/components/ui/ShareButtons';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOfContents from '@/components/ui/TableOfContents';
import AICommentaryBox from '@/components/ui/AICommentaryBox';
import ArticleCTA from '@/components/sections/ArticleCTA';
import ArticleCard from '@/components/articles/ArticleCard';
import TrendingSidebar from '@/components/ui/TrendingSidebar';
import { formatDate } from '@/lib/utils';

export async function generateStaticParams() {
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true },
  });
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const raw = await prisma.article.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      seoTitle: true,
      seoDescription: true,
      generatedImageUrl: true,
      createdAt: true,
      status: true,
      category: { select: { name: true } },
      author: { select: { name: true } },
    },
  });
  if (!raw || raw.status !== 'PUBLISHED') return { title: 'Άρθρο δεν βρέθηκε' };

  const title = raw.seoTitle || `${raw.title} | ΑΙΣΧΟΛΙΑΣΜΟΣ`;
  const description = raw.seoDescription || raw.excerpt || '';
  const canonicalUrl = `https://aisxoliasmos.com/article/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: raw.title,
      description,
      url: canonicalUrl,
      type: 'article',
      publishedTime: raw.createdAt.toISOString(),
      authors: [raw.author.name],
      ...(raw.generatedImageUrl
        ? { images: [{ url: raw.generatedImageUrl, width: 1200, height: 630, alt: raw.title }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: raw.title,
      description,
      ...(raw.generatedImageUrl ? { images: [raw.generatedImageUrl] } : {}),
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const raw = await prisma.article.findUnique({
    where: { slug },
    select: { ...ARTICLE_PUBLIC_SELECT, status: true },
  });

  if (!raw || raw.status !== 'PUBLISHED') notFound();

  const article = mapPrismaArticle(raw);
  const contentWithIds = addHeadingIds(article.content);
  const headings = extractHeadings(contentWithIds);

  // Related: same category, published, excluding self
  const relatedRaw = await prisma.article.findMany({
    where: { status: 'PUBLISHED', category: { slug: article.category.slug }, slug: { not: slug } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: ARTICLE_PUBLIC_SELECT,
  });
  const related = relatedRaw.map(mapPrismaArticle);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt,
    author: { '@type': 'Person', name: article.author.name },
    publisher: { '@type': 'Organization', name: 'ΑΙΣΧΟΛΙΑΣΜΟΣ', url: 'https://aisxoliasmos.com' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://aisxoliasmos.com/article/${slug}` },
    keywords: article.tags.join(', '),
    ...(article.imageUrl ? { image: article.imageUrl } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Breadcrumbs
            crumbs={[
              { label: article.category.name, href: `/category/${article.category.slug}` },
              { label: article.title },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <article className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <CategoryBadge category={article.category} />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-slate-50 leading-tight mb-4">
              {article.title}
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-6 border-l-4 border-red-500 pl-4">
              {article.excerpt}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                  {article.author.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{article.author.name}</p>
                  <p className="text-slate-400 text-xs">{formatDate(article.publishedAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 text-sm">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {article.readTime} λεπτά ανάγνωσης
                </span>
              </div>
            </div>

            {article.imageUrl && (
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-6 shadow-md">
                <Image
                  src={article.imageUrl}
                  alt={article.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 700px"
                />
              </div>
            )}

            <div className="article-content" dangerouslySetInnerHTML={{ __html: contentWithIds }} />

            {article.aiCommentary && (
              <AICommentaryBox commentary={article.aiCommentary} articleTitle={article.title} />
            )}

            {article.tags.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <span key={tag} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <ShareButtons title={article.title} slug={article.slug} />

            <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 flex gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-xl shrink-0">
                {article.author.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{article.author.name}</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-relaxed">Συντάκτης στο ΑΙΣΧΟΛΙΑΣΜΟΣ</p>
              </div>
            </div>

            <ArticleCTA />

            {related.length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-5">
                  <span className="w-1 h-5 bg-red-600 rounded-full inline-block" />
                  Σχετικά Άρθρα
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {related.map((rel) => (
                    <ArticleCard key={rel.id} article={rel} />
                  ))}
                </div>
              </div>
            )}
          </article>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {headings.length >= 2 && <TableOfContents headings={headings} />}
              <TrendingSidebar />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
