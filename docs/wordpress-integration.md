# NewsMe ↔ WordPress (OnlinePress AutoPipeline) Integration

NewsMe is the **Article Processing Engine**: RSS discovery, extraction,
filtering, AI rewriting, categorization, tagging, and image
selection/downloading all continue to happen exactly as before, unchanged,
in `src/services/news-auto-pipeline.ts`. This integration adds a thin,
authenticated read layer on top of that pipeline so an external WordPress
site (OnlinePress, and any future site) can pull finished articles and
publish them with `wp_insert_post()`.

```
WordPress (OnlinePress)
  → OnlinePress AutoPipeline plugin
    → POST /api/integrations/wordpress/pipeline/start  { triggerRun: true }   (NewsMe)
      ← { jobId } immediately (202)
    → GET  /api/integrations/wordpress/pipeline/{jobId}?site=...  (polled every 5s)
      … meanwhile, server-side, after the /start response was already sent:
      → runNewsPipeline(true, site) — the EXACT function the Vercel cron scheduler
        calls (RSS discovery → extraction → filtering → AI rewriting →
        categorization → image selection), guarded by a DB-backed lock+heartbeat
        so it can never run concurrently with the scheduler or another WordPress request
      → Articles that THIS run produced (via PipelineRunItem.runId), falling back
        to older already-processed/undelivered Articles only to fill remaining slots
    ← jobStatus: completed, with the normalized articles (no internal fields, no source attribution)
  → wp_insert_post() + categories/tags/featured image/SEO
  → POST /api/integrations/wordpress/articles/ack   (best-effort)
```

No AI/RSS/image-selection logic was duplicated into the WordPress plugin —
every article returned was produced by the real, unmodified NewsMe pipeline;
the plugin only imports it.

## Production-readiness hardening pass (this revision)

A pre-production review of this integration found and fixed two real,
confirmed issues (not hypothetical ones — see the specifics below):

1. **PipelineLock TTL race.** The lock's staleness window was measured from
   a single "acquired at" timestamp, so a run genuinely taking longer than
   the TTL (300s) could have its lock stolen by a second caller *while still
   executing*. Fixed with a heartbeat that renews the lease every ~60s for
   as long as the pipeline is actually running — see "Concurrency" below.
2. **The production domain is confirmed behind Cloudflare's proxy**
   (`curl -I https://newsme.gr` returns `server: cloudflare`, `cf-ray`,
   Cloudflare NEL headers), whose default proxy read timeout (~100s) is well
   under the pipeline's worst-case duration (~270s). A single long-held
   synchronous HTTP request for `triggerRun: true` cannot be relied on to
   survive that. Fixed by adding an async **start + poll** flow (`POST
   .../pipeline/start` + `GET .../pipeline/{jobId}`) where no single HTTP
   call to NewsMe needs to stay open longer than ~20s — see "Async start +
   poll" below. The original synchronous `POST .../pipeline` endpoint is
   unchanged and still works for MODE B (always fast) or for callers on an
   infrastructure without this constraint.
3. **A WordPress-side ACK gap**: when NewsMe redelivered an article whose
   original ACK never arrived (e.g. a dropped connection), the importer
   correctly skipped creating a duplicate post — but never told NewsMe about
   it, so NewsMe's delivery record stayed stuck and would keep re-offering
   the article on every redelivery window forever. Fixed: a duplicate-skip
   now still sends a success ACK (reflecting the existing post's real
   `publish`/`draft` status), which is what makes "post created, ACK lost,
   redelivered later" converge to a single post + `PUBLISHED` delivery
   instead of an infinite loop. See "Delivery state machine" below.

## Architecture

### NewsMe side (new files)

| File | Purpose |
|---|---|
| `prisma/schema.prisma` (`WordpressDelivery` model) | Tracks which Article has been sent to which destination `site`, so the same article is never resent once delivered (self-healing after 6h if never acknowledged). |
| `prisma/schema.prisma` (`PipelineLock` model, `PipelineRun.triggeredBySite` field) | DB-backed mutex row + traceability of which site (if any) triggered a given run. |
| `prisma/schema.prisma` (`WordPressPipelineJob` model) | Backs the async start+poll flow — one row per triggered job, holding its status and (once done) the full result. |
| `src/lib/pipeline/pipeline-lock.ts` | `acquirePipelineLock()` / `renewPipelineLock()` / `releasePipelineLock()` / `startLockHeartbeat()` — the mutex + heartbeat, kept in its own tiny module (no heavy deps) so it's independently unit-testable. |
| `src/types/integrations/wordpress.ts` | The full TypeScript integration contract (request/response/normalized article/job shapes). |
| `src/lib/integrations/wordpress/auth.ts` | Bearer/`X-NewsMe-API-Key` auth, timing-safe comparison, fails closed. |
| `src/lib/integrations/wordpress/rate-limit.ts` | Best-effort in-memory rate limiter (see caveats below). |
| `src/lib/integrations/wordpress/normalize-article.ts` | Converts an internal `Article` row into the public, destination-safe `NormalizedArticle` shape — strips source attribution, resolves absolute image URLs. |
| `src/lib/integrations/wordpress/pipeline.ts` | `runWordPressPipeline()` — MODE A (trigger + return that run's own Articles) and MODE B (fetch already-processed, undelivered Articles), see below. |
| `src/lib/integrations/wordpress/job.ts` | Async job bookkeeping (`createPipelineJob`, `runPipelineJobInBackground`, `getPipelineJob`) backing the start+poll flow. Calls `runWordPressPipeline()` — never reimplements it. |
| `src/app/api/integrations/wordpress/pipeline/route.ts` | `POST` endpoint — synchronous fetch/trigger (MODE B always; MODE A safe off-Cloudflare or for short runs). |
| `src/app/api/integrations/wordpress/pipeline/start/route.ts` | `POST` endpoint — starts an async job, returns immediately. |
| `src/app/api/integrations/wordpress/pipeline/[jobId]/route.ts` | `GET` endpoint — polls a job's status/result. |
| `src/app/api/integrations/wordpress/articles/ack/route.ts` | `POST` endpoint WordPress calls to report per-article import outcome. |
| `__tests__/integrations/*.test.ts`, `__tests__/services/pipeline-lock.test.ts` | 90 Jest tests covering auth, normalization, all four routes, the selection service (MODE A prioritization + MODE B fallback + partial success), the job layer, and the lock (including the TTL-race bug/fix pair). |

**Nothing in the existing pipeline's RSS discovery, extraction, filtering, AI
generation, categorization, or image-selection logic was rewritten or
duplicated.** `runNewsPipeline()` (`src/services/news-auto-pipeline.ts`) is
called as-is. The changes made to that file are additive and structural
only: a lock acquired before the pipeline body runs, an optional
`triggeredBySite` parameter recorded on the `PipelineRun` row, and a
`pipelineRunId` field added to its return value — no stage of the pipeline
itself (scoring, prompts, extraction, image logic) was touched.

### MODE A vs MODE B — what "Run AutoPipeline Now" actually does

This was corrected after an initial implementation review found the
endpoint defaulted to a pure "fetch what already exists" behavior even when
a real trigger was the intended architecture. It now does both, explicitly:

**MODE A — `triggerRun: true`.** Synchronously calls the real
`runNewsPipeline(true, site)` — the exact function
`/api/scheduler/news-pipeline` (the Vercel cron) also calls — then returns
the Articles **that specific run produced**, resolved via
`PipelineRunItem.runId → generatedArticleId` (not a timestamp guess). If
that run produced fewer than `limit` articles (e.g. only 2 passed
filtering), the remaining slots are filled from MODE B's pending pool as an
explicit, documented fallback — never silently substituting unrelated older
articles as if they came from "this run" when they didn't.

Both the WordPress plugin's **manual "Run AutoPipeline Now" button** and its
**scheduled WP-Cron runs** use `triggerRun: true` — per OnlinePress's stated
preference of "cron → trigger processing → import resulting articles"
rather than a passive poll. This is safe to call as often as the schedule
allows because NewsMe's own daily-article-count / AI-budget / allowed-hours
gates in `runNewsPipeline()` are not bypassed by this integration — they are
NewsMe's own governor over generation cost, completely independent of who
calls it or how often.

**MODE B — `triggerRun: false` (default).** No new processing — just
returns up to `limit` already-processed Articles not yet delivered to
`site`. Exists as a lighter-weight option for future integrations that want
cheap, frequent polling without spending AI budget on every call; the
shipped WordPress plugin does not use this mode by default (see above).

### Concurrency: the pipeline-run lock

`runNewsPipeline()` now acquires a **database-backed mutex**
(`src/lib/pipeline/pipeline-lock.ts`, backed by the new `PipelineLock`
table) before doing anything else, and releases it once the run genuinely
finishes. This is necessary — and was missing before this review — because:

- An in-memory/transient lock would **not** be shared across separate
  Vercel serverless invocations (the cron hitting `/api/scheduler/news-pipeline`
  and a WordPress-triggered request to `/api/integrations/wordpress/pipeline`
  are different invocations, possibly different instances).
- Without it, a WordPress trigger landing at the same moment as the
  scheduler's own cron tick could process overlapping RSS items twice.

Mechanics:
- Claimed via an atomic conditional `updateMany` (`lockedAt: null OR older
  than TTL`) — no read-then-write race window.
- TTL = pipeline's own internal timeout (270s) + 30s margin = 300s.
- **Heartbeat, not a fixed expiry** (`startLockHeartbeat`): while
  `_runPipeline` is genuinely running, `renewPipelineLock()` refreshes
  `lockedAt` every ~60s (TTL/5). This matters because the pipeline's *total*
  execution time is not itself bounded by the TTL — only the outer
  `Promise.race`'s 270s timeout is, and that only decides when the HTTP
  *response* is sent, not when `_runPipeline` actually stops running (see
  next point). Without the heartbeat, a run legitimately taking longer than
  300s would have its lock go stale mid-execution, letting a second caller
  start a truly concurrent run — reproduced and fixed in
  `__tests__/services/pipeline-lock.test.ts` ("THE BUG THIS FIXES" /
  "THE FIX" test pair, using a stateful fake lock table so the actual
  staleness math runs against fake-advanced time).
- Released in a `.finally()` attached to the *actual* pipeline execution
  promise — not to the outer `Promise.race` timeout wrapper. `Promise.race`
  doesn't cancel the losing promise, so if the 270s timeout branch wins first,
  `_runPipeline` can keep running in the background; releasing the lock only
  when it truly settles (and stopping the heartbeat at the same moment)
  prevents a second caller from starting a genuinely concurrent run in that window.
- **Crash recovery**: if the process is killed outright (deploy, OOM, a hard
  platform-enforced max duration), the heartbeat simply stops ticking. Once
  300s pass with no renewal, the lock is stale again and the next caller
  reclaims it — no manual intervention needed.
- If the lock is already held, `runNewsPipeline()` returns immediately
  (`{ ok: true, reason: 'Another pipeline run is already in progress' }`,
  a shared exported constant in `pipeline-lock.ts` so callers can match it
  exactly rather than parsing prose) without creating a `PipelineRun` row at
  all — cheap, no wasted writes.

Unit-tested directly in `__tests__/services/pipeline-lock.test.ts` (19 tests,
real lock module, mocked Prisma) — the full `news-auto-pipeline.ts` module
isn't imported in Jest because it transitively pulls in `jsdom`, which pulls
in an ESM-only package this project's Jest transform can't parse; that's a
pre-existing environment limitation, not something introduced here, and is
exactly why the lock was extracted into its own dependency-light module.

### Async start + poll (production path for `triggerRun: true`)

Because the production domain is confirmed behind Cloudflare (see above),
`POST /api/integrations/wordpress/pipeline` (the single long-held request)
is not a safe default for `triggerRun: true` in production — the request
can exceed Cloudflare's proxy timeout well before the pipeline finishes.
Instead, the WordPress plugin uses:

1. `POST /api/integrations/wordpress/pipeline/start` — validates and
   authenticates identically to the synchronous endpoint, creates a
   `WordPressPipelineJob` row (`status: "processing"`), schedules the real
   work via Next's `after()`, and returns `{ jobId }` immediately (`202`).
   `after()` callbacks run **after** the HTTP response is sent but still
   within the same request's lifecycle — this is safe specifically because
   NewsMe runs as a **self-hosted, persistent Node process**
   (`docker-compose.yml` + `next start`, confirmed from the repo's own
   `Dockerfile`/`next.config.ts` `output: 'standalone'`), not a serverless
   function that gets frozen right after responding. If this were ever
   deployed on Vercel serverless instead, `after()` still works correctly
   there too (it uses Vercel's `waitUntil` primitive under the hood) — this
   is *not* a bare `void someAsyncCall()` "fake async" pattern, which would
   be unsafe on serverless.
2. `runPipelineJobInBackground()` calls the exact same `runWordPressPipeline()`
   used by the synchronous endpoint — no reimplementation — and writes the
   full result (or an error) back onto the job row.
3. `GET /api/integrations/wordpress/pipeline/{jobId}?site=...` — polled by
   the WordPress plugin every 5s (`OP_AutoPipeline_Scheduler::POLL_INTERVAL_SECONDS`)
   for up to 280s (`MAX_POLL_SECONDS`). Each poll is its own short HTTP
   call (~20s client timeout) — no single request needs to survive anywhere
   near Cloudflare's limit. Requires the same API key as every other
   endpoint, and the job's `site` must match the query param (a cheap
   tenant-isolation check on top of the shared-key auth).
4. If a job is still `"processing"` after 10 minutes
   (`JOB_STALE_MS` in `src/lib/integrations/wordpress/job.ts`, well above the
   pipeline's own worst case) with no result, polling it reports `failed`
   rather than hanging forever — this covers the case where the server
   process restarted mid-run and the `after()` callback never got to finish.
5. If the WordPress-side poll loop itself times out (280s) without the job
   completing, the run is recorded as `failed` on the WordPress side — but
   the actual pipeline may still finish moments later on the NewsMe side;
   any articles it produced are not lost (see the delivery state machine —
   they simply surface as MODE B pending articles on the next run, or a
   direct poll of the same `jobId` would still show `completed`).

The original synchronous `POST /pipeline` endpoint is unchanged and remains
valid — for MODE B (`triggerRun: false`, always fast, unaffected by
Cloudflare's timeout) it's simpler to use directly; it's only `triggerRun:
true` where the async flow matters, which is why the WordPress plugin uses
start+poll specifically for that case.

### Selection / duplicate-protection logic (`runWordPressPipeline`)

1. Eligible articles: `status IN (DRAFT, APPROVED, PUBLISHED)` and
   `sourceType IN (RSS_SUMMARY, AI_GENERATED, AI_ASSISTED)` — i.e. anything
   the pipeline actually produced, regardless of NewsMe's own publish state
   (WordPress's publish/draft choice is independent of NewsMe's).
2. **MODE A only:** articles from `PipelineRunItem.generatedArticleId` for
   this run's `pipelineRunId` are looked up and returned first, in
   generation order, still subject to the same eligibility + not-yet-delivered
   filters below.
3. Excludes any article that already has a `WordpressDelivery` row for this
   `site` with status `PUBLISHED`, or status `SENT` created within the last
   6 hours (see the delivery state machine below).
4. Any remaining slots (all of them in MODE B, leftover ones in MODE A) are
   filled from the general oldest-first undelivered pool.
5. Claims each returned article via
   `wordpressDelivery.upsert({ site, articleId })` before responding, so a
   second poll won't re-offer it.

### Delivery state machine

```
              claim (upsert)                ack: published/draft
   (none) ───────────────────► SENT ───────────────────────────► PUBLISHED
                                 │  ▲                                │
                    ack: failed  │  │ re-claimed on next             │ (terminal —
                                 ▼  │ fetch after TTL/failure         │  excluded from
                              FAILED┘                                │  all future fetches
                                 │                                   ▼
                    no ack within 6h ──────► eligible again (re-claimable)
```

- **ACK success (`published`/`draft`) → `PUBLISHED`.** Terminal — excluded
  from all future fetches for this site.
- **ACK failure (`failed`) → `FAILED`.** Immediately retryable — the very
  next fetch for this site can re-claim it (no 6h wait), since `FAILED` is
  not in the delivery-exclusion filter.
- **No ACK within 6 hours → treated as lost, re-claimable.** Guards against
  NewsMe marking something `SENT` while the response never actually reached
  WordPress (dropped connection, client-side timeout). Acking is
  best-effort/optional; if WordPress successfully imports without ever
  acking, a later redelivery attempt is harmless — WordPress's own
  `_newsme_article_id` postmeta check makes the re-import a no-op.
- **Retry after timeout → no duplicate, AND the delivery record self-heals.**
  The primary idempotency guarantee is WordPress-side (`_newsme_article_id`):
  when a redelivered article is found to already have a post,
  `class-importer.php` returns `status: 'skipped', reason: 'duplicate'` —
  and (fixed in this hardening pass) `class-scheduler.php`'s
  `send_acknowledgements()` **still sends a success ACK** for that case
  (`published`/`draft`, read from the existing post's real status via
  `get_post_status()`). Without this, a duplicate-skip was silently not
  acked at all, leaving NewsMe's delivery record stuck at `SENT`/expired —
  which would make NewsMe re-offer the same article on every subsequent
  redelivery window, forever, even though WordPress already has it
  published. Covered end-to-end by
  `tests/test-scheduler.php`'s `IDEMPOTENCY RECOVERY` test: first delivery
  succeeds but its ACK is dropped (simulated network failure); a simulated
  redelivery finds the existing post, creates no duplicate, and this time
  the ACK succeeds — asserted directly on the outgoing ACK request body.

### Source attribution

Audit confirmed `content-generator.ts` no longer injects a
`Πηγή:`/`Αρχικό άρθρο` footer into `Article.content` — that only happens (if
it ever does) via the legacy `stripSourceAttribution()` safety net in
`src/lib/seo.ts`, which the NewsMe frontend already calls at render time.
`normalizeArticleForWordPress()` calls the same function before handing
content to WordPress, so the guarantee is identical on both surfaces, and a
regression that reintroduces the block anywhere is stripped for WordPress
either way. Source URL/source name remain wherever they already lived
(`DiscoveredArticle`, `TrainingExample`) for internal dedup/audit — nothing
about that was changed, and none of it is present in `NormalizedArticle`.

## API contract

### `POST /api/integrations/wordpress/pipeline`

Headers: `Authorization: Bearer <WORDPRESS_INTEGRATION_API_KEY>` (or
`X-NewsMe-API-Key: <key>`), `Content-Type: application/json`.

Request:
```json
{
  "site": "onlinepress",
  "limit": 10,
  "categories": [],
  "publishMode": "draft",
  "triggerRun": true
}
```
All fields except `site` are optional (`limit` defaults to 10, max 20;
`categories` filters by NewsMe category slug; `publishMode` is informational
only — NewsMe does not act on it; `triggerRun` defaults to `false` at the API
level, but the shipped WordPress plugin always sends `true` — see MODE A/B
above).

Response (`200`):
```json
{
  "success": true,
  "runId": "…",
  "articles": [
    {
      "externalId": "cku...",
      "title": "…",
      "slug": "…",
      "content": "<p>…</p>",
      "excerpt": "…",
      "category": { "slug": "politiki", "name": "Πολιτική" },
      "tags": ["Κυβέρνηση", "Βουλή"],
      "featuredImage": { "url": "https://newsme.gr/uploads/...", "alt": "…", "caption": "" },
      "seo": { "title": "…", "description": "…" },
      "publishedAt": null
    }
  ],
  "stats": { "discovered": 0, "processed": 0, "rejected": 0, "duplicates": 0, "returned": 1 }
}
```
`runId` is the real NewsMe `PipelineRun.id` when `triggerRun` produced one —
not a fabricated correlation id — so it can be cross-referenced directly
against `PipelineRun`/`PipelineRunItem` in the database. The response also
always includes a machine-readable `status`:
- `"ok"` — normal outcome.
- `"already_running"` — `triggerRun` was requested but the pipeline lock is
  held by another run (NewsMe's own cron, or another site's request). **Not
  an error** — `200`, `success: true` — `articles`/`stats` still reflect
  MODE B's pending pool so the caller isn't left empty-handed.
- `"skipped"` — `triggerRun` didn't run for another non-error reason
  (disabled, outside allowed hours, daily/budget limit, no sources).

A `reason` string (free text, for logs/admin display) accompanies any
non-`"ok"` status.

Errors: `401` (bad/missing key), `400` (invalid body), `429` (rate limited,
`Retry-After` header set), `500` (internal — message never includes
internals like DB connection strings).

### `POST /api/integrations/wordpress/pipeline/start` + `GET /api/integrations/wordpress/pipeline/{jobId}`

Async variant of the same contract — see "Async start + poll" above for why
this exists (Cloudflare's proxy timeout). Same auth, same request body as
`POST /pipeline` (`triggerRun` defaults to `true` here, since triggering is
the whole point of this endpoint).

`POST .../pipeline/start` → `202`:
```json
{ "success": true, "jobId": "…", "jobStatus": "processing" }
```

`GET .../pipeline/{jobId}?site=onlinepress` (auth required; `site` must
match the job's own site) → `200` in all three cases:
```json
{ "success": true, "jobStatus": "processing", "jobId": "…" }
```
```json
{ "success": true, "jobStatus": "failed", "jobId": "…", "error": "…" }
```
```json
{
  "success": true, "jobStatus": "completed", "jobId": "…",
  "runId": "…", "articles": [ /* same shape as POST /pipeline */ ],
  "stats": { "...": "..." }, "status": "ok"
}
```
`404` if the job doesn't exist or belongs to a different `site`. A job still
`"processing"` after 10 minutes (`JOB_STALE_MS`) is reported as `"failed"`
instead of hanging forever — the server process most likely restarted
mid-run.

### `POST /api/integrations/wordpress/articles/ack` (optional, best-effort)

Request:
```json
{ "site": "onlinepress", "runId": "…", "articles": [
  { "externalId": "…", "status": "published", "wordpressPostId": 123, "wordpressUrl": "https://onlinepress.gr/…" }
] }
```
`status` is one of `published | draft | failed`. Per-article failures never
fail the whole batch (`success: true` with per-item `acknowledged: false`).

TypeScript types for all of the above live in
`src/types/integrations/wordpress.ts`.

## Authentication & rate limiting

- Single shared secret: `WORDPRESS_INTEGRATION_API_KEY` (NewsMe) ==
  `ONLINEPRESS_NEWSME_API_KEY` conceptually, stored in the WordPress plugin's
  own settings (not a WP constant) since it's entered through wp-admin.
- Accepted as `Authorization: Bearer <key>` or `X-NewsMe-API-Key: <key>`.
- Comparison uses `crypto.timingSafeEqual`; missing server-side config fails
  closed (never "no auth required").
- Rate limiting is a **best-effort, in-memory, per-serverless-instance**
  fixed window (30 req/min). This is not a hard security boundary — auth is
  — and will reset on cold start / not be shared across concurrent Vercel
  instances. If this integration is ever opened to more than a couple of
  trusted server-to-server clients, replace it with an infra-backed limiter
  (e.g. Upstash Ratelimit); there was no existing rate-limit infrastructure
  in this codebase to reuse.
- No secrets are ever logged; error logs reference article/site IDs only.

## Article ownership: shared pool today, not per-site processing

Today, `_runPipeline` has no concept of "site" in what it processes — RSS
sources, categories, prompts, and limits are all the single global NewsMe
configuration, shared by every destination. `site` only affects **delivery**
(which `WordpressDelivery` rows exist), not **generation**. In other words:
running the pipeline "for onlinepress" today still pulls from NewsMe's one
shared RSS source list and one shared `NewsAutomationSettings` row — it does
not (yet) mean "use OnlinePress's sources/categories/style."

What *is* in place, deliberately, so this can grow later without a rework:
`PipelineRun.triggeredBySite` records which site (if any) caused a given run,
so a future per-site view of "articles produced for OnlinePress" is a query
away, not a migration away. Turning this into true per-site processing later
(distinct RSS sources, prompts, image pools, limits per site) would mean
scoping `RssSource`/`NewsAutomationSettings` (or equivalent) by `site` and
threading that into `_runPipeline`'s source/settings queries — a real but
bounded change, deliberately not made now since OnlinePress is the only
destination and a shared pool is the correct MVP scope.

## Multi-site future-proofing

The `site` field is a free-form tenant identifier already threaded through
the delivery-tracking table, the request contract, and the selection query.
Adding a second WordPress destination later means: give it its own
`WORDPRESS_INTEGRATION_API_KEY`-style secret (or reuse the same one, since
auth is currently a single shared key — split it into a keyed map if
multiple destinations need distinct keys) and a distinct `site` value in its
plugin settings. No pipeline, schema, or contract changes are required. Per-
site categories/prompts/limits are not implemented (out of scope per the
brief) but nothing here blocks adding them later (e.g. a `WordPressSite`
config table keyed by `site`).

## NewsMe environment variables

```env
# Required for the WordPress integration
WORDPRESS_INTEGRATION_API_KEY=   # openssl rand -hex 32

# Already load-bearing in the existing pipeline, now documented in .env.example
OPENAI_API_KEY=
PEXELS_API_KEY=
```

## NewsMe deployment

```bash
# 1. Install deps (no new dependencies were added)
npm install

# 2. Apply the additive schema changes: WordpressDelivery + PipelineLock
#    models, WordpressDeliveryStatus enum, Article.wordpressDeliveries
#    relation, PipelineRun.triggeredBySite field. No existing column was
#    removed or retyped.
npx prisma db push        # or `prisma migrate deploy` if this environment uses migrations
npx prisma generate

# 3. Set the new env var in your deployment environment (Vercel dashboard / .env)
WORDPRESS_INTEGRATION_API_KEY=<generated secret>

# 4. Build & test
npm run build
npm test

# 5. Deploy as usual (Vercel). No vercel.json changes needed — the new routes
#    are plain POST endpoints, not cron jobs.
```

This is a local Postgres dev database in this environment; `db push` was
already run and verified to apply cleanly with no data loss — every change
is additive (two new tables, one new enum, one new relation field, one new
nullable column). **In production, run the same `prisma db push` (or your
migration flow) before deploying the new/updated API routes.**

## WordPress plugin

Plugin location in this repo: `wordpress-plugin/onlinepress-autopipeline/`.

```
onlinepress-autopipeline/
├── onlinepress-autopipeline.php   # bootstrap: constants, hooks, cron intervals
├── includes/
│   ├── class-settings.php         # single settings option, sanitization
│   ├── class-logger.php           # run history (capped wp_option) + error_log
│   ├── class-api-client.php       # wp_remote_post/get wrapper (fetch, start, poll, ack)
│   ├── class-category-mapper.php  # slug/name-based category+tag resolution
│   ├── class-image-handler.php    # media_sideload_image + featured image
│   ├── class-seo.php              # Yoast / Rank Math / fallback postmeta
│   ├── class-importer.php         # per-article import, validation, dedup
│   ├── class-scheduler.php        # wp-cron + transient locking + start/poll loop
│   └── class-admin.php            # menu, settings page, AJAX "Run Now"
├── admin/views/settings-page.php
├── assets/{admin.css,admin.js}
├── uninstall.php                  # removes plugin options only, never content
├── readme.txt
└── tests/                         # 45 tests, no Composer/PHPUnit required
    ├── wp-stubs.php                # minimal WP function/class stubs
    ├── bootstrap.php, framework.php
    └── test-*.php
```

### Installation

1. Copy (or zip and upload) `wordpress-plugin/onlinepress-autopipeline/` into
   `wp-content/plugins/onlinepress-autopipeline/` on the OnlinePress
   WordPress install.
2. WordPress Admin → Plugins → activate **OnlinePress AutoPipeline**.
3. WordPress Admin → **OnlinePress AutoPipeline** (left sidebar menu):
   - **NewsMe API URL**: `https://newsme.gr/api/integrations/wordpress/pipeline`
   - **API Key**: the same value as NewsMe's `WORDPRESS_INTEGRATION_API_KEY`
   - **Import status**: Draft (recommended for the first run) or Publish
   - **Articles per run**: 1 (for the first smoke test), 5/10/20 afterwards
   - **Schedule**: Manual, Every 15/30 minutes, or Hourly
   - Check **Enable Auto Pipeline**, Save Changes.
4. Click **Run AutoPipeline Now**.

### Duplicate protection (WordPress side)

Every imported post stores `_newsme_article_id` (NewsMe's `Article.id`) and
`_newsme_source_hash` as postmeta. Before inserting, the importer looks up
any post (any status) with that `_newsme_article_id` and skips if found —
this is idempotent regardless of how many times the same `externalId` is
delivered (retry after timeout, redelivery-window safety net on the NewsMe
side, or a manual re-run).

### Featured images

`class-image-handler.php` uses `media_sideload_image()` (via WordPress's own
`wp-admin/includes/media.php`) to download the NewsMe-provided URL into the
real Media Library, validates the resulting MIME type is `image/*` (deleting
the attachment and failing soft if not), sets alt text, and calls
`set_post_thumbnail()`. A failure here **never fails the article import** —
it's logged as a warning and the post is still created without a featured
image.

### SEO plugin detection

`class-seo.php` checks for `WPSEO_VERSION` (Yoast) or `RankMath`/
`RANK_MATH_VERSION` (Rank Math) constants/classes at runtime — it does not
assume Yoast is installed. If neither is present, SEO title/description are
still saved as plain postmeta (`_onlinepress_autopipeline_seo_title` /
`_description`) so they aren't lost and can be picked up later.

### Cron & locking

- Custom intervals `op_autopipeline_15min` / `op_autopipeline_30min` are
  registered via the `cron_schedules` filter; `hourly` uses WordPress's
  built-in interval.
- **Every scheduled tick triggers real NewsMe processing** (`triggerRun: true`),
  identical to the manual button — not a passive "check for new content"
  poll. See MODE A/B above for why this is safe to do on a schedule.
- Two independent locks cooperate: a WordPress-side `set_transient`/
  `get_transient` lock (`onlinepress_autopipeline_lock`, 5-minute TTL) stops
  this plugin's own scheduled and manual runs from overlapping each other,
  and NewsMe's own DB-backed `PipelineLock` (see above) stops this plugin's
  request from ever running concurrently with NewsMe's own Vercel cron or a
  second WordPress site's request — the two locks operate at different
  layers and both apply.
- Changing the schedule in settings reschedules automatically
  (`update_option_onlinepress_autopipeline_settings` hook); deactivating the
  plugin unschedules the cron event and clears any held lock.
- **Both manual and scheduled runs now use start+poll, not one long-held
  request** (`class-scheduler.php::run()`): `start_pipeline()` (short
  timeout, ~20s) then `poll_pipeline()` in a loop every
  `POLL_INTERVAL_SECONDS` (5s) for up to `MAX_POLL_SECONDS` (280s). No
  individual HTTP call to NewsMe needs to survive anywhere near Cloudflare's
  ~100s proxy timeout — see "Async start + poll" above for why this
  replaced the previous single `fetch_pipeline()` call. The **total**
  wall-clock budget for a full run (up to ~280s) is unchanged from before;
  it's just spent as many short round trips instead of one long one, so the
  WordPress host's PHP `max_execution_time` still needs to comfortably
  exceed that for the admin-ajax "Run Now" request and the wp-cron request
  (see Troubleshooting) — that requirement didn't go away, it just no
  longer depends on the network path surviving too.
- If polling times out client-side (280s) without the job completing, the
  run is recorded as failed on the WordPress side, but the pipeline may
  still finish moments later on NewsMe's side — nothing is lost (see the
  delivery state machine's redelivery-window self-healing).
- The `sleep()` between polls goes through a thin wrapper
  (`onlinepress_autopipeline_sleep()`) so the poll loop is unit-testable
  without a test actually pausing for real seconds (`tests/wp-stubs.php`
  pre-defines a no-op version that wins via a `function_exists()` guard).

### Manual "Run Now" button UX

`assets/admin.js`: clicking **Run AutoPipeline Now** immediately disables
the button (guards against an accidental double-click queuing a second
admin-ajax request — the *real* protection remains the server-side locks
above, this is just UX polish), shows an info notice explaining the run can
take a couple of minutes, and updates the button's own label with a live
elapsed-time counter (`Running AutoPipeline… (37s)`) for the whole duration
of the single ajax call (which itself does the start+poll loop server-side
in PHP). A `status: "skipped"` result (WordPress's own lock already held)
renders as a plain warning notice, not an error.

### Running the WordPress-side tests

```bash
cd wordpress-plugin/onlinepress-autopipeline
php tests/run-tests.php
```

No WordPress install, database, or Composer/PHPUnit needed — `tests/wp-stubs.php`
provides a minimal in-memory implementation of the WordPress functions the
plugin actually calls, and the real plugin bootstrap file is required
unmodified so tests exercise the exact shipped code.

## Manual smoke test

1. In wp-admin, set Limit = 1, Import status = Draft.
2. Click **Run AutoPipeline Now** — this triggers a real NewsMe processing
   run (MODE A) and waits for it to finish (can take up to ~290s).
3. Confirm exactly one Draft post was created with: correct title, slug,
   full content, category, tags, featured image (Media Library attachment,
   not an external URL), SEO description, and no "Πηγή:" / "Αρχικό άρθρο"
   text anywhere in the content.
4. Click **Run AutoPipeline Now** again — no second post should appear (the
   `_newsme_article_id` duplicate check skips it).

5. Click **Run AutoPipeline Now** a third time while a run is still
   in-flight (e.g. from another browser tab) — should show a plain warning
   ("another run is already in progress"), never a 500 or a stack trace.

### What's been verified so far vs. what still needs a live run

This implementation was verified with: 373 NewsMe Jest tests (unit-level,
Prisma/HTTP mocked) + 45 WordPress PHP tests (WP functions stubbed,
including an end-to-end "post created, ACK lost, redelivered later" test) +
a **real, non-mocked run against the local Postgres dev database**
(`scripts/_wp-integration-check.ts`) exercising the actual delivery/claim/ack
queries and the real `normalizeArticleForWordPress()` against a real
`Article` row — confirming the schema, unique constraint, per-site dedup,
and source-attribution stripping all hold up against a real database, not
just mocks. The production domain's Cloudflare proxy was confirmed with a
real request (`curl -I https://newsme.gr`).

**Not yet verified**, because this environment has no live WordPress
install and no OpenAI/RSS credentials to safely exercise: an actual
`triggerRun: true` call hitting real RSS feeds and OpenAI (MODE A's own RSS
→ AI path is the existing, already-production `runNewsPipeline()` —
unchanged by this work — so this is a pre-existing pipeline, not new
integration risk), a real WordPress install actually running
`wp_insert_post()` end to end, and the start+poll flow against the real
Cloudflare-proxied domain (only unit-tested with mocked HTTP so far). Before
flipping this on for real OnlinePress traffic, run the manual smoke test
above once against a staging WordPress site with real credentials.

## Timeout chain (verified where possible; self-hosted Docker, not Vercel)

Despite a `vercel.json` existing in the repo, the actual production
deployment is **self-hosted Docker** (`Dockerfile` + `docker-compose.yml`,
`next.config.ts` has `output: 'standalone'`, and `npm run start` = `next
start` runs as a persistent process, not a serverless function) — confirmed
from the repo, not assumed. `vercel.json`'s cron entries appear to be
unused/legacy for this deployment path; whatever actually hits
`/api/scheduler/*` in production (host crontab? a Vercel preview
deployment?) could not be determined from this repository alone.

| Layer | Timeout | Status |
|---|---|---|
| WordPress → NewsMe, `wp_remote_post`/`get` (this integration) | 20s (start/poll/ack calls), 290s (only the legacy single-call `fetch_pipeline`, no longer used by the plugin) | Safe — every call the plugin now actually makes is ≤20s |
| PHP `max_execution_time` (wp-cron / admin-ajax process) | Host-dependent, often 30-60s on shared hosting by default | **Must be verified/raised on the real OnlinePress host** to exceed ~290s (the poll loop's total wall-clock budget), since it still runs inside one PHP process even though individual HTTP calls are short |
| **Cloudflare proxy (confirmed present on newsme.gr)** | ~100s default (free/pro plan assumption — not verified which plan) | Was unsafe for the old single long-held request; **not a factor anymore** for the calls the plugin actually makes (all ≤20s) |
| Reverse proxy in front of the Docker container (nginx/Caddy/etc.) | **Unknown — not in this repository** | Could not be found or verified. If one exists between Cloudflare and the `newsme-app` container, its timeout should also be checked, though it no longer matters for this integration's own short calls |
| Node.js HTTP server (`next start`, standalone `server.js`) | Node defaults apply — no override found in `server.js` or Next's `start-server.js` (`requestTimeout` defaults to 300000ms/5min in modern Node) | Not a binding constraint for this integration's short calls; was borderline (270s vs 300s) for the old single-call design |
| NewsMe pipeline internal timeout (`PIPELINE_TIMEOUT_MS`) | 270s (`news-auto-pipeline.ts`, pre-existing, unchanged) | This is *why* the above numbers matter — the worst case a caller might have to wait for |
| PipelineLock TTL / heartbeat | 300s staleness window, renewed every ~60s while genuinely running | Fixed this pass — see "Concurrency" above |

## Performance (honest — not fully measured)

The local dev database's `PipelineRun` history has zero rows with
`generatedArticles > 0` — every historical run in this environment fetched
RSS but generated nothing (no `OPENAI_API_KEY`/`PEXELS_API_KEY` configured
locally), so **no real end-to-end stage timing could be measured here**,
and a live run was not attempted since it would spend real OpenAI budget
and hit live RSS feeds without authorization to do so.

Engineering estimates from the code (NOT measurements):
- RSS discovery: parallel fetch across sources, 12s/feed timeout,
  typically far faster — likely 2-12s wall time for the whole stage.
- Extraction: parallel per qualified item, 12s/item timeout — likely
  3-12s wall time.
- AI generation: **sequential**, one OpenAI `gpt-5-mini` call per qualified
  item (up to `maxNewsPerDay`, default 6) — likely the dominant cost;
  5-20s per call is typical for this class of model/output length, so
  ~30-120s total for a handful of articles, more under load.
- Image resolution: interleaved into the same per-item loop as generation
  (not a separate stage); typically 1-5s per article.
- Integration normalization/delivery (WordPress-facing queries): **actually
  measured** via the real-DB script above — sub-100ms, negligible.

Net: a typical run generating a few articles is plausibly in the 40-150s
range; the existing 270s internal timeout suggests the original
implementers sized it for worst-case (max articles, slow API responses).
**Exact numbers require real production data.** Once a few real runs have
happened, run this against the production database:
```sql
SELECT id, "startedAt", "finishedAt", "generatedArticles",
       EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) AS duration_seconds
FROM pipeline_runs
WHERE "generatedArticles" > 0
ORDER BY "startedAt" DESC
LIMIT 20;
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| 401 in Status tab | API key mismatch — re-check both `WORDPRESS_INTEGRATION_API_KEY` (NewsMe) and the plugin's API Key field are exactly equal, no trailing whitespace. |
| Run takes a couple of minutes / button shows a rising elapsed-time counter | Expected — every run (manual **and** scheduled) forces a fresh NewsMe generation cycle via the start+poll loop, which can take up to ~280s total. This is normal, not a hang. |
| Admin-ajax or wp-cron request itself times out (not an individual HTTP call, the whole PHP process) | The WordPress host's PHP `max_execution_time` is lower than ~290s (common on shared hosting, often 30-60s by default) — raise it for admin-ajax/wp-cron requests, or ask your host to. If this happens but NewsMe actually finished the job server-side, the resulting articles are claimed under a 6h hold and will surface on the *next* run automatically — nothing is lost, just delayed. |
| No articles returned | NewsMe's own daily limit/budget/allowed-hours gates may have skipped generation entirely — check the response's `reason`/`status` fields, `stats.processed`/`stats.rejected`, and NewsMe's `PipelineRun` history in `/admin`. Also check the `categories` filter isn't excluding everything. |
| "Another pipeline run is already in progress" / `status: "already_running"` shown as a plain warning | The DB-backed lock is held — either NewsMe's own scheduler or another WordPress request is currently running. Expected under overlap and self-resolving; if it persists for many minutes with no other caller running, check for a crashed process holding a stale `PipelineLock` row (self-heals once ~300s pass with no heartbeat, regardless). |
| Poll loop times out after 280s | The run may still finish moments later on NewsMe's side — check the Status tab shortly, or poll the same `jobId` directly against `GET /pipeline/{jobId}?site=...`. |
| Image download failure | Logged as a warning in the run history; the post is still created without a featured image — check `error_log` for `image_failed`. |
| Cron not running | WP-Cron only fires on page load (no real system cron by default) — a low-traffic site may run its scheduled pipeline late. Ensure Schedule isn't "Manual", and that no external code has disabled `DISABLE_WP_CRON`. |
