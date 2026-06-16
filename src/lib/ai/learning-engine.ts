import { prisma } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopicPerformanceRecord {
  topic: string;
  category: string;
  avgReach: number;
  avgComments: number;
  avgShares: number;
  avgReactions: number;
  avgDiscussionScore: number;
  avgFacebookScore: number;
  articleCount: number;
  performanceScore: number;
}

export interface PredictionAccuracyRecord {
  postId: string;
  topic: string;
  predictedReach: number;
  actualReach: number;
  accuracy: number;
  learningWeight: number;
}

// ─── Prediction accuracy ──────────────────────────────────────────────────────

export function computePredictionAccuracy(
  predicted: number,
  actual: number,
  referenceMax: number,
): number {
  if (predicted <= 0) return 50;
  if (actual <= 0) return 50;

  // Normalize actual to same 0-100 scale as predicted
  const normalizedActual = referenceMax > 0 ? Math.min(100, (actual / referenceMax) * 100) : 50;
  const diff = Math.abs(predicted - normalizedActual);

  return Math.max(0, Math.min(100, Math.round(100 - diff)));
}

// Compute learning weight: more accurate = higher weight for future learning
export function computeLearningWeight(accuracy: number): number {
  if (accuracy >= 80) return 1.5;
  if (accuracy >= 60) return 1.0;
  if (accuracy >= 40) return 0.7;
  return 0.5;
}

// ─── Topic performance computation ───────────────────────────────────────────

export async function computeTopicPerformanceFromDB(): Promise<TopicPerformanceRecord[]> {
  // Get all articles with their tags AND social post performance
  const articles = await prisma.article.findMany({
    where: {
      socialPosts: {
        some: {
          platform: 'FACEBOOK',
          performance: { isNot: null },
        },
      },
    },
    select: {
      id: true,
      category: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      socialPosts: {
        where: { platform: 'FACEBOOK' },
        select: {
          performance: {
            select: {
              actualReach: true,
              actualComments: true,
              actualShares: true,
              actualReactions: true,
              predictedReach: true,
              predictedComments: true,
            },
          },
        },
      },
    },
  });

  // Also pull avg scores from DiscoveredArticle ContentScore (when available)
  // We match by title similarity — not perfect but good enough
  // For simplicity, we aggregate ContentScore data separately
  const scores = await prisma.contentScore.findMany({
    select: {
      facebookClickScore: true,
      overallScore: true,
      discoveredArticleId: true,
      discoveredArticle: {
        select: { title: true, category: { select: { name: true } } },
      },
    },
  });

  // Build a map: tag → performance aggregates
  const tagMap = new Map<
    string,
    {
      category: string;
      reaches: number[];
      comments: number[];
      shares: number[];
      reactions: number[];
    }
  >();

  for (const article of articles) {
    const perf = article.socialPosts[0]?.performance;
    if (!perf) continue;

    const categoryName = article.category.name;

    for (const at of article.tags) {
      const tag = at.tag.name;
      if (!tagMap.has(tag)) {
        tagMap.set(tag, {
          category: categoryName,
          reaches: [],
          comments: [],
          shares: [],
          reactions: [],
        });
      }
      const entry = tagMap.get(tag)!;
      entry.reaches.push(perf.actualReach);
      entry.comments.push(perf.actualComments);
      entry.shares.push(perf.actualShares);
      entry.reactions.push(perf.actualReactions);
    }
  }

  // Build a map: keyword → avg content scores (from DiscoveredArticle)
  const scoreMap = new Map<string, { discussion: number[]; facebook: number[] }>();
  for (const s of scores) {
    const words = s.discoveredArticle.title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length < 4) continue;
      if (!scoreMap.has(word)) scoreMap.set(word, { discussion: [], facebook: [] });
      const entry = scoreMap.get(word)!;
      entry.discussion.push(s.overallScore);
      entry.facebook.push(s.facebookClickScore);
    }
  }

  // Compute max reach for normalization
  const allReaches = [...tagMap.values()].flatMap((e) => e.reaches);
  const maxReach = allReaches.length > 0 ? Math.max(...allReaches) : 1;

  const results: TopicPerformanceRecord[] = [];

  for (const [topic, entry] of tagMap.entries()) {
    if (entry.reaches.length === 0) continue;

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;

    const avgReach = avg(entry.reaches);
    const avgComments = avg(entry.comments);
    const avgShares = avg(entry.shares);
    const avgReactions = avg(entry.reactions);

    // Match discussion/facebook scores from scorer data
    const topicWords = topic.toLowerCase().split(/\s+/);
    const discussionScores: number[] = [];
    const facebookScores: number[] = [];
    for (const word of topicWords) {
      const s = scoreMap.get(word);
      if (s) {
        discussionScores.push(...s.discussion);
        facebookScores.push(...s.facebook);
      }
    }
    const avgDiscussionScore = avg(discussionScores);
    const avgFacebookScore = avg(facebookScores);

    // Compute performance score (0-100)
    // Weighted: reactions*0.35 + comments*0.30 + shares*0.25 + reach*0.10 (all normalized)
    const maxComments = Math.max(...[...tagMap.values()].flatMap((e) => e.comments), 1);
    const maxShares = Math.max(...[...tagMap.values()].flatMap((e) => e.shares), 1);
    const maxReactions = Math.max(...[...tagMap.values()].flatMap((e) => e.reactions), 1);

    const normReach = Math.min(100, (avgReach / maxReach) * 100);
    const normComments = Math.min(100, (avgComments / maxComments) * 100);
    const normShares = Math.min(100, (avgShares / maxShares) * 100);
    const normReactions = Math.min(100, (avgReactions / maxReactions) * 100);

    const performanceScore = Math.round(
      normReactions * 0.35 + normComments * 0.30 + normShares * 0.25 + normReach * 0.10,
    );

    results.push({
      topic,
      category: entry.category,
      avgReach,
      avgComments,
      avgShares,
      avgReactions,
      avgDiscussionScore,
      avgFacebookScore,
      articleCount: entry.reaches.length,
      performanceScore,
    });
  }

  return results.sort((a, b) => b.performanceScore - a.performanceScore);
}

// ─── Score boost based on topic performance ───────────────────────────────────

export interface ScoreBoost {
  topicName: string;
  performanceScore: number;
  discussionBoost: number;
  facebookBoost: number;
}

export function computeScoreBoosts(
  articleTitle: string,
  articleExcerpt: string,
  topicPerformances: { topic: string; performanceScore: number; articleCount: number }[],
): ScoreBoost[] {
  const text = `${articleTitle} ${articleExcerpt}`.toLowerCase();
  const boosts: ScoreBoost[] = [];

  for (const tp of topicPerformances) {
    const topicLower = tp.topic.toLowerCase();
    if (!text.includes(topicLower)) continue;
    if (tp.articleCount < 2) continue; // need at least 2 data points

    const boost = tp.performanceScore >= 70
      ? { discussionBoost: 8, facebookBoost: 10 }
      : tp.performanceScore <= 30
      ? { discussionBoost: -8, facebookBoost: -10 }
      : { discussionBoost: 0, facebookBoost: 0 };

    if (boost.discussionBoost !== 0) {
      boosts.push({ topicName: tp.topic, performanceScore: tp.performanceScore, ...boost });
    }
  }

  return boosts;
}

// ─── Update prediction accuracies after FB sync ───────────────────────────────

export async function updatePredictionAccuracies(): Promise<number> {
  const performances = await prisma.postPerformance.findMany({
    where: {
      actualReach: { gt: 0 },
      predictedReach: { gt: 0 },
    },
    select: {
      id: true,
      predictedReach: true,
      predictedComments: true,
      actualReach: true,
      actualComments: true,
    },
  });

  if (performances.length === 0) return 0;

  const maxReach = Math.max(...performances.map((p) => p.actualReach));

  let updated = 0;
  for (const p of performances) {
    const accuracy = computePredictionAccuracy(p.predictedReach, p.actualReach, maxReach);
    const learningWeight = computeLearningWeight(accuracy);

    await prisma.postPerformance.update({
      where: { id: p.id },
      data: { predictionAccuracy: accuracy, learningWeight },
    });
    updated++;
  }

  return updated;
}
