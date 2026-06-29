import 'server-only';

import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/db';

const MAX_PER_IMPORT = 80;
const PEXELS_API = 'https://api.pexels.com/v1/search';

interface RawPexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
}

interface PexelsSearchResponse {
  photos: RawPexelsPhoto[];
  total_results: number;
}

export interface ImportFromPexelsParams {
  categoryId: string;
  tagId?: string | null;
  query: string;
  perPage: number;
}

export interface ImportFromPexelsResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function sanitizePathSegment(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

async function fetchPexelsPage(query: string, perPage: number): Promise<RawPexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY is not set');

  const url = new URL(PEXELS_API);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(Math.min(perPage, MAX_PER_IMPORT)));
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pexels API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as PexelsSearchResponse;
  return data.photos ?? [];
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

export async function importFromPexels(params: ImportFromPexelsParams): Promise<ImportFromPexelsResult> {
  const { categoryId, tagId, query, perPage } = params;
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const [category, tag] = await Promise.all([
    prisma.imageCategory.findUnique({ where: { id: categoryId }, select: { slug: true } }),
    tagId ? prisma.imageTag.findUnique({ where: { id: tagId }, select: { slug: true } }) : Promise.resolve(null),
  ]);

  if (!category) throw new Error('Image category not found');

  const catSlug = sanitizePathSegment(category.slug);
  const tagSlug = tag ? sanitizePathSegment(tag.slug) : '_untagged';
  const relDir = path.join('uploads', 'images', catSlug, tagSlug);
  const absDir = path.join(process.cwd(), 'public', relDir);

  await fs.mkdir(absDir, { recursive: true });

  let photos: RawPexelsPhoto[] = [];
  try {
    photos = await fetchPexelsPage(query, Math.min(perPage, MAX_PER_IMPORT));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pexels-import] fetch error:', msg);
    return { imported: 0, skipped: 0, errors: [msg] };
  }

  for (const photo of photos) {
    try {
      const existing = await prisma.imageAsset.findUnique({ where: { pexelsId: photo.id } });
      if (existing) {
        skipped++;
        continue;
      }

      const filename = `${photo.id}.jpg`;
      const absPath = path.join(absDir, filename);
      const publicUrl = `/${relDir.replace(/\\/g, '/')}/${filename}`;

      const downloadUrl = photo.src.large2x || photo.src.large || photo.src.original;
      await downloadImage(downloadUrl, absPath);

      await prisma.imageAsset.create({
        data: {
          categoryId,
          tagId: tagId || null,
          pexelsId: photo.id,
          uploadSource: 'pexels',
          localPath: absPath,
          publicUrl,
          originalUrl: downloadUrl,
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          pexelsUrl: photo.url,
          width: photo.width,
          height: photo.height,
          altText: photo.alt || query,
        },
      });

      imported++;
      console.log(`[pexels-import] saved: pexelsId=${photo.id} → ${publicUrl}`);
    } catch (err) {
      const msg = `pexelsId=${photo.id}: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[pexels-import] error:', msg);
      errors.push(msg);
    }
  }

  return { imported, skipped, errors };
}
