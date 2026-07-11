/**
 * db-taxonomy-audit.ts — READ-ONLY full taxonomy audit.
 * Prints: Article Categories, Semantic Categories/Tags/Aliases,
 * Article Tags, Image Categories, Image Tags, body extraction stats.
 * Usage: npx tsx scripts/db-taxonomy-audit.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── 1. Article Categories ──────────────────────────────────────────────────
  const articleCats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  console.log('\n═══ ARTICLE CATEGORIES ════════════════════════════════════════');
  for (const c of articleCats) console.log(`  [${c.id}] ${c.name}  slug=${c.slug}`);

  // ── 2. Semantic Categories ─────────────────────────────────────────────────
  const semCats = await prisma.semanticCategory.findMany({
    orderBy: { name: 'asc' },
    include: { category: { select: { name: true, slug: true } }, _count: { select: { tags: true } } },
  });
  console.log('\n═══ SEMANTIC CATEGORIES ════════════════════════════════════════');
  for (const c of semCats) {
    console.log(`  [${c.id.slice(-6)}] ${c.name}  w=${c.weight}  active=${c.isActive}  tags=${c._count.tags}  → article_cat=${c.category?.name ?? 'UNMAPPED'}`);
  }
  console.log(`\n  UNMAPPED: ${semCats.filter(c => !c.categoryId).map(c => c.name).join(', ') || 'none'}`);

  // ── 3. Semantic Tags ───────────────────────────────────────────────────────
  const semTags = await prisma.semanticTag.findMany({
    orderBy: [{ semanticCategoryId: 'asc' }, { name: 'asc' }],
    include: {
      semanticCategory: { select: { name: true } },
      _count: { select: { aliases: { where: { isActive: true } } } },
      tag: { select: { name: true } },
      imageTag: { select: { name: true } },
    },
  });
  console.log('\n═══ SEMANTIC TAGS ══════════════════════════════════════════════');
  let prevCat = '';
  for (const t of semTags) {
    if (t.semanticCategory.name !== prevCat) {
      console.log(`\n  ── [${t.semanticCategory.name}] ──`);
      prevCat = t.semanticCategory.name;
    }
    const flags = [
      t.isActive ? '' : 'INACTIVE',
      t.isPriority ? 'PRIO' : '',
      t.useForArticleTagging ? 'art' : '',
      t.useForImageMatching ? 'img' : '',
    ].filter(Boolean).join(' ');
    console.log(`    ${t.name.padEnd(32)} aliases=${t._count.aliases}  w=${t.weight}  bonus=${t.bonus}  artTag=${t.tag?.name ?? '—'}  imgTag=${t.imageTag?.name ?? '—'}  [${flags}]`);
  }
  console.log(`\n  Total: ${semTags.length} tags, ${semTags.reduce((s,t)=>s+t._count.aliases,0)} active aliases`);
  console.log(`  With Article Tag: ${semTags.filter(t=>t.tagId).length}/${semTags.length}`);
  console.log(`  With Image Tag  : ${semTags.filter(t=>t.imageTagId).length}/${semTags.length}`);

  // ── 4. Existing Article Tags ───────────────────────────────────────────────
  const articleTags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
  console.log(`\n═══ ARTICLE TAGS (${articleTags.length}) ════════════════════════════════════`);
  for (const t of articleTags) console.log(`  [${t.id.slice(-6)}] "${t.name}"`);

  // ── 5. Image Categories ────────────────────────────────────────────────────
  const imgCats = await prisma.imageCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { tags: true, assets: true } } },
  });
  console.log(`\n═══ IMAGE CATEGORIES (${imgCats.length}) ════════════════════════════════════`);
  for (const c of imgCats) console.log(`  [${c.id.slice(-6)}] ${c.name}  slug=${c.slug}  tags=${c._count.tags}  assets=${c._count.assets}`);

  // ── 6. Image Tags ──────────────────────────────────────────────────────────
  const imgTags = await prisma.imageTag.findMany({
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    include: { category: { select: { name: true } }, _count: { select: { assets: true } } },
  });
  console.log(`\n═══ IMAGE TAGS (${imgTags.length}) ══════════════════════════════════════════`);
  let prevImgCat = '';
  for (const t of imgTags) {
    if (t.category.name !== prevImgCat) {
      console.log(`\n  ── [${t.category.name}] ──`);
      prevImgCat = t.category.name;
    }
    console.log(`    [${t.id.slice(-6)}] ${t.name.padEnd(30)} slug=${t.slug}  assets=${t._count.assets}`);
  }

  // ── 7. Body extraction stats ───────────────────────────────────────────────
  const [total, withBody, withSuccess, noBody, methodCounts] = await Promise.all([
    prisma.discoveredArticle.count(),
    prisma.discoveredArticle.count({ where: { sourceArticleBody: { not: null } } }),
    prisma.discoveredArticle.count({ where: { extractionSuccess: true } }),
    prisma.discoveredArticle.count({ where: { sourceArticleBody: null } }),
    prisma.discoveredArticle.groupBy({
      by: ['extractionMethod'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);
  const recent = await prisma.discoveredArticle.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { title: true, sourceArticleBody: true, extractionSuccess: true, extractionWordCount: true, extractionMethod: true, createdAt: true },
  });
  console.log(`\n═══ BODY EXTRACTION STATS ══════════════════════════════════════`);
  console.log(`  Total DiscoveredArticles : ${total}`);
  console.log(`  With body (not null)     : ${withBody} (${Math.round(withBody/total*100)}%)`);
  console.log(`  extractionSuccess=true   : ${withSuccess} (${Math.round(withSuccess/total*100)}%)`);
  console.log(`  Without body             : ${noBody} (${Math.round(noBody/total*100)}%)`);
  console.log(`  By method:`);
  for (const m of methodCounts) console.log(`    ${String(m.extractionMethod ?? 'null').padEnd(20)} : ${m._count.id}`);
  console.log(`\n  RECENT 20 articles:`);
  for (const a of recent) {
    console.log(`    [${a.createdAt.toISOString().slice(0,10)}] body=${a.sourceArticleBody ? `${a.extractionWordCount}w` : 'null'}  success=${a.extractionSuccess}  method=${a.extractionMethod}  "${a.title.slice(0,60)}"`);
  }

  // ── 8. Data safety baseline counts ────────────────────────────────────────
  const [articleCount, articleTagRelCount, tagCount, imageAssetCount, imageTagCount] = await Promise.all([
    prisma.article.count(),
    prisma.articleTag.count(),
    prisma.tag.count(),
    prisma.imageAsset.count(),
    prisma.imageTag.count(),
  ]);
  console.log(`\n═══ DATA SAFETY BASELINE ══════════════════════════════════════`);
  console.log(`  Articles           : ${articleCount}`);
  console.log(`  Article↔Tag rels   : ${articleTagRelCount}`);
  console.log(`  Tags               : ${tagCount}`);
  console.log(`  ImageAssets        : ${imageAssetCount}`);
  console.log(`  ImageTags          : ${imageTagCount}`);

  // ── 9. SemanticTag → Article Tag candidate matching ───────────────────────
  console.log(`\n═══ ARTICLE TAG MAPPING CANDIDATES ════════════════════════════`);
  const allTags = await prisma.tag.findMany({ select: { id: true, name: true } });
  const tagNameMap = new Map(allTags.map(t => [t.name.toLowerCase().trim(), t.id]));
  for (const st of semTags) {
    if (st.tagId) { console.log(`  ✓ ALREADY MAPPED: [${st.semanticCategory.name}] ${st.name} → "${st.tag?.name}"`); continue; }
    if (!st.useForArticleTagging) continue;
    const exactId = tagNameMap.get(st.name.toLowerCase().trim());
    if (exactId) console.log(`  EXACT MATCH : [${st.semanticCategory.name}] ${st.name} → existing tag "${st.name}"`);
  }

  // ── 10. SemanticTag → Image Tag candidate matching ────────────────────────
  console.log(`\n═══ IMAGE TAG MAPPING CANDIDATES ═══════════════════════════════`);
  const allImgTags = await prisma.imageTag.findMany({ select: { id: true, name: true, slug: true, categoryId: true } });
  const imgTagNameMap = new Map(allImgTags.map(t => [t.name.toLowerCase().trim(), t.id]));
  for (const st of semTags) {
    if (st.imageTagId) { console.log(`  ✓ ALREADY MAPPED: [${st.semanticCategory.name}] ${st.name} → "${st.imageTag?.name}"`); continue; }
    if (!st.useForImageMatching) continue;
    const exactId = imgTagNameMap.get(st.name.toLowerCase().trim());
    if (exactId) {
      const imgTag = allImgTags.find(t => t.id === exactId);
      console.log(`  EXACT MATCH : [${st.semanticCategory.name}] ${st.name} → imgTag "${imgTag?.name}" [${imgTag?.id.slice(-6)}]`);
    } else {
      console.log(`  NO MATCH    : [${st.semanticCategory.name}] ${st.name}`);
    }
  }

  // ── 11. Unmapped Semantic Tags not mapped anywhere ──────────────────────────
  console.log(`\n═══ UNMAPPED SEMANTIC TAGS (no articleTag AND no imageTag) ════`);
  const fullyUnmapped = semTags.filter(t => !t.tagId && !t.imageTagId);
  for (const t of fullyUnmapped) {
    console.log(`  [${t.semanticCategory.name}] ${t.name}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
