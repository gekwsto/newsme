/**
 * Backfill script: download external article cover images to local storage.
 *
 * Usage:
 *   npm run images:backfill               # process all eligible articles
 *   npm run images:backfill -- --dry-run  # preview without downloading
 *   npm run images:backfill -- --limit=50
 *   npm run images:backfill -- --article-id=<cuid>
 *   npm run images:backfill -- --concurrency=3
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Minimal inline SSRF guard (same rules as the main service)
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal']);
const PRIVATE_IP_RE = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
];
function isSafeUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'invalid URL' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `bad protocol: ${url.protocol}` };
  const h = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h) || h.endsWith('.internal') || h.endsWith('.local')) return { ok: false, reason: `blocked host: ${h}` };
  if (PRIVATE_IP_RE.some(re => re.test(h))) return { ok: false, reason: `private IP: ${h}` };
  return { ok: true };
}

function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

function safeSlug(s: string): string {
  return s.toLowerCase().replace(/[^\x00-\x7F]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'img';
}

function buildPublicPath(slug: string, id: string, ext: string) {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const filename = `${safeSlug(slug)}-${id.slice(-6)}${ext}`;
  const relDir = `uploads/articles/${yyyy}/${mm}`;
  const absDir = path.join(process.cwd(), 'public', relDir);
  return {
    absDir,
    absPath: path.join(absDir, filename),
    publicUrl: `/${relDir}/${filename}`,
  };
}

async function downloadBuffer(url: string): Promise<{ buf: Buffer; mime: string | null } | { error: string }> {
  const MAX_SIZE = 10 * 1024 * 1024;
  const TIMEOUT_MS = 20_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current = url;
    let redirects = 0;
    while (true) {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'NewsMe/1.0 image backfill' },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (++redirects > 3) { clearTimeout(timer); return { error: 'too many redirects' }; }
        const loc = res.headers.get('location');
        if (!loc) { clearTimeout(timer); return { error: 'redirect no location' }; }
        current = new URL(loc, current).href;
        continue;
      }
      if (!res.ok) { clearTimeout(timer); return { error: `HTTP ${res.status}` }; }

      const ct = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (ct && !ct.startsWith('image/')) { clearTimeout(timer); return { error: `bad content-type: ${ct}` }; }

      const reader = res.body?.getReader();
      if (!reader) { clearTimeout(timer); return { error: 'no body' }; }
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_SIZE) { reader.cancel().catch(() => {}); clearTimeout(timer); return { error: 'too large' }; }
        chunks.push(Buffer.from(value));
      }
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      return { buf, mime: detectMime(buf) };
    }
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return { error: isAbort ? 'timeout' : (err instanceof Error ? err.message : String(err)) };
  }
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : null;
}
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(flag('limit') ?? '0', 10) || 0;
const ARTICLE_ID = flag('article-id');
const CONCURRENCY = Math.max(1, Math.min(5, parseInt(flag('concurrency') ?? '2', 10)));

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const sharp = (await import('sharp')).default;
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
  const prisma = new PrismaClient({ adapter });

  console.log(`\n[backfill] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} concurrency=${CONCURRENCY} limit=${LIMIT || 'none'}`);

  try {
    const where: Record<string, unknown> = {
      // Articles that have an external image but no local copy yet
      imageDownloadStatus: { not: 'SUCCESS' },
      OR: [
        { coverImage: { startsWith: 'http' } },
        { suggestedImageUrl: { not: null } },
      ],
    };
    if (ARTICLE_ID) {
      Object.assign(where, { id: ARTICLE_ID });
    }

    const articles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        slug: true,
        coverImage: true,
        suggestedImageUrl: true,
        originalImageUrl: true,
        localImagePath: true,
        imageChecksum: true,
        imageDownloadStatus: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: LIMIT > 0 ? LIMIT : undefined,
    });

    console.log(`[backfill] found ${articles.length} eligible articles\n`);

    const stats = { ok: 0, dedup: 0, skip: 0, fail: 0, dry: 0 };

    // Process in batches of CONCURRENCY
    for (let i = 0; i < articles.length; i += CONCURRENCY) {
      const batch = articles.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (art) => {
        const sourceUrl = (art.coverImage?.startsWith('http') ? art.coverImage : null)
          ?? art.originalImageUrl
          ?? art.suggestedImageUrl;

        if (!sourceUrl) {
          console.log(`[backfill] skip id=${art.id} reason=no_source_url`);
          stats.skip++;
          return;
        }

        const safeCheck = isSafeUrl(sourceUrl);
        if (!safeCheck.ok) {
          console.log(`[backfill] skip id=${art.id} reason=ssrf url="${sourceUrl}" (${safeCheck.reason})`);
          stats.skip++;
          return;
        }

        if (DRY_RUN) {
          console.log(`[backfill] DRY-RUN id=${art.id} slug="${art.slug}" url="${sourceUrl}"`);
          stats.dry++;
          return;
        }

        // Download
        const dlRes = await downloadBuffer(sourceUrl);
        if ('error' in dlRes) {
          console.warn(`[backfill] FAIL id=${art.id} error="${dlRes.error}" url="${sourceUrl}"`);
          await prisma.article.update({
            where: { id: art.id },
            data: { imageDownloadStatus: 'FAILED', imageDownloadError: dlRes.error.slice(0, 500) },
          });
          stats.fail++;
          return;
        }

        const { buf, mime } = dlRes;
        if (!mime) {
          console.warn(`[backfill] FAIL id=${art.id} reason=bad_magic url="${sourceUrl}"`);
          await prisma.article.update({
            where: { id: art.id },
            data: { imageDownloadStatus: 'FAILED', imageDownloadError: 'unrecognized image format' },
          });
          stats.fail++;
          return;
        }

        const checksum = crypto.createHash('sha256').update(buf).digest('hex');

        // Dedup check
        const existing = await prisma.article.findFirst({
          where: { imageChecksum: checksum, localImagePath: { not: null }, id: { not: art.id } },
          select: { localImagePath: true },
        });
        if (existing?.localImagePath) {
          try {
            await fs.access(existing.localImagePath);
            const pubDir = path.join(process.cwd(), 'public');
            const rel = path.relative(pubDir, existing.localImagePath).replace(/\\/g, '/');
            const publicUrl = `/${rel}`;
            console.log(`[backfill] DEDUP id=${art.id} -> ${publicUrl}`);
            await prisma.article.update({
              where: { id: art.id },
              data: {
                coverImage: publicUrl,
                originalImageUrl: sourceUrl,
                localImagePath: existing.localImagePath,
                imageChecksum: checksum,
                imageDownloadStatus: 'SUCCESS',
                imageDownloadedAt: new Date(),
              },
            });
            stats.dedup++;
            return;
          } catch {
            // file gone, fall through to normal processing
          }
        }

        // Process with sharp
        let processedBuf: Buffer;
        let width: number | undefined;
        let height: number | undefined;
        let ext: string;

        if (mime === 'image/gif') {
          processedBuf = buf;
          ext = '.gif';
        } else {
          try {
            const meta = await sharp(buf).metadata();
            width = meta.width;
            height = meta.height;
            let pipeline = sharp(buf, { failOn: 'error' }).rotate();
            if (width && width > 2000) {
              pipeline = pipeline.resize(2000, undefined, { withoutEnlargement: true, kernel: 'lanczos3' });
            }
            processedBuf = await pipeline.webp({ quality: 82 }).toBuffer();
            const outMeta = await sharp(processedBuf).metadata();
            width = outMeta.width ?? width;
            height = outMeta.height ?? height;
            ext = '.webp';
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[backfill] FAIL id=${art.id} reason=sharp error="${msg}"`);
            await prisma.article.update({
              where: { id: art.id },
              data: { imageDownloadStatus: 'FAILED', imageDownloadError: `sharp: ${msg}`.slice(0, 500) },
            });
            stats.fail++;
            return;
          }
        }

        const { absDir, absPath, publicUrl } = buildPublicPath(art.slug, art.id, ext);
        const tmpPath = absPath + '.tmp';

        try {
          await fs.mkdir(absDir, { recursive: true });
          await fs.writeFile(tmpPath, processedBuf);
          await fs.rename(tmpPath, absPath);
        } catch (err) {
          await fs.unlink(tmpPath).catch(() => {});
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[backfill] FAIL id=${art.id} reason=write error="${msg}"`);
          await prisma.article.update({
            where: { id: art.id },
            data: { imageDownloadStatus: 'FAILED', imageDownloadError: `write: ${msg}`.slice(0, 500) },
          });
          stats.fail++;
          return;
        }

        await prisma.article.update({
          where: { id: art.id },
          data: {
            coverImage: publicUrl,
            originalImageUrl: sourceUrl,
            localImagePath: absPath,
            imageChecksum: checksum,
            imageDownloadStatus: 'SUCCESS',
            imageDownloadedAt: new Date(),
            imageMimeType: mime === 'image/gif' ? 'image/gif' : 'image/webp',
            imageWidth: width ?? null,
            imageHeight: height ?? null,
            imageFileSize: processedBuf.length,
            imageDownloadError: null,
          },
        });

        console.log(`[backfill] OK id=${art.id} size=${processedBuf.length} path="${publicUrl}"`);
        stats.ok++;
      }));
    }

    console.log(`\n[backfill] done — ok=${stats.ok} dedup=${stats.dedup} skip=${stats.skip} fail=${stats.fail}${DRY_RUN ? ` dry=${stats.dry}` : ''}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
