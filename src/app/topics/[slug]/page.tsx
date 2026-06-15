import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, TrendingUp, Star, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/db';
import { CLUSTERS, getClusterBySlug } from '@/services/evergreen-clusters';
import { SITE_URL } from '@/lib/seo';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';
import { formatRelativeDate } from '@/lib/utils';

export const revalidate = 3600;

export async function generateStaticParams() {
  return CLUSTERS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cluster = getClusterBySlug(slug);
  if (!cluster) return {};

  const title = `${cluster.name}: Πλήρης Οδηγός & Άρθρα`;
  const description = cluster.description;
  const url = `${SITE_URL}/topics/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: 'el_GR',
    },
  };
}

export default async function TopicHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cluster = getClusterBySlug(slug);
  if (!cluster) notFound();

  const clusterTag = `cluster:${cluster.name}`;

  const [articles, articleCount] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
        articleType: ArticleType.EVERGREEN,
        secondaryKeywords: { has: clusterTag },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
        readTime: true,
        qualityScore: true,
        aiSeoScore: true,
        category: { select: { name: true, color: true } },
        faqJson: true,
      },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.article.count({
      where: {
        status: ArticleStatus.PUBLISHED,
        articleType: ArticleType.EVERGREEN,
        secondaryKeywords: { has: clusterTag },
      },
    }),
  ]);

  const featuredArticles = articles.slice(0, 3);
  const restArticles = articles.slice(3);

  const relatedClusters = CLUSTERS.filter(
    (c) => c.slug !== slug && c.dbCategory === cluster.dbCategory,
  ).slice(0, 4);

  const faqItems: Array<{ question: string; answer: string }> = articles
    .flatMap((a) => {
      if (!a.faqJson || !Array.isArray(a.faqJson)) return [];
      return (a.faqJson as Array<{ question: string; answer: string }>).slice(0, 2);
    })
    .slice(0, 6);

  const avgQuality =
    articles.filter((a) => a.qualityScore).length > 0
      ? (
          articles.reduce((sum, a) => sum + (a.qualityScore ?? 0), 0) /
          articles.filter((a) => a.qualityScore).length
        ).toFixed(1)
      : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cluster.name} — Άρθρα & Οδηγοί`,
    description: cluster.description,
    url: `${SITE_URL}/topics/${slug}`,
    publisher: {
      '@type': 'Organization',
      name: 'ΑΙΣΧΟΛΙΑΣΜΟΣ',
      url: SITE_URL,
    },
    about: {
      '@type': 'Thing',
      name: cluster.pillarKeyword,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-white dark:bg-slate-950">
        {/* Hero */}
        <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 py-16">
          <div className="max-w-5xl mx-auto px-4">
            <nav className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">Αρχική</Link>
              <span className="mx-2">/</span>
              <Link href="/topics" className="hover:text-slate-700 dark:hover:text-slate-200">Θέματα</Link>
              <span className="mx-2">/</span>
              <span className="text-slate-800 dark:text-slate-200">{cluster.name}</span>
            </nav>

            <div className="flex items-start gap-6">
              <div className="flex-1">
                <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4 leading-tight">
                  {cluster.name}
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  {cluster.description}
                </p>
                <div className="flex items-center gap-6 mt-6 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <BookOpen size={14} />
                    {articleCount} άρθρα
                  </span>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp size={14} />
                    {cluster.topics.length} θέματα
                  </span>
                  {avgQuality && (
                    <span className="flex items-center gap-1.5">
                      <Star size={14} />
                      Μέση ποιότητα {avgQuality}/10
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 py-12">

          {/* Featured articles */}
          {featuredArticles.length > 0 && (
            <section className="mb-14">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                <Star size={18} className="text-amber-500" />
                Προτεινόμενα Άρθρα
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {featuredArticles.map((article) => (
                  <article
                    key={article.id}
                    className="group border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                  >
                    <Link href={`/article/${article.slug}`}>
                      <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2 line-clamp-2 leading-snug">
                        {article.title}
                      </h3>
                    </Link>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                      <span>{article.readTime} λεπτά ανάγνωση</span>
                      {article.qualityScore && (
                        <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          {article.qualityScore}/10
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* All articles */}
          {articles.length > 0 ? (
            <section className="mb-14">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                Όλα τα Άρθρα
                <span className="ml-2 text-sm font-normal text-slate-400">({articleCount})</span>
              </h2>
              {restArticles.length > 0 && (
                <div className="space-y-3">
                  {restArticles.map((article) => (
                    <article
                      key={article.id}
                      className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800 group"
                    >
                      <Link
                        href={`/article/${article.slug}`}
                        className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug flex-1"
                      >
                        {article.title}
                      </Link>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
                        {article.publishedAt && (
                          <span>{formatRelativeDate(article.publishedAt.toISOString())}</span>
                        )}
                        {article.qualityScore && (
                          <span className="hidden sm:inline bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {article.qualityScore}/10
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="mb-14">
              <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-slate-500 dark:text-slate-400 mb-2">Δεν υπάρχουν ακόμα δημοσιευμένα άρθρα σε αυτό το cluster.</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">Ελέγξτε ξανά σύντομα — δημοσιεύουμε νέο περιεχόμενο καθημερινά.</p>
              </div>
            </section>
          )}

          {/* Topics in this cluster */}
          <section className="mb-14">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              Θέματα που Καλύπτουμε
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {cluster.topics.map((topic) => (
                <div
                  key={topic.primaryKeyword}
                  className="flex items-center gap-2 py-2 px-3 text-sm text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800 rounded-lg"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {topic.topic}
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          {faqItems.length > 0 && (
            <section className="mb-14">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                Συχνές Ερωτήσεις για {cluster.name}
              </h2>
              <div className="space-y-4">
                {faqItems.map((faq, i) => (
                  <details
                    key={i}
                    className="group border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <summary className="flex items-center justify-between p-4 cursor-pointer font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors list-none">
                      {faq.question}
                      <ArrowRight size={14} className="shrink-0 group-open:rotate-90 transition-transform text-slate-400" />
                    </summary>
                    <div className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Related clusters */}
          {relatedClusters.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                Σχετικά Clusters
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                {relatedClusters.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/topics/${related.slug}`}
                    className="group border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {related.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">
                      {related.topics.length} θέματα
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
