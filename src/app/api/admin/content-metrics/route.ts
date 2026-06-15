import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CLUSTERS } from '@/services/evergreen-clusters';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [totalEvergreen, totalPublished, aggregates, lowQuality, topQuality] = await Promise.all([
    prisma.article.count({
      where: { articleType: ArticleType.EVERGREEN },
    }),
    prisma.article.count({
      where: { articleType: ArticleType.EVERGREEN, status: ArticleStatus.PUBLISHED },
    }),
    prisma.article.aggregate({
      where: {
        articleType: ArticleType.EVERGREEN,
        qualityScore: { not: null },
      },
      _avg: {
        qualityScore: true,
        aiSeoScore: true,
        readabilityScore: true,
      },
      _count: { qualityScore: true },
    }),
    prisma.article.findMany({
      where: {
        articleType: ArticleType.EVERGREEN,
        qualityScore: { not: null, lt: 7 },
      },
      select: { id: true, title: true, slug: true, qualityScore: true, aiSeoScore: true, readabilityScore: true, status: true },
      orderBy: { qualityScore: 'asc' },
      take: 10,
    }),
    prisma.article.findMany({
      where: {
        articleType: ArticleType.EVERGREEN,
        qualityScore: { not: null },
      },
      select: { id: true, title: true, slug: true, qualityScore: true, aiSeoScore: true, readabilityScore: true },
      orderBy: { qualityScore: 'desc' },
      take: 10,
    }),
  ]);

  const articlesPerCluster = await Promise.all(
    CLUSTERS.map(async (cluster) => {
      const tag = `cluster:${cluster.name}`;
      const [count, agg] = await Promise.all([
        prisma.article.count({
          where: {
            articleType: ArticleType.EVERGREEN,
            secondaryKeywords: { has: tag },
          },
        }),
        prisma.article.aggregate({
          where: {
            articleType: ArticleType.EVERGREEN,
            secondaryKeywords: { has: tag },
            qualityScore: { not: null },
          },
          _avg: { qualityScore: true },
        }),
      ]);
      return {
        cluster: cluster.name,
        slug: cluster.slug,
        dbCategory: cluster.dbCategory,
        articleCount: count,
        topicCount: cluster.topics.length,
        avgQualityScore: agg._avg.qualityScore ? parseFloat(agg._avg.qualityScore.toFixed(1)) : null,
      };
    }),
  );

  const topPerformingClusters = [...articlesPerCluster]
    .filter((c) => c.avgQualityScore !== null)
    .sort((a, b) => (b.avgQualityScore ?? 0) - (a.avgQualityScore ?? 0))
    .slice(0, 5);

  return Response.json({
    overview: {
      totalEvergreen,
      totalPublished,
      totalDraft: totalEvergreen - totalPublished,
      scoredArticles: aggregates._count.qualityScore,
    },
    averageScores: {
      qualityScore: aggregates._avg.qualityScore
        ? parseFloat(aggregates._avg.qualityScore.toFixed(2))
        : null,
      seoScore: aggregates._avg.aiSeoScore
        ? parseFloat(aggregates._avg.aiSeoScore.toFixed(2))
        : null,
      readabilityScore: aggregates._avg.readabilityScore
        ? parseFloat(aggregates._avg.readabilityScore.toFixed(2))
        : null,
    },
    articlesPerCluster,
    topPerformingClusters,
    topQualityArticles: topQuality,
    lowQualityArticles: lowQuality,
  });
}
