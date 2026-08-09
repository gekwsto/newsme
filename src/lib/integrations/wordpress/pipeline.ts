import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { runNewsPipeline } from '@/services/news-auto-pipeline';
import { ArticleStatus, SourceType, WordpressDeliveryStatus } from '@/generated/prisma/enums';
import { normalizeArticleForWordPress } from '@/lib/integrations/wordpress/normalize-article';
import { LOCK_CONTENTION_REASON } from '@/lib/pipeline/pipeline-lock';
import type {
  NormalizedArticle,
  WordPressPipelineStats,
  WordPressRunStatus,
} from '@/types/integrations/wordpress';

/** Turns runNewsPipeline()'s free-text `reason` into a stable, machine-readable status the WordPress admin can key off of instead of parsing prose. */
function classifyRunStatus(reason: string | undefined): WordPressRunStatus {
  if (!reason) return 'ok';
  if (reason === LOCK_CONTENTION_REASON) return 'already_running';
  return 'skipped';
}

// If a delivery is marked SENT but never acknowledged within this window, the
// article becomes eligible for redelivery. This guards against the case where
// NewsMe marked an article delivered but the destination never actually
// received/imported it (e.g. network drop). WordPress's own external-ID
// dedup (postmeta lookup) makes any resulting redelivery idempotent, so this
// is a safety net, not the primary dedup mechanism.
const REDELIVERY_WINDOW_MS = 6 * 60 * 60 * 1000;

const ELIGIBLE_ARTICLE_STATUSES = [ArticleStatus.DRAFT, ArticleStatus.APPROVED, ArticleStatus.PUBLISHED];
const ELIGIBLE_SOURCE_TYPES = [SourceType.RSS_SUMMARY, SourceType.AI_GENERATED, SourceType.AI_ASSISTED];

export interface RunWordPressPipelineOptions {
  site: string;
  limit: number;
  categories?: string[];
  /** MODE A vs MODE B. See runWordPressPipeline() doc comment. */
  triggerRun?: boolean;
}

export interface WordPressPipelineResult {
  /**
   * The real NewsMe PipelineRun.id when triggerRun produced one — genuinely
   * ties the response to "the run that just happened", not a made-up
   * correlation id. Falls back to a synthetic id for a pure fetch-pending
   * call (MODE B), where no new PipelineRun was created.
   */
  runId: string;
  articles: NormalizedArticle[];
  stats: WordPressPipelineStats;
  /** 'ok' unless triggerRun was requested but didn't actually run — see WordPressRunStatus. */
  status: WordPressRunStatus;
  /** Human-readable detail when status !== 'ok' (lock contention, disabled, outside hours, etc). */
  reason?: string;
}

const ARTICLE_SELECT_FOR_WORDPRESS = {
  id: true,
  title: true,
  slug: true,
  content: true,
  excerpt: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  coverImage: true,
  generatedImageUrl: true,
  imageAttribution: true,
  category: { select: { slug: true, name: true } },
  tags: { select: { tag: { select: { name: true } } } },
} as const;

type ArticleRow = Awaited<ReturnType<typeof prisma.article.findMany<{ select: typeof ARTICLE_SELECT_FOR_WORDPRESS }>>>[number];

function buildBaseWhere(categories?: string[]) {
  return {
    status: { in: ELIGIBLE_ARTICLE_STATUSES },
    sourceType: { in: ELIGIBLE_SOURCE_TYPES },
    ...(categories?.length ? { category: { slug: { in: categories } } } : {}),
  };
}

function buildNotDeliveredFilter(site: string, redeliveryCutoff: Date) {
  return {
    wordpressDeliveries: {
      none: {
        site,
        OR: [
          { status: WordpressDeliveryStatus.PUBLISHED },
          { status: WordpressDeliveryStatus.SENT, createdAt: { gt: redeliveryCutoff } },
        ],
      },
    },
  };
}

/**
 * Claims an article for a site (idempotent upsert keyed on [site, articleId])
 * and normalizes it. Returns null (and logs) if the claim itself fails —
 * callers must not let one bad claim break the rest of the batch.
 */
async function claimAndNormalize(site: string, article: ArticleRow): Promise<NormalizedArticle | null> {
  try {
    await prisma.wordpressDelivery.upsert({
      where: { site_articleId: { site, articleId: article.id } },
      create: { site, articleId: article.id, status: WordpressDeliveryStatus.SENT },
      update: { status: WordpressDeliveryStatus.SENT, wordpressPostId: null, wordpressUrl: null, ackAt: null, ackError: null },
    });
    return normalizeArticleForWordPress(article);
  } catch (err) {
    console.error('[wordpress-integration] failed to claim/normalize article', {
      articleId: article.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * MODE A (triggerRun: true) — synchronously runs the real NewsMe pipeline
 * (the exact same runNewsPipeline() the Vercel cron scheduler uses; RSS
 * discovery, extraction, filtering, AI rewriting, categorization and image
 * selection are all untouched/reused, never duplicated here), then returns
 * the Articles *that run itself produced* (via PipelineRunItem.runId ->
 * generatedArticleId), up to `limit`. This is "trigger processing and give
 * me the results", tied to a real PipelineRun.id.
 *
 * MODE B (triggerRun: false, the default) — no new processing is triggered.
 * Selects up to `limit` already-processed Articles that haven't been
 * delivered to this `site` yet. This is "check for already-processed
 * pending content" — cheap enough to poll frequently without spending AI
 * budget or risking a long-running HTTP call on every poll.
 *
 * If MODE A's own run produces fewer than `limit` articles (e.g. only 2 new
 * articles passed filtering), the remaining slots are filled from the MODE B
 * pending pool as an explicit, documented fallback — never silently returning
 * unrelated older articles as if they came from "this run" when they didn't.
 */
export async function runWordPressPipeline(options: RunWordPressPipelineOptions): Promise<WordPressPipelineResult> {
  const { site, limit, categories, triggerRun = false } = options;

  let discovered = 0;
  let processed = 0;
  let rejected = 0;
  let pipelineRunId: string | undefined;
  let triggerReason: string | undefined;

  if (triggerRun) {
    const result = await runNewsPipeline(true, site);
    processed = result.generated;
    rejected = result.rejected;
    discovered = result.rssItems;
    pipelineRunId = result.pipelineRunId;
    triggerReason = result.reason;
  }

  const redeliveryCutoff = new Date(Date.now() - REDELIVERY_WINDOW_MS);
  const baseWhere = buildBaseWhere(categories);
  const notDelivered = buildNotDeliveredFilter(site, redeliveryCutoff);

  const articles: NormalizedArticle[] = [];
  const excludeIds: string[] = [];

  // ── Step 1 (MODE A only): articles generated by THIS specific run ────────
  if (pipelineRunId) {
    const runItems = await prisma.pipelineRunItem.findMany({
      where: { runId: pipelineRunId, generatedArticleId: { not: null } },
      select: { generatedArticleId: true },
      orderBy: { createdAt: 'asc' },
    });
    const runArticleIds = runItems
      .map((i) => i.generatedArticleId)
      .filter((id): id is string => id !== null)
      .slice(0, limit);

    if (runArticleIds.length > 0) {
      const runArticles = await prisma.article.findMany({
        where: { id: { in: runArticleIds }, ...baseWhere, ...notDelivered },
        select: ARTICLE_SELECT_FOR_WORDPRESS,
      });
      // Preserve generation order — findMany with `id: { in }` does not guarantee it.
      const orderIndex = new Map(runArticleIds.map((id, idx) => [id, idx]));
      runArticles.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));

      for (const article of runArticles) {
        const normalized = await claimAndNormalize(site, article);
        if (normalized) {
          articles.push(normalized);
          excludeIds.push(article.id);
        }
      }
    }
  }

  // ── Step 2: fill remaining slots from the general pending pool ───────────
  // Always runs in MODE B; in MODE A it's an explicit fallback, never the
  // primary source, when the triggered run alone didn't fill `limit`.
  let duplicates = 0;
  if (articles.length < limit) {
    const remaining = limit - articles.length;
    const poolWhere = {
      ...baseWhere,
      ...notDelivered,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    };

    const [eligibleCount, candidates] = await Promise.all([
      prisma.article.count({ where: baseWhere }),
      prisma.article.findMany({
        where: poolWhere,
        orderBy: { createdAt: 'asc' },
        take: remaining,
        select: ARTICLE_SELECT_FOR_WORDPRESS,
      }),
    ]);

    duplicates = Math.max(0, eligibleCount - excludeIds.length - candidates.length);

    for (const article of candidates) {
      const normalized = await claimAndNormalize(site, article);
      if (normalized) articles.push(normalized);
    }
  }

  return {
    runId: pipelineRunId ?? randomUUID(),
    articles,
    stats: {
      discovered,
      processed,
      rejected,
      duplicates,
      returned: articles.length,
    },
    status: classifyRunStatus(triggerReason),
    ...(triggerReason ? { reason: triggerReason } : {}),
  };
}
