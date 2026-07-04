import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { SITE_URL, SITE_NAME, canonicalUrl } from '@/lib/seo';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT } from '@/lib/article-mapper';
import ArticleCard from '@/components/articles/ArticleCard';

const SOCIAL_ICONS: Record<string, { label: string; svg: string }> = {
  twitterUrl: {
    label: 'X (Twitter)',
    svg: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>',
  },
  facebookUrl: {
    label: 'Facebook',
    svg: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>',
  },
  instagramUrl: {
    label: 'Instagram',
    svg: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>',
  },
  linkedinUrl: {
    label: 'LinkedIn',
    svg: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
  },
  youtubeUrl: {
    label: 'YouTube',
    svg: '<path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>',
  },
  tiktokUrl: {
    label: 'TikTok',
    svg: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  },
};

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

            {/* Social links */}
            {(() => {
              const socials = Object.entries(SOCIAL_ICONS)
                .map(([key, meta]) => ({ url: author[key as keyof typeof author] as string | null, ...meta }))
                .filter((s) => s.url);
              if (!socials.length) return null;
              return (
                <div className="flex items-center gap-3 mt-3">
                  {socials.map(({ url, label, svg }) => (
                    <Link
                      key={label}
                      href={url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                        <g dangerouslySetInnerHTML={{ __html: svg }} />
                      </svg>
                    </Link>
                  ))}
                </div>
              );
            })()}
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
