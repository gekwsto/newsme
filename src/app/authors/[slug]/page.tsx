import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { SITE_URL, SITE_NAME, canonicalUrl } from '@/lib/seo';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import ArticleCard from '@/components/articles/ArticleCard';

export const revalidate = 3600;

export async function generateStaticParams() {
  const authors = await prisma.author.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  return authors.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await prisma.author.findUnique({ where: { slug } });
  if (!author || !author.isActive) return { title: 'Συντάκτης δεν βρέθηκε' };

  const url = canonicalUrl(`/authors/${slug}`);
  const title = `${author.name} | ${SITE_NAME}`;
  const description = author.bio ?? `Άρθρα από ${author.name} στο ${SITE_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'profile',
      siteName: SITE_NAME,
      locale: 'el_GR',
      ...(author.avatarUrl ? { images: [{ url: author.avatarUrl, width: 400, height: 400, alt: author.name }] } : {}),
    },
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const author = await prisma.author.findUnique({ where: { slug } });
  if (!author || !author.isActive) notFound();

  const rawArticles = await prisma.article.findMany({
    where: { status: 'PUBLISHED', displayAuthorId: author.id },
    select: ARTICLE_PUBLIC_SELECT,
    orderBy: { publishedAt: 'desc' },
    take: 48,
  });
  const articles = rawArticles.map(mapPrismaArticle);

  const authorUrl = canonicalUrl(`/authors/${slug}`);

  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': authorUrl,
    url: authorUrl,
    mainEntity: {
      '@type': 'Person',
      '@id': `${SITE_URL}/#author-${author.id}`,
      name: author.name,
      url: authorUrl,
      ...(author.bio ? { description: author.bio } : {}),
      ...(author.avatarUrl ? { image: author.avatarUrl } : {}),
      ...(author.title ? { jobTitle: author.title } : {}),
      worksFor: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Author header */}
        <div className="flex items-start gap-6 mb-10 pb-8 border-b border-slate-200 dark:border-slate-700">
          <div className="shrink-0">
            {author.avatarUrl ? (
              <Image
                src={author.avatarUrl}
                alt={author.name}
                width={96}
                height={96}
                className="rounded-full object-cover w-24 h-24"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-black text-3xl">
                {author.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">{author.name}</h1>
            {author.title && (
              <p className="text-red-600 font-semibold text-sm mt-0.5">{author.title}</p>
            )}
            {author.bio && (
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-prose">
                {author.bio}
              </p>
            )}
            <p className="text-slate-400 text-xs mt-2">{articles.length} δημοσιευμένα άρθρα</p>
          </div>
        </div>

        {/* Articles grid */}
        {articles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-center py-12">Δεν υπάρχουν δημοσιευμένα άρθρα ακόμα.</p>
        )}
      </div>
    </>
  );
}
