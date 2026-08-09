/**
 * Real-DB smoke test for the delivery/dedup layer of the WordPress
 * integration, run directly against the local Postgres dev database.
 *
 * NOTE: this deliberately does NOT import runWordPressPipeline / the full
 * news-auto-pipeline module graph — that graph pulls in `server-only`
 * (a Next.js-bundler-only guard package that plain `tsx`/Node cannot
 * execute outside Next's webpack resolution) via select-featured-image.ts.
 * The orchestration logic (run-specific prioritization, MODE A/B fallback,
 * stats) is already covered by the 15 mocked unit tests in
 * __tests__/integrations/wordpress-pipeline-service.test.ts. This script
 * instead replicates the exact same Prisma queries pipeline.ts uses, to
 * verify the real schema/migration/constraints/normalize function against
 * a real database — the part mocks can't verify.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { ArticleStatus, SourceType, WordpressDeliveryStatus } from '@/generated/prisma/enums';
import { normalizeArticleForWordPress } from '@/lib/integrations/wordpress/normalize-article';

const TEST_SITE = 'onlinepress-smoketest';
const OTHER_SITE = 'onlinepress-smoketest-other';

const ELIGIBLE_ARTICLE_STATUSES = [ArticleStatus.DRAFT, ArticleStatus.APPROVED, ArticleStatus.PUBLISHED];
const ELIGIBLE_SOURCE_TYPES = [SourceType.RSS_SUMMARY, SourceType.AI_GENERATED, SourceType.AI_ASSISTED];
const REDELIVERY_WINDOW_MS = 6 * 60 * 60 * 1000;

const ARTICLE_SELECT = {
  id: true, title: true, slug: true, content: true, excerpt: true,
  seoTitle: true, seoDescription: true, publishedAt: true,
  coverImage: true, generatedImageUrl: true, imageAttribution: true,
  category: { select: { slug: true, name: true } },
  tags: { select: { tag: { select: { name: true } } } },
} as const;

async function fetchPending(site: string, limit: number) {
  const redeliveryCutoff = new Date(Date.now() - REDELIVERY_WINDOW_MS);
  const baseWhere = { status: { in: ELIGIBLE_ARTICLE_STATUSES }, sourceType: { in: ELIGIBLE_SOURCE_TYPES } };
  const notDelivered = {
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
  return prisma.article.findMany({ where: { ...baseWhere, ...notDelivered }, orderBy: { createdAt: 'asc' }, take: limit, select: ARTICLE_SELECT });
}

async function claim(site: string, articleId: string) {
  return prisma.wordpressDelivery.upsert({
    where: { site_articleId: { site, articleId } },
    create: { site, articleId, status: WordpressDeliveryStatus.SENT },
    update: { status: WordpressDeliveryStatus.SENT, wordpressPostId: null, wordpressUrl: null, ackAt: null, ackError: null },
  });
}

async function main() {
  console.log('--- Step 0: DB snapshot ---');
  console.log({
    articleCount: await prisma.article.count(),
    eligible: await prisma.article.count({ where: { status: { in: ELIGIBLE_ARTICLE_STATUSES }, sourceType: { in: ELIGIBLE_SOURCE_TYPES } } }),
  });

  console.log('\n--- Step 1: first fetch for TEST_SITE (real query against real DB) ---');
  const firstBatch = await fetchPending(TEST_SITE, 1);
  console.log(`returned ${firstBatch.length} article(s)`);
  if (firstBatch.length === 0) {
    console.log('No eligible article in this dev DB. Cannot continue.');
    return;
  }
  const article = firstBatch[0];
  await claim(TEST_SITE, article.id);
  const normalized = normalizeArticleForWordPress(article);
  console.log(JSON.stringify(normalized, null, 2));

  console.log('\n--- Step 2: source attribution check on the FINAL normalized content ---');
  const hasAttribution = /Πηγή:|Αρχικό άρθρο|Source:/i.test(normalized.content);
  console.log({ externalId: normalized.externalId, contentLength: normalized.content.length, hasAttribution });
  if (hasAttribution) {
    console.error('FAIL: source attribution leaked into normalized content!');
    process.exitCode = 1;
  }

  console.log('\n--- Step 3: delivery row exists for [site, articleId] ---');
  const delivery = await prisma.wordpressDelivery.findUnique({ where: { site_articleId: { site: TEST_SITE, articleId: article.id } } });
  console.log(delivery);

  console.log('\n--- Step 4: second fetch, same site — must NOT return the same article again (dedup) ---');
  const secondBatch = await fetchPending(TEST_SITE, 1);
  console.log(`returned ${secondBatch.length} article(s)`);
  if (secondBatch.some((a) => a.id === article.id)) {
    console.error('FAIL: duplicate delivery — the same article was returned again for the same site!');
    process.exitCode = 1;
  }

  console.log('\n--- Step 5: simulate ACK (published) ---');
  await prisma.wordpressDelivery.updateMany({
    where: { site: TEST_SITE, articleId: article.id },
    data: { status: WordpressDeliveryStatus.PUBLISHED, wordpressPostId: 999, wordpressUrl: 'https://onlinepress.gr/test-post', ackAt: new Date() },
  });
  console.log(await prisma.wordpressDelivery.findUnique({ where: { site_articleId: { site: TEST_SITE, articleId: article.id } } }));

  console.log('\n--- Step 6: a DIFFERENT site can independently claim the SAME article (per-site, not global, dedup) ---');
  const otherSiteBatch = await fetchPending(OTHER_SITE, 1);
  const sameArticleForOtherSite = otherSiteBatch.some((a) => a.id === article.id);
  console.log({ returnedForOtherSite: otherSiteBatch.length, sameArticleClaimableAgain: sameArticleForOtherSite });
  if (!sameArticleForOtherSite) {
    console.error('FAIL: expected the article to still be claimable by a different site.');
    process.exitCode = 1;
  }

  console.log('\n--- Cleanup: removing test delivery rows (test sites only, real article/data untouched) ---');
  const c1 = await prisma.wordpressDelivery.deleteMany({ where: { site: TEST_SITE } });
  const c2 = await prisma.wordpressDelivery.deleteMany({ where: { site: OTHER_SITE } });
  console.log({ cleanedUp: c1.count + c2.count });

  console.log(process.exitCode === 1 ? '\nSMOKE TEST: FAIL' : '\nSMOKE TEST: PASS');
}

main()
  .catch((err) => {
    console.error('SMOKE TEST FAILED', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
