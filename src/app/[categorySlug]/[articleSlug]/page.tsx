import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { mapPrismaArticle, ARTICLE_PUBLIC_SELECT, resolveArticleImageUrl } from '@/lib/article-mapper';
import { addHeadingIds, extractHeadings } from '@/lib/toc';
import { SITE_URL, articleCanonical, newsArticleJsonLd, breadcrumbJsonLd, faqPageJsonLd, stripHtmlToText, DEFAULT_OG_IMAGE, SITE_NAME, SITE_TWITTER } from '@/lib/seo';
import { BRAND } from '@/config/brand';
import { getDisplayCategory } from '@/config/categories';
import CategoryBadge from '@/components/ui/CategoryBadge';
import ShareButtons from '@/components/ui/ShareButtons';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOfContents from '@/components/ui/TableOfContents';
import ArticleCTA from '@/components/sections/ArticleCTA';
import ArticleCard from '@/components/articles/ArticleCard';
import TrendingSidebar from '@/components/ui/TrendingSidebar';
import { formatDateWithTime } from '@/lib/utils';
import ViewTracker from '@/components/ui/ViewTracker';

export async function generateStaticParams() {
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, category: { select: { slug: true } } },
  });
  return articles.map((a) => ({
    categorySlug: a.category.slug,
    articleSlug: a.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}): Promise<Metadata> {
  const { articleSlug } = await params;
  const raw = await prisma.article.findUnique({
    where: { slug: articleSlug },
    select: {
      title: true,
      excerpt: true,
      seoTitle: true,
      seoDescription: true,
      generatedImageUrl: true,
      coverImage: true,
      publishedAt: true,
      updatedAt: true,
      status: true,
      articleType: true,
      tags: { include: { tag: { select: { name: true } } } },
      category: { select: { name: true, slug: true } },
      author: { select: { name: true } },
    },
  });
  if (!raw || raw.status !== 'PUBLISHED') return { title: 'Άρθρο δεν βρέθηκε' };

  const canonical = articleCanonical(raw.category.slug, articleSlug);
  const title = raw.seoTitle || `${raw.title} | ${SITE_NAME}`;
  const description = raw.seoDescription || raw.excerpt || '';
  const tags = raw.tags.map((t) => t.tag.name);
  const publishedTime = (raw.publishedAt ?? raw.updatedAt).toISOString();
  const ogImage = resolveArticleImageUrl(raw.generatedImageUrl, raw.coverImage) ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    keywords: tags.join(', '),
    alternates: { canonical },
    authors: [{ name: raw.author.name }],
    category: raw.category.name,
    openGraph: {
      title: raw.title,
      description,
      url: canonical,
      type: 'article',
      siteName: SITE_NAME,
      locale: 'el_GR',
      publishedTime,
      modifiedTime: raw.updatedAt.toISOString(),
      authors: [raw.author.name],
      section: raw.category.name,
      tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: raw.title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE_TWITTER,
      creator: SITE_TWITTER,
      title: raw.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}) {
  const { categorySlug, articleSlug } = await params;

  const raw = await prisma.article.findUnique({
    where: { slug: articleSlug },
    select: { ...ARTICLE_PUBLIC_SELECT, status: true, updatedAt: true, articleType: true, faqJson: true },
  });

  if (!raw || raw.status !== 'PUBLISHED') notFound();

  // Self-healing: wrong category in URL → redirect to canonical
  if (raw.category.slug !== categorySlug) {
    permanentRedirect(`/${raw.category.slug}/${articleSlug}`);
  }

  const article = mapPrismaArticle(raw);
  const contentWithIds = addHeadingIds(article.content);
  const headings = extractHeadings(contentWithIds);

  const [relatedRaw, trendingRaw] = await Promise.all([
    prisma.article.findMany({
      where: { status: 'PUBLISHED', category: { slug: article.category.slug }, slug: { not: articleSlug } },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: ARTICLE_PUBLIC_SELECT,
    }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED', slug: { not: articleSlug }, NOT: { category: { slug: article.category.slug } } },
      orderBy: { views: 'desc' },
      take: 3,
      select: ARTICLE_PUBLIC_SELECT,
    }),
  ]);
  const related = relatedRaw.map(mapPrismaArticle);
  const trending = trendingRaw.map(mapPrismaArticle);

  const displayCat = getDisplayCategory(article.category.slug) ?? article.category;
  const articleBody = stripHtmlToText(article.content, 20_000) || article.excerpt;
  const canonical = articleCanonical(categorySlug, articleSlug);

  const articleJsonLd = newsArticleJsonLd({
    title: article.title,
    excerpt: article.excerpt,
    slug: article.slug,
    categorySlug,
    publishedAt: article.publishedAt,
    updatedAt: raw.updatedAt.toISOString(),
    author: article.author.name,
    authorUrl: article.author.slug ? `${SITE_URL}/authors/${article.author.slug}` : undefined,
    category: displayCat.name,
    tags: article.tags,
    imageUrl: article.imageUrl ?? undefined,
    articleType: raw.articleType ?? 'NEWS',
    articleBody,
  });

  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Αρχική', url: SITE_URL },
    { name: displayCat.name, url: `${SITE_URL}/category/${displayCat.slug}` },
    { name: article.title, url: canonical },
  ]);

  const faqItems =
    Array.isArray(raw.faqJson)
      ? (raw.faqJson as { question: string; answer: string }[]).filter(
          (f) => f && typeof f.question === 'string' && typeof f.answer === 'string',
        )
      : [];
  const faqLd = faqItems.length ? faqPageJsonLd(faqItems) : null;

  return (
    <>
      <ViewTracker slug={articleSlug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Breadcrumbs
            crumbs={[
              { label: displayCat.name, href: `/category/${displayCat.slug}` },
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

            <div className="flex flex-wrap items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                  {article.author.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  {article.author.slug ? (
                    <Link href={`/authors/${article.author.slug}`} className="font-semibold text-slate-900 dark:text-slate-100 text-sm hover:text-red-600 transition-colors">
                      {article.author.name}
                    </Link>
                  ) : (
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{article.author.name}</p>
                  )}
                  <p className="text-slate-400 text-xs">{formatDateWithTime(article.publishedAt)}</p>
                </div>
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

            <ShareButtons title={article.title} slug={article.slug} categorySlug={categorySlug} />

            <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 flex gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-xl shrink-0">
                {article.author.name.charAt(0).toUpperCase()}
              </div>
              <div>
                {article.author.slug ? (
                  <Link href={`/authors/${article.author.slug}`} className="font-bold text-slate-900 dark:text-slate-100 hover:text-red-600 transition-colors">
                    {article.author.name}
                  </Link>
                ) : (
                  <p className="font-bold text-slate-900 dark:text-slate-100">{article.author.name}</p>
                )}
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-relaxed">{`Συντάκτης στο ${BRAND.name}`}</p>
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

            {trending.length > 0 && (
              <div className="mt-10">
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-5">
                  <span className="w-1 h-5 bg-amber-500 rounded-full inline-block" />
                  Δημοφιλή από άλλες κατηγορίες
                </h2>
                <div className="space-y-3">
                  {trending.map((t) => (
                    <ArticleCard key={t.id} article={t} variant="horizontal" />
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
