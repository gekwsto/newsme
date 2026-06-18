import 'server-only';

import { prisma } from '@/lib/db';

export interface SelectFeaturedImageParams {
  categorySlug: string;
  tags?: string[];
  articleTitle?: string;
  articleId?: string;
}

export interface FeaturedImageResult {
  publicUrl: string;
  altText: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
  imageAssetId: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

export async function selectFeaturedImage(
  params: SelectFeaturedImageParams
): Promise<FeaturedImageResult | null> {
  const { categorySlug, tags = [], articleTitle, articleId } = params;

  const tagSlugs = tags.map(slugify).filter(Boolean);
  const tagNames = tags.map((t) => t.toLowerCase().trim()).filter(Boolean);

  let assetId: string | null = null;

  // 1. Category + tag match (image tag slug or name matches any article tag)
  if (tagSlugs.length > 0) {
    const match = await prisma.imageAsset.findFirst({
      where: {
        isActive: true,
        category: { slug: categorySlug },
        tag: {
          OR: [
            { slug: { in: tagSlugs } },
            { name: { in: tagNames, mode: 'insensitive' } },
          ],
        },
      },
      orderBy: [
        { usedCount: 'asc' },
        { lastUsedAt: 'asc' },
      ],
      select: { id: true },
    });
    assetId = match?.id ?? null;
  }

  // 2. Fallback: category only
  if (!assetId) {
    const match = await prisma.imageAsset.findFirst({
      where: {
        isActive: true,
        category: { slug: categorySlug },
      },
      orderBy: [
        { usedCount: 'asc' },
        { lastUsedAt: 'asc' },
      ],
      select: { id: true },
    });
    assetId = match?.id ?? null;
  }

  // 3. Fallback: any active image
  if (!assetId) {
    const match = await prisma.imageAsset.findFirst({
      where: { isActive: true },
      orderBy: [
        { usedCount: 'asc' },
        { lastUsedAt: 'asc' },
      ],
      select: { id: true },
    });
    assetId = match?.id ?? null;
  }

  if (!assetId) return null;

  const now = new Date();

  const asset = await prisma.imageAsset.update({
    where: { id: assetId },
    data: {
      usedCount: { increment: 1 },
      lastUsedAt: now,
    },
    select: {
      id: true,
      publicUrl: true,
      altText: true,
      photographer: true,
      photographerUrl: true,
      pexelsUrl: true,
    },
  });

  if (articleId) {
    await prisma.articleImageUsage.create({
      data: { articleId, imageAssetId: asset.id },
    }).catch((err) => {
      console.warn('[select-featured-image] usage record failed:', err);
    });
  }

  return {
    publicUrl: asset.publicUrl,
    altText: articleTitle || asset.altText,
    photographer: asset.photographer,
    photographerUrl: asset.photographerUrl,
    pexelsUrl: asset.pexelsUrl,
    imageAssetId: asset.id,
  };
}
