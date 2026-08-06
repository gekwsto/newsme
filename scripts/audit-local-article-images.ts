/**
 * Dry-run audit script for local article images.
 * Identifies orphaned files, missing files, and duplicates.
 * NEVER deletes anything — prints a report only.
 *
 * Usage:
 *   npm run images:audit
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
  const prisma = new PrismaClient({ adapter });

  const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads', 'articles');

  try {
    console.log('\n[audit] scanning article image records…');

    // 1. Records with localImagePath set — verify files exist
    const withPath = await prisma.article.findMany({
      where: { localImagePath: { not: null } },
      select: { id: true, slug: true, localImagePath: true, coverImage: true, imageChecksum: true },
    });

    let missingFiles = 0;
    let validFiles = 0;
    let totalBytes = 0;

    const checksumMap = new Map<string, string[]>(); // checksum → article IDs

    for (const art of withPath) {
      const lp = art.localImagePath!;

      // Track checksums for duplicate detection
      if (art.imageChecksum) {
        const prev = checksumMap.get(art.imageChecksum) ?? [];
        prev.push(art.id);
        checksumMap.set(art.imageChecksum, prev);
      }

      try {
        const stat = await fs.stat(lp);
        totalBytes += stat.size;
        validFiles++;
      } catch {
        console.log(`  MISSING_FILE id=${art.id} slug="${art.slug}" path="${lp}"`);
        missingFiles++;
      }
    }

    // 2. Duplicate checksums
    const dupGroups = [...checksumMap.entries()].filter(([, ids]) => ids.length > 1);
    let dupFileCount = 0;
    for (const [ck, ids] of dupGroups) {
      console.log(`  DUPLICATE_CHECKSUM ${ck.slice(0, 8)} shared by ${ids.length} articles: ${ids.join(', ')}`);
      dupFileCount++;
    }

    // 3. Articles with external URLs still in coverImage
    const stillExternal = await prisma.article.count({
      where: {
        coverImage: { startsWith: 'http' },
        imageDownloadStatus: { not: 'SUCCESS' },
      },
    });

    // 4. Scan filesystem for orphaned files
    let orphanCount = 0;
    let orphanBytes = 0;
    const knownPaths = new Set(withPath.map(a => a.localImagePath!));

    async function scanDir(dir: string) {
      let entries: import('fs').Dirent<string>[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await scanDir(full);
        } else if (e.isFile()) {
          if (!knownPaths.has(full)) {
            try {
              const stat = await fs.stat(full);
              orphanBytes += stat.size;
              orphanCount++;
              console.log(`  ORPHAN_FILE path="${full}" size=${stat.size}`);
            } catch { /* ignore */ }
          }
        }
      }
    }

    try {
      await fs.access(UPLOADS_ROOT);
      await scanDir(UPLOADS_ROOT);
    } catch {
      console.log('  (no uploads/articles directory yet)');
    }

    // 5. Summary
    console.log(`
[audit] ── Summary ─────────────────────────────────────────`);
    console.log(`  Articles with local path:   ${withPath.length}`);
    console.log(`  Valid files on disk:         ${validFiles}`);
    console.log(`  Missing files:               ${missingFiles}`);
    console.log(`  Duplicate checksum groups:   ${dupFileCount}`);
    console.log(`  Still external (coverImage): ${stillExternal}`);
    console.log(`  Orphaned files on disk:      ${orphanCount}`);
    console.log(`  Total stored size:           ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Reclaimable (orphans):       ${(orphanBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  (no files were modified or deleted)\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[audit] fatal:', err);
  process.exit(1);
});
