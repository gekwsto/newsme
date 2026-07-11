/**
 * import-semantic-config.ts
 *
 * Safe, idempotent import of semantic-matrix.json + semantic-tags.json into the DB.
 *
 * Rules:
 *  - Never deletes existing records
 *  - Upsert by unique name/slug
 *  - Maps SemanticTags → existing Tag (article) and ImageTag where name matches
 *  - Creates a SemanticConfigVersion snapshot on each run
 *  - Reports created / updated / skipped / conflicts per entity type
 *
 * Usage:
 *   npx ts-node --esm scripts/import-semantic-config.ts
 *   # or with tsx:
 *   npx tsx scripts/import-semantic-config.ts
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Prisma setup (same pattern as smoke-pipeline.ts) ─────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// ─── Types from config files ───────────────────────────────────────────────────

interface MatrixCategory {
  weight: number;
  priorityEntities?: string[];
  keywords: string[];
  mustPassTagGroups?: Record<string, {
    tags: string[];
    requiredMatches: number;
    mustPassScore: number;
  }>;
}

interface MatrixConfig {
  thresholds: Record<string, number>;
  categories: Record<string, MatrixCategory>;
}

interface SemanticTagEntry {
  tag: string;
  category: string;
  aliases: string[];
  weight?: number;
  priority?: boolean;
}

interface SemanticTagsConfig {
  settings: Record<string, number>;
  tags: SemanticTagEntry[];
}

// ─── Greek transliteration ────────────────────────────────────────────────────

const GREEK_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i',
  θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y',
  φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .split('')
    .map((ch) => GREEK_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ─── Report counters ───────────────────────────────────────────────────────────

interface Report {
  categories: { created: number; updated: number; skipped: number };
  tags: { created: number; updated: number; skipped: number };
  aliases: { created: number; skipped: number; conflict: string[] };
  tagMappings: { articleTag: number; imageTag: number };
}

const report: Report = {
  categories: { created: 0, updated: 0, skipped: 0 },
  tags: { created: 0, updated: 0, skipped: 0 },
  aliases: { created: 0, skipped: 0, conflict: [] },
  tagMappings: { articleTag: 0, imageTag: 0 },
};

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔄  Starting semantic config import...\n');

  // ── Load JSON configs ──────────────────────────────────────────────────────
  const matrixPath = path.join(process.cwd(), 'config/semantic-matrix.json');
  const tagsPath = path.join(process.cwd(), 'config/semantic-tags.json');

  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf-8')) as MatrixConfig;
  const tagsConfig = JSON.parse(fs.readFileSync(tagsPath, 'utf-8')) as SemanticTagsConfig;

  console.log(`📂  Loaded matrix: ${Object.keys(matrix.categories).length} categories`);
  console.log(`📂  Loaded tags:   ${tagsConfig.tags.length} canonical tags\n`);

  // ── Load existing DB article Categories for mapping ────────────────────────
  const dbCategories = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });
  const dbCategoryByName = new Map(dbCategories.map((c) => [c.name.toLowerCase(), c]));
  const dbCategoryBySlug = new Map(dbCategories.map((c) => [c.slug.toLowerCase(), c]));

  // ── Load existing Tags for mapping ────────────────────────────────────────
  const dbTags = await prisma.tag.findMany({ select: { id: true, name: true } });
  const dbTagByName = new Map(dbTags.map((t) => [t.name.toLowerCase(), t.id]));

  // ── Load existing ImageTags for mapping ───────────────────────────────────
  const dbImageTags = await prisma.imageTag.findMany({ select: { id: true, name: true, slug: true } });
  const dbImageTagByName = new Map(dbImageTags.map((t) => [t.name.toLowerCase(), t.id]));

  // ── Step 1: Upsert SemanticCategories from semantic-matrix.json ───────────
  console.log('── Step 1: SemanticCategories ────────────────────────');
  const semCategoryById = new Map<string, string>(); // semCategory.name → semCategory.id

  for (const [catName, catCfg] of Object.entries(matrix.categories)) {
    const slug = toSlug(catName);

    // Attempt to find matching DB article category
    const dbCat =
      dbCategoryByName.get(catName.toLowerCase()) ??
      dbCategoryBySlug.get(slug);

    const existing = await prisma.semanticCategory.findFirst({
      where: { OR: [{ name: catName }, { slug }] },
    });

    if (existing) {
      // Update weight if changed
      if (existing.weight !== catCfg.weight) {
        await prisma.semanticCategory.update({
          where: { id: existing.id },
          data: { weight: catCfg.weight },
        });
        console.log(`  ↻  ${catName} (weight ${existing.weight} → ${catCfg.weight})`);
        report.categories.updated++;
      } else {
        report.categories.skipped++;
      }
      semCategoryById.set(catName, existing.id);
    } else {
      const created = await prisma.semanticCategory.create({
        data: {
          name: catName,
          slug,
          weight: catCfg.weight,
          isActive: true,
          ...(dbCat ? { categoryId: dbCat.id } : {}),
        },
      });
      console.log(`  ✚  ${catName} (slug: ${slug})${dbCat ? ` → Category "${dbCat.name}"` : ''}`);
      report.categories.created++;
      semCategoryById.set(catName, created.id);
    }
  }

  // ── Step 2: Upsert SemanticTags + aliases from semantic-tags.json ─────────
  console.log('\n── Step 2: SemanticTags ─────────────────────────────');

  for (const entry of tagsConfig.tags) {
    const semCatId = semCategoryById.get(entry.category);
    if (!semCatId) {
      console.warn(`  ⚠  Category "${entry.category}" not found for tag "${entry.tag}" — skipping`);
      continue;
    }

    const slug = toSlug(entry.tag);

    // Attempt to map to existing article Tag
    const articleTagId = dbTagByName.get(entry.tag.toLowerCase()) ?? null;
    // Attempt to map to existing ImageTag
    const imageTagId = dbImageTagByName.get(entry.tag.toLowerCase()) ?? null;

    const existing = await prisma.semanticTag.findFirst({
      where: { OR: [{ name: entry.tag }, { slug }] },
    });

    let semTagId: string;

    if (existing) {
      // Update mutable fields
      await prisma.semanticTag.update({
        where: { id: existing.id },
        data: {
          weight: entry.weight ?? 1.0,
          isPriority: entry.priority ?? false,
          bonus: entry.priority ? 25 : 0,
          semanticCategoryId: semCatId,
          // Only set mapping if currently null (don't overwrite manual mappings)
          ...(existing.tagId === null && articleTagId ? { tagId: articleTagId } : {}),
          ...(existing.imageTagId === null && imageTagId ? { imageTagId } : {}),
        },
      });
      semTagId = existing.id;
      report.tags.updated++;
    } else {
      const created = await prisma.semanticTag.create({
        data: {
          name: entry.tag,
          slug,
          semanticCategoryId: semCatId,
          weight: entry.weight ?? 1.0,
          isPriority: entry.priority ?? false,
          bonus: entry.priority ? 25 : 0,
          isActive: true,
          useForArticleTagging: true,
          useForImageMatching: true,
          useForRelatedArticles: false,
          ...(articleTagId ? { tagId: articleTagId } : {}),
          ...(imageTagId ? { imageTagId } : {}),
        },
      });
      semTagId = created.id;
      console.log(`  ✚  [${entry.category}] ${entry.tag}${articleTagId ? ' →Tag' : ''}${imageTagId ? ' →ImageTag' : ''}`);
      report.tags.created++;
      if (articleTagId) report.tagMappings.articleTag++;
      if (imageTagId) report.tagMappings.imageTag++;
    }

    // ── Step 2b: Upsert aliases ──────────────────────────────────────────
    for (const alias of entry.aliases) {
      if (!alias.trim()) continue;

      // Check for cross-tag conflict (same alias text assigned to a different tag)
      const conflictCheck = await prisma.semanticTagAlias.findFirst({
        where: { alias: alias.trim(), semanticTagId: { not: semTagId } },
        include: { semanticTag: { select: { name: true } } },
      });
      if (conflictCheck) {
        const msg = `"${alias}" (tag: "${entry.tag}") conflicts with tag "${conflictCheck.semanticTag.name}"`;
        report.aliases.conflict.push(msg);
        continue;
      }

      const existingAlias = await prisma.semanticTagAlias.findFirst({
        where: { semanticTagId: semTagId, alias: alias.trim() },
      });

      if (!existingAlias) {
        await prisma.semanticTagAlias.create({
          data: { semanticTagId: semTagId, alias: alias.trim() },
        });
        report.aliases.created++;
      } else {
        report.aliases.skipped++;
      }
    }
  }

  // ── Step 3: Create SemanticConfigVersion snapshot ─────────────────────────
  console.log('\n── Step 3: SemanticConfigVersion snapshot ───────────');

  const maxVersion = await prisma.semanticConfigVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (maxVersion?.version ?? 0) + 1;

  const snapshot = {
    importedAt: new Date().toISOString(),
    matrix: { categories: Object.keys(matrix.categories), thresholds: matrix.thresholds },
    semanticTagsSettings: tagsConfig.settings,
    tagCount: tagsConfig.tags.length,
    report,
  };

  // Mark all previous versions inactive
  await prisma.semanticConfigVersion.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  await prisma.semanticConfigVersion.create({
    data: {
      version: nextVersion,
      description: `Import from semantic-matrix.json + semantic-tags.json`,
      snapshot: snapshot as unknown as never,
      isActive: true,
      createdBy: 'import',
    },
  });
  console.log(`  ✚  Version ${nextVersion} snapshot created`);

  // ── Step 4: Audit log entry ────────────────────────────────────────────────
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticConfigVersion',
      entityId: `v${nextVersion}`,
      action: 'import',
      after: snapshot as unknown as never,
    },
  });

  // ── Final report ───────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════');
  console.log('  IMPORT REPORT');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Categories : +${report.categories.created} created, ${report.categories.updated} updated, ${report.categories.skipped} skipped`);
  console.log(`  Tags       : +${report.tags.created} created, ${report.tags.updated} updated, ${report.tags.skipped} skipped`);
  console.log(`  Aliases    : +${report.aliases.created} created, ${report.aliases.skipped} skipped`);
  console.log(`  Mappings   : ${report.tagMappings.articleTag} article tags, ${report.tagMappings.imageTag} image tags`);
  if (report.aliases.conflict.length > 0) {
    console.log(`\n  ⚠  ALIAS CONFLICTS (${report.aliases.conflict.length}):`);
    report.aliases.conflict.forEach((c) => console.log(`    - ${c}`));
  } else {
    console.log('  ✓  No alias conflicts');
  }
  console.log('════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
