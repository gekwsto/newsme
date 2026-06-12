import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';
import { getEditorialConfig } from '@/lib/editorial-config';
import { DiscoveredStatus } from '@/generated/prisma/enums';
import FetchAllButton from './FetchAllButton';
import DiscoveryFilters from './DiscoveryFilters';
import DiscoveryActions from './DiscoveryActions';
import AutoFilterToggle from './AutoFilterToggle';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ category?: string; status?: string; sort?: string }>;
}

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  DRAFT_CREATED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  IGNORED: 'bg-gray-100 dark:bg-gray-800 text-gray-400',
};
const statusLabels: Record<string, string> = {
  NEW: 'Νέο',
  DRAFT_CREATED: 'Draft',
  IGNORED: 'Αγνοήθηκε',
};

type SortKey = 'overall' | 'viral' | 'discussion' | 'business' | 'search' | 'controversy' | 'facebook' | 'date';
const VALID_SORTS: SortKey[] = ['overall', 'viral', 'discussion', 'business', 'search', 'controversy', 'facebook', 'date'];

type ArticleWithScore = Awaited<ReturnType<typeof fetchArticles>>[0];

async function fetchArticles(filters: { categoryId?: string; status?: string }) {
  return prisma.discoveredArticle.findMany({
    where: {
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status ? { status: filters.status as 'NEW' | 'DRAFT_CREATED' | 'IGNORED' } : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      source: { select: { name: true, language: true, country: true, reliabilityScore: true } },
      category: { select: { name: true, color: true } },
      score: true,
      cluster: { select: { id: true, topic: true, articleCount: true, sourceCount: true, trendScore: true } },
    },
  });
}

function sortArticles(articles: ArticleWithScore[], sort: SortKey): ArticleWithScore[] {
  if (sort === 'date') return articles;
  const getScore = (a: ArticleWithScore): number => {
    if (!a.score) return -1;
    switch (sort) {
      case 'overall':     return a.score.overallScore;
      case 'viral':       return a.score.viralScore;
      case 'discussion':  return a.score.discussionScore;
      case 'business':    return a.score.businessValueScore;
      case 'search':      return a.score.searchPotentialScore;
      case 'controversy': return a.score.controversyScore;
      case 'facebook':    return a.score.facebookDiscussionScore;
      default:            return a.score.overallScore;
    }
  };
  return [...articles].sort((a, b) => getScore(b) - getScore(a));
}

function ScoreBadge({ icon, label, score }: { icon: string; label: string; score: number }) {
  const colorClass =
    score >= 70 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : score >= 40 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
  return (
    <span title={label} className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${colorClass}`}>
      {icon} {score}
    </span>
  );
}

function OverallBadge({ score }: { score: number }) {
  const colorClass =
    score >= 70 ? 'bg-green-600 dark:bg-green-500'
    : score >= 40 ? 'bg-orange-500 dark:bg-orange-400'
    : 'bg-red-500 dark:bg-red-400';
  return (
    <span title="Overall Score" className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${colorClass}`}>
      ⭐ {score}
    </span>
  );
}

export default async function NewsDiscoveryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { category: categoryFilter, status: statusFilter, sort: sortParam } = await searchParams;

  const validSort: SortKey = VALID_SORTS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : 'facebook';

  const window72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const [rawArticles, categories, counts, unscoredCount, preFilteredCount, editorialConfig, trends, viralArticles] =
    await Promise.all([
      fetchArticles({ categoryId: categoryFilter, status: statusFilter }),
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.discoveredArticle.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.discoveredArticle.count({ where: { score: null, status: DiscoveredStatus.NEW } }),
      prisma.discoveredArticle.count({ where: { filteredReason: { not: null }, createdAt: { gte: new Date(Date.now() - 24 * 3600000) } } }),
      Promise.resolve(getEditorialConfig()),
      prisma.trendCluster.findMany({
        where: {
          lastSeenAt: { gte: window72h },
          articleCount: { gte: 2 },
          sourceCount: { gte: 2 },
        },
        orderBy: { trendScore: 'desc' },
        take: 6,
      }),
      prisma.discoveredArticle.findMany({
        where: {
          status: DiscoveredStatus.NEW,
          OR: [
            { score: { facebookDiscussionScore: { gte: 88 } } },
            { score: { discussionScore: { gte: 88 } } },
            { score: { controversyScore: { gte: 88 } } },
          ],
        },
        include: {
          score: true,
          category: { select: { name: true, color: true } },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

  const articles = sortArticles(rawArticles, validSort);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  // Sort viral opportunities by best Facebook score
  const viralOpps = viralArticles.sort(
    (a, b) => (b.score?.facebookDiscussionScore ?? 0) - (a.score?.facebookDiscussionScore ?? 0)
  );

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Viral Alerts ──────────────────────────────────────── */}
        {viralOpps.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-4">
            <h2 className="text-sm font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
              🚨 VIRAL OPPORTUNITIES
              <span className="font-normal text-red-500 dark:text-red-500 text-xs">— δημοσίευσε τώρα</span>
            </h2>
            <div className="space-y-2">
              {viralOpps.map((a) => {
                const topScore = Math.max(
                  a.score?.facebookDiscussionScore ?? 0,
                  a.score?.discussionScore ?? 0,
                  a.score?.controversyScore ?? 0
                );
                const reason =
                  (a.score?.facebookDiscussionScore ?? 0) >= 88 ? `📘 Facebook Discussion ${a.score!.facebookDiscussionScore}` :
                  (a.score?.discussionScore ?? 0) >= 88 ? `💬 Discussion ${a.score!.discussionScore}` :
                  `⚡ Controversy ${a.score!.controversyScore}`;
                return (
                  <div key={a.id} className="flex items-start gap-3">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white mt-0.5 shrink-0"
                      style={{ backgroundColor: a.category.color }}
                    >
                      {topScore}
                    </span>
                    <div className="min-w-0">
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-red-800 dark:text-red-300 hover:underline line-clamp-1">
                        {a.title}
                      </a>
                      <p className="text-[11px] text-red-600 dark:text-red-500">{reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Trending Topics ────────────────────────────────────── */}
        {trends.length > 0 && (
          <div className="mb-6 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/10 p-4">
            <h2 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-3 flex items-center gap-2">
              🔥 TRENDING NOW
              <span className="font-normal text-orange-500 dark:text-orange-500 text-xs">— πολλαπλές πηγές, ίδιο θέμα</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {trends.map((t) => {
                const scoreColor =
                  t.trendScore >= 70 ? 'bg-orange-500' : t.trendScore >= 40 ? 'bg-yellow-500' : 'bg-gray-400';
                return (
                  <div key={t.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-orange-200 dark:border-orange-900/40 px-3 py-2">
                    <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${scoreColor}`}>
                      {t.trendScore}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">{t.topic}</p>
                      <p className="text-[10px] text-gray-400">
                        {t.sourceCount} πηγές · {t.articleCount} άρθρα
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Page header ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">News Discovery</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Άρθρα από RSS feeds — AI βαθμολογεί αυτόματα, εσύ αποφασίζεις τι γίνεται draft.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['NEW', 'DRAFT_CREATED', 'IGNORED'] as const).map((s) => (
                <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[s]}`}>
                  {statusLabels[s]}: {countMap[s] ?? 0}
                </span>
              ))}
              {unscoredCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  Αβαθμολόγητα: {unscoredCount} — πάτα Ανανέωση
                </span>
              )}
              {preFilteredCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  ✂ Pre-filtered σήμερα: {preFilteredCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <AutoFilterToggle initialEnabled={editorialConfig.autoFilterEnabled} />
            <Link href="/admin/analytics" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Analytics
            </Link>
            <Link href="/admin/sources" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Sources
            </Link>
            <FetchAllButton />
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────────────── */}
        <div className="mb-4">
          <DiscoveryFilters
            categories={categories}
            currentCategory={categoryFilter ?? ''}
            currentStatus={statusFilter ?? ''}
            currentSort={validSort}
          />
        </div>

        {/* ── Articles list ────────────────────────────────────────── */}
        {articles.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">Δεν βρέθηκαν άρθρα</p>
            <p className="text-sm mt-1">
              {statusFilter || categoryFilter ? 'Δοκίμασε διαφορετικά φίλτρα ή' : 'Πάτα'}{' '}
              <span className="font-medium text-indigo-500">Ανανέωση Όλων</span> για να φέρεις νέα άρθρα.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className={`rounded-xl border bg-white dark:bg-gray-900 p-4 transition-colors ${
                  article.status === 'IGNORED'
                    ? 'border-gray-100 dark:border-gray-800 opacity-60'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Meta badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: article.category.color }}
                      >
                        {article.category.name}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {article.source.name}
                      </span>
                      {(article.source.language === 'EL' || article.source.country === 'GR') ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          🇬🇷 EL
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                          🌍 EN
                        </span>
                      )}
                      {article.source.reliabilityScore >= 85 && (
                        <span title={`Reliability: ${article.source.reliabilityScore}`} className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          ✓{article.source.reliabilityScore}
                        </span>
                      )}
                      {/* Cluster / trending badge */}
                      {article.cluster && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 flex items-center gap-1">
                          🔥 {article.cluster.topic}
                          <span className="text-orange-400 dark:text-orange-600">· {article.cluster.sourceCount} πηγές</span>
                        </span>
                      )}
                      {article.clusterPrimary && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                          PRIMARY
                        </span>
                      )}
                      {article.publishedAt && (
                        <span className="text-[10px] text-gray-400">
                          {formatRelativeDate(article.publishedAt.toISOString())}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sm text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 leading-snug line-clamp-2"
                    >
                      {article.title}
                    </a>

                    {/* Excerpt */}
                    {article.excerpt && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                        {article.excerpt}
                      </p>
                    )}

                    {/* Local pre-filter score */}
                    {article.localScore !== null && article.localScore !== undefined && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          title="Local pre-filter score (cheap, before OpenAI)"
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            article.localScore >= 60
                              ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                              : article.localScore >= 40
                              ? 'border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400'
                              : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
                          }`}
                        >
                          🏷 local {article.localScore}
                        </span>
                        {article.filteredReason && (
                          <span className="text-[10px] text-red-500 dark:text-red-400 italic">
                            ✂ {article.filteredReason}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Score badges */}
                    {article.score ? (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <OverallBadge score={article.score.overallScore} />
                          <ScoreBadge icon="🔥" label="Viral Score" score={article.score.viralScore} />
                          <ScoreBadge icon="💬" label="Discussion Score" score={article.score.discussionScore} />
                          <ScoreBadge icon="⚡" label="Controversy" score={article.score.controversyScore} />
                          <ScoreBadge icon="📘" label="Facebook Discussion" score={article.score.facebookDiscussionScore} />
                          <ScoreBadge icon="💼" label="Business Value" score={article.score.businessValueScore} />
                          <ScoreBadge icon="🔍" label="Search Potential" score={article.score.searchPotentialScore} />
                        </div>

                        {/* Editorial insights */}
                        {(article.score.whyThisMatters || article.score.bestFacebookAngle) && (
                          <div className="mt-2 space-y-1">
                            {article.score.whyThisMatters && (
                              <div>
                                <span className="text-[9px] font-bold tracking-wider uppercase text-gray-400 dark:text-gray-500">
                                  WHY THIS MATTERS
                                </span>
                                <p className="text-xs text-gray-600 dark:text-gray-300 italic leading-snug">
                                  {article.score.whyThisMatters}
                                </p>
                              </div>
                            )}
                            {article.score.bestFacebookAngle && (
                              <div>
                                <span className="text-[9px] font-bold tracking-wider uppercase text-indigo-400 dark:text-indigo-500">
                                  BEST FACEBOOK ANGLE
                                </span>
                                <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium leading-snug">
                                  {article.score.bestFacebookAngle}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {article.score.reasoning && (
                          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 italic line-clamp-1">
                            {article.score.reasoning}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-[10px] text-gray-400 italic">αβαθμολόγητο — ανανέωσε για scoring</p>
                    )}
                  </div>

                  <div className="flex-shrink-0 sm:self-center">
                    <DiscoveryActions articleId={article.id} status={article.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
