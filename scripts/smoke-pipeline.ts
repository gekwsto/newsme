/**
 * Real RSS smoke test — no publishing, no DB writes.
 * Fetches live feeds, runs local + semantic filters, prints scored results.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fetchFeed } from '../src/lib/rss/fetcher';
import { computeLocalScore, getContentFiltersConfig } from '../src/lib/content-filter';
import { computeSemanticScore, getSemanticMatrixConfig } from '../src/lib/semantic-filter';
import { INTERNAL_TO_DISPLAY, DISPLAY_CATEGORIES } from '../src/config/categories';

// ── Category name (from semantic matrix) → internal slug ─────────────────────
const CAT_NAME_TO_SLUG: Record<string, string> = {
  'AI': 'ai',
  'Τεχνολογία': 'texnologia',
  'Οικονομία': 'oikonomia',
  'Επιχειρηματικότητα': 'epixeirimatikotita',
  'Ελλάδα': 'ellada',
  'Κόσμος': 'kosmos',
  'Αθλητικά': 'athlitika',
  'Καιρός': 'kairos',
  'Υγεία': 'ygeia',
  'Media': 'media',
  'Plus': 'plus',
};

function getDisplayName(catName: string | null): string {
  if (!catName) return '—';
  const slug = CAT_NAME_TO_SLUG[catName];
  if (!slug) return catName;
  const displaySlug = INTERNAL_TO_DISPLAY[slug];
  if (!displaySlug) return catName;
  return DISPLAY_CATEGORIES.find((c) => c.slug === displaySlug)?.name ?? catName;
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function padR(s: string, n: number) { return s.slice(0, n).padEnd(n); }
function padL(s: string | number, n: number) { return String(s).slice(0, n).padStart(n); }

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
  const db = new PrismaClient({ adapter });

  // ── Load config ─────────────────────────────────────────────────────────────
  const semanticConfig = getSemanticMatrixConfig();
  const localConfig = getContentFiltersConfig();
  const settings = await db.newsAutomationSettings.findFirst().catch(() => null);
  const compoundThreshold = settings?.compoundScoreThreshold ?? 45;

  // ── Load active RSS feeds ────────────────────────────────────────────────────
  const feeds = await db.rssSource.findMany({
    where: { enabled: true, allowAutoGeneration: true },
    select: {
      name: true,
      url: true,
      reliabilityScore: true,
      category: { select: { name: true, slug: true } },
    },
  });

  await db.$disconnect();

  console.log(`\n═══ NewsMe Pipeline Smoke Test ═══`);
  console.log(`Feeds: ${feeds.map((f) => f.name).join(', ')}`);
  console.log(`compoundThreshold: ${compoundThreshold}  |  semanticMin: ${semanticConfig.thresholds.minSemanticScore}`);
  console.log(`Fetching ${feeds.length} feed(s)...\n`);

  // ── Fetch all feeds ──────────────────────────────────────────────────────────
  interface ScoredItem {
    title: string;
    source: string;
    localScore: number;
    semanticScore: number;
    compoundScore: number;
    assignedCategory: string | null;
    displayCategory: string;
    mustPassGroup: string | null;
    passed: boolean;
    rejectedAt: 'local' | 'compound' | null;
    filteredReason: string | null;
  }

  const results: ScoredItem[] = [];
  const seenTitles: string[] = [];

  for (const feed of feeds) {
    let items;
    try {
      items = await fetchFeed(feed.url);
    } catch (e) {
      console.error(`  ❌ ${feed.name}: ${(e as Error).message}`);
      continue;
    }
    console.log(`  ✓ ${feed.name}: ${items.length} items`);

    for (const item of items) {
      const id = `${feed.name}::${item.url}`;
      const catName = feed.category?.name ?? 'General';

      // Local pre-filter
      const local = computeLocalScore(
        {
          id,
          title: item.title,
          excerpt: item.excerpt || null,
          url: item.url,
          categoryName: catName,
          isPrioritySource: (feed.reliabilityScore ?? 0) >= 90,
        },
        localConfig,
        seenTitles
      );

      if (!local.shouldIgnore) seenTitles.push(item.title);

      if (local.shouldIgnore) {
        results.push({
          title: item.title,
          source: feed.name,
          localScore: local.localScore,
          semanticScore: 0,
          compoundScore: 0,
          assignedCategory: null,
          displayCategory: '—',
          mustPassGroup: null,
          passed: false,
          rejectedAt: 'local',
          filteredReason: local.filteredReason,
        });
        continue;
      }

      // Semantic filter
      const semantic = computeSemanticScore(
        {
          id,
          title: item.title,
          excerpt: item.excerpt || null,
          reliabilityScore: feed.reliabilityScore ?? undefined,
          categoryName: catName,
        },
        semanticConfig
      );

      const compound = Math.round(local.localScore * 0.4 + semantic.semanticScore * 0.6);
      const passed = compound >= compoundThreshold;

      results.push({
        title: item.title,
        source: feed.name,
        localScore: local.localScore,
        semanticScore: semantic.semanticScore,
        compoundScore: compound,
        assignedCategory: semantic.assignedCategory,
        displayCategory: getDisplayName(semantic.assignedCategory),
        mustPassGroup: semantic.mustPassGroupTriggered
          ? `${semantic.mustPassGroupTriggered.groupName}: ${semantic.mustPassGroupTriggered.matchedTags.join(', ')}`
          : null,
        passed,
        rejectedAt: passed ? null : 'compound',
        filteredReason: passed ? null : `compound ${compound} < ${compoundThreshold}`,
      });
    }
  }

  // ── Sort & split ─────────────────────────────────────────────────────────────
  const passed = results
    .filter((r) => r.passed)
    .sort((a, b) => b.compoundScore - a.compoundScore);

  const rejected = results
    .filter((r) => !r.passed)
    .sort((a, b) => b.localScore - a.localScore);

  // ── Print passing table ───────────────────────────────────────────────────────
  const TOP_N = Math.min(10, passed.length);
  console.log(`\n${'─'.repeat(120)}`);
  console.log(`PASSED SEMANTIC FILTER — top ${TOP_N} of ${passed.length}`);
  console.log(`${'─'.repeat(120)}`);
  console.log(
    `${'Title'.padEnd(55)} ${'Source'.padEnd(14)} ${'Internal Cat'.padEnd(18)} ${'Display'.padEnd(10)} ${'Loc'.padStart(4)} ${'Sem'.padStart(4)} ${'Cmp'.padStart(4)}  mustPass`
  );
  console.log('─'.repeat(120));

  for (const r of passed.slice(0, TOP_N)) {
    const mp = r.mustPassGroup ? `★ ${r.mustPassGroup}` : '';
    console.log(
      `${padR(r.title, 55)} ${padR(r.source, 14)} ${padR(r.assignedCategory ?? '—', 18)} ${padR(r.displayCategory, 10)} ${padL(r.localScore, 4)} ${padL(r.semanticScore, 4)} ${padL(r.compoundScore, 4)}  ${mp}`
    );
  }

  // ── Print rejected table ─────────────────────────────────────────────────────
  const BOTTOM_N = Math.min(5, rejected.length);
  console.log(`\n${'─'.repeat(120)}`);
  console.log(`FILTERED OUT — showing ${BOTTOM_N} of ${rejected.length} rejected`);
  console.log(`${'─'.repeat(120)}`);
  console.log(
    `${'Title'.padEnd(55)} ${'Source'.padEnd(14)} ${'At'.padEnd(8)} ${'Reason'.padEnd(40)}`
  );
  console.log('─'.repeat(120));

  for (const r of rejected.slice(0, BOTTOM_N)) {
    console.log(
      `${padR(r.title, 55)} ${padR(r.source, 14)} ${padR(r.rejectedAt ?? '?', 8)} ${truncate(r.filteredReason ?? '', 40)}`
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const total = results.length;
  const passCount = passed.length;
  const localRej = results.filter((r) => r.rejectedAt === 'local').length;
  const compoundRej = results.filter((r) => r.rejectedAt === 'compound').length;
  const mustPassCount = passed.filter((r) => r.mustPassGroup).length;

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`SUMMARY`);
  console.log(`  Total items fetched : ${total}`);
  console.log(`  Passed compound     : ${passCount} (${Math.round(passCount / total * 100)}%)`);
  console.log(`  Rejected @ local    : ${localRej}`);
  console.log(`  Rejected @ compound : ${compoundRej}`);
  console.log(`  mustPass triggered  : ${mustPassCount} of ${passCount} passing`);
  console.log(`${'═'.repeat(80)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
