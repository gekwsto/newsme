/**
 * Integration contract between NewsMe (processing engine) and external
 * WordPress publishing destinations (e.g. OnlinePress).
 *
 * NewsMe is the source of truth for RSS discovery, extraction, filtering,
 * AI rewriting, categorization and image selection. This contract only
 * describes the normalized, public-safe shape handed to a WordPress site —
 * it intentionally excludes internal/Prisma fields (ids, scores, source
 * URLs, provenance) that must never leave the NewsMe backend.
 *
 * Kept framework-agnostic (no Prisma/Next imports) so it can be reused by
 * any future destination (another WordPress site, another CMS, etc).
 */

/** Publish-mode hint the destination intends to apply on its own side. NewsMe does not act on this. */
export type WordPressPublishMode = 'draft' | 'publish';

export interface WordPressPipelineRequest {
  /** Tenant/channel identifier, e.g. "onlinepress". Used for delivery de-duplication and future multi-site config. */
  site: string;
  /** Max number of articles to return in this call. */
  limit?: number;
  /** Restrict results to these NewsMe category slugs. Empty/omitted = all categories. */
  categories?: string[];
  /** Informational only — how the destination plans to publish the received articles. */
  publishMode?: WordPressPublishMode;
  /**
   * MODE A (true): synchronously triggers a real NewsMe pipeline run (RSS
   * discovery -> extraction -> filtering -> AI rewriting -> categorization ->
   * image selection — the exact same runNewsPipeline() the Vercel cron
   * scheduler uses) and returns the Articles that run produced (falling back
   * to already-processed pending Articles only if the run produced fewer
   * than `limit`). A database-backed lock prevents this from ever running
   * concurrently with the scheduler's own cron-driven run.
   *
   * MODE B (false, default): no new processing — just returns up to `limit`
   * already-processed Articles not yet delivered to `site`. Cheap enough to
   * poll frequently.
   */
  triggerRun?: boolean;
}

export interface WordPressCategory {
  slug: string;
  name: string;
}

export interface WordPressFeaturedImage {
  url: string;
  alt: string;
  caption: string;
}

export interface WordPressSeo {
  title: string;
  description: string;
}

export interface NormalizedArticle {
  /** Stable NewsMe Article.id — use as the idempotency/dedup key on the destination side. */
  externalId: string;
  title: string;
  slug: string;
  /** Sanitized HTML body. Never contains source-attribution footers ("Πηγή:", "Αρχικό άρθρο", etc). */
  content: string;
  excerpt: string;
  category: WordPressCategory;
  tags: string[];
  featuredImage: WordPressFeaturedImage | null;
  seo: WordPressSeo;
  publishedAt: string | null;
}

export interface WordPressPipelineStats {
  discovered: number;
  processed: number;
  rejected: number;
  duplicates: number;
  returned: number;
}

/**
 * Machine-readable outcome of a pipeline request, distinct from `reason`
 * (which is free-text detail for logs/admin display):
 *   - 'ok': normal outcome (MODE B fetch, or MODE A's trigger actually ran).
 *   - 'already_running': triggerRun was requested but another run (NewsMe's
 *     own cron, or another site's request) currently holds the pipeline
 *     lock. Not an error — `articles`/`stats` still reflect MODE B's pending
 *     pool, so the caller isn't left empty-handed.
 *   - 'skipped': triggerRun was requested but didn't run for another reason
 *     (pipeline disabled, outside allowed hours, daily/budget limit, no
 *     sources) — again not an error, same fallback behavior applies.
 */
export type WordPressRunStatus = 'ok' | 'already_running' | 'skipped';

export interface WordPressPipelineSuccessResponse {
  success: true;
  runId: string;
  articles: NormalizedArticle[];
  stats: WordPressPipelineStats;
  status: WordPressRunStatus;
  /** Human-readable detail when status !== 'ok'. */
  reason?: string;
}

export interface WordPressPipelineErrorResponse {
  success: false;
  error: string;
}

export type WordPressPipelineResponse = WordPressPipelineSuccessResponse | WordPressPipelineErrorResponse;

/**
 * Async "start + poll" variant of the same contract, for deployments where a
 * single long-held synchronous request cannot be trusted to survive the
 * pipeline's worst-case duration (e.g. a Cloudflare-proxied origin, whose
 * default read timeout is far shorter than ~270s). `POST .../pipeline/start`
 * accepts the same request body as `POST .../pipeline` and returns
 * immediately; `GET .../pipeline/{jobId}?site=...` is then polled until
 * `jobStatus` is `completed` or `failed`. The underlying processing is
 * identical either way — this only changes when the HTTP response is sent.
 */
export interface WordPressPipelineStartSuccessResponse {
  success: true;
  jobId: string;
  jobStatus: 'processing';
}

export type WordPressPipelineStartResponse = WordPressPipelineStartSuccessResponse | WordPressPipelineErrorResponse;

export type WordPressPipelineJobStatus = 'processing' | 'completed' | 'failed' | 'not_found';

export interface WordPressPipelineJobProcessingResponse {
  success: true;
  jobStatus: 'processing';
  jobId: string;
}

export interface WordPressPipelineJobFailedResponse {
  success: true;
  jobStatus: 'failed';
  jobId: string;
  error: string;
}

export interface WordPressPipelineJobCompletedResponse {
  success: true;
  jobStatus: 'completed';
  jobId: string;
  runId: string;
  articles: NormalizedArticle[];
  stats: WordPressPipelineStats;
  status: WordPressRunStatus;
  reason?: string;
}

export type WordPressPipelineJobResponse =
  | WordPressPipelineJobProcessingResponse
  | WordPressPipelineJobFailedResponse
  | WordPressPipelineJobCompletedResponse
  | WordPressPipelineErrorResponse;

/** Per-article delivery acknowledgement sent back by the WordPress plugin after import. */
export type WordPressAckStatus = 'published' | 'draft' | 'failed';

export interface WordPressAckArticle {
  externalId: string;
  status: WordPressAckStatus;
  wordpressPostId?: number;
  wordpressUrl?: string;
  error?: string;
}

export interface WordPressAckRequest {
  site: string;
  runId?: string;
  articles: WordPressAckArticle[];
}

export interface WordPressAckResultItem {
  externalId: string;
  acknowledged: boolean;
  error?: string;
}

export interface WordPressAckSuccessResponse {
  success: true;
  results: WordPressAckResultItem[];
}

export interface WordPressAckErrorResponse {
  success: false;
  error: string;
}

export type WordPressAckResponse = WordPressAckSuccessResponse | WordPressAckErrorResponse;
