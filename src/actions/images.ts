'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateArticleImage } from '@/lib/images/image-provider';
import { searchPexelsImages, searchPexelsWithFallback, type PexelsPhoto } from '@/lib/images/pexels-provider';
import { buildSmartImageQuery } from '@/lib/images/smart-query';

type ImageActionResult = { ok: true } | { ok: false; error: string };
type GenerateResult = { ok: true; url: string; cost: number } | { ok: false; error: string };

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

async function getArticleRoutes(articleId: string) {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    select: { slug: true, status: true, category: { select: { slug: true } } },
  });
  return a;
}

function revalidateArticlePaths(articleId: string, a: { slug: string; status: string; category: { slug: string } } | null) {
  revalidatePath(`/admin/articles/${articleId}/edit`);
  revalidatePath(`/admin/articles/${articleId}/preview`);
  if (a?.status === 'PUBLISHED') {
    revalidatePath(`/${a.category.slug}/${a.slug}`);
    revalidatePath(`/category/${a.category.slug}`);
    revalidatePath('/');
  }
}

export async function useRssImage(articleId: string): Promise<ImageActionResult> {
  try {
    await requireAuth();

    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { suggestedImageUrl: true, slug: true, status: true, category: { select: { slug: true } } },
    });

    if (!article.suggestedImageUrl) {
      return { ok: false, error: 'Δεν υπάρχει RSS εικόνα' };
    }

    await prisma.article.update({
      where: { id: articleId },
      data: {
        coverImage: article.suggestedImageUrl,
        generatedImageUrl: article.suggestedImageUrl,
        imageStatus: 'RSS_SELECTED',
        imageSource: 'RSS',
        imageProvider: 'rss',
        imageCostEstimate: 0,
      },
    });

    revalidateArticlePaths(articleId, article);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function generateAiImage(articleId: string): Promise<GenerateResult> {
  try {
    await requireAuth();

    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: {
        title: true,
        slug: true,
        status: true,
        category: { select: { name: true, slug: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });

    if (!['APPROVED', 'PUBLISHED'].includes(article.status)) {
      return { ok: false, error: 'Επιτρέπεται μόνο για εγκεκριμένα ή δημοσιευμένα άρθρα' };
    }

    await prisma.article.update({
      where: { id: articleId },
      data: { imageStatus: 'AI_PENDING' },
    });

    const tags = article.tags.map((t) => t.tag.name);
    const result = await generateArticleImage(article.title, article.category.name, tags);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        coverImage: result.url,
        generatedImageUrl: result.url,
        imageStatus: 'AI_GENERATED',
        imageSource: 'AI',
        imageProvider: result.model,
        imageCostEstimate: result.cost,
      },
    });

    revalidateArticlePaths(articleId, article);
    return { ok: true, url: result.url, cost: result.cost };
  } catch (err) {
    await prisma.article.update({
      where: { id: articleId },
      data: { imageStatus: 'AI_FAILED' },
    }).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα παραγωγής εικόνας' };
  }
}

export async function setManualImage(
  articleId: string,
  url: string,
  attribution?: string
): Promise<ImageActionResult> {
  try {
    await requireAuth();

    const article = await getArticleRoutes(articleId);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        coverImage: url,
        generatedImageUrl: url,
        imageStatus: 'MANUAL_UPLOADED',
        imageSource: 'MANUAL',
        imageProvider: 'manual',
        imageAttribution: attribution || null,
        imageCostEstimate: 0,
      },
    });

    revalidateArticlePaths(articleId, article);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export type PexelsSearchResult =
  | {
      ok: true;
      photos: PexelsPhoto[];
      primaryQuery: string;
      alternativeQueries: string[];
      reason: string;
      usedQuery: string;
    }
  | { ok: false; error: string };

export async function searchArticlePexels(articleId: string): Promise<PexelsSearchResult> {
  try {
    await requireAuth();

    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: {
        title: true,
        excerpt: true,
        content: true,
        seoTitle: true,
        category: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });

    const tags = article.tags.map((t) => t.tag.name);
    const smartQuery = await buildSmartImageQuery({
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      tags,
      categoryName: article.category.name,
      seoTitle: article.seoTitle,
    });

    const allQueries = [smartQuery.primaryQuery, ...smartQuery.alternativeQueries];
    const { photos, usedQuery } = await searchPexelsWithFallback(allQueries);

    return {
      ok: true,
      photos,
      primaryQuery: smartQuery.primaryQuery,
      alternativeQueries: smartQuery.alternativeQueries,
      reason: smartQuery.reason,
      usedQuery,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα Pexels' };
  }
}

export async function searchPexelsByCustomQuery(
  query: string
): Promise<{ ok: true; photos: PexelsPhoto[]; usedQuery: string } | { ok: false; error: string }> {
  try {
    await requireAuth();
    const trimmed = query.trim().split(/\s+/).slice(0, 4).join(' ');
    if (!trimmed) return { ok: false, error: 'Κενό query' };
    const photos = await searchPexelsImages(trimmed);
    return { ok: true, photos, usedQuery: trimmed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα Pexels' };
  }
}

export async function selectPexelsImage(
  articleId: string,
  photo: PexelsPhoto
): Promise<ImageActionResult> {
  try {
    await requireAuth();

    const article = await getArticleRoutes(articleId);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        coverImage: photo.imageUrl,
        generatedImageUrl: photo.imageUrl,
        imageStatus: 'MANUAL_UPLOADED',
        imageSource: 'PEXELS',
        imageProvider: 'Pexels',
        imageAttribution: `${photo.photographer} via Pexels`,
        imageCostEstimate: 0,
      },
    });

    revalidateArticlePaths(articleId, article);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function removeArticleImage(articleId: string): Promise<ImageActionResult> {
  try {
    await requireAuth();

    const article = await getArticleRoutes(articleId);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        coverImage: null,
        generatedImageUrl: null,
        imageStatus: 'NONE',
        imageSource: null,
        imageProvider: null,
        imageAttribution: null,
        imageCostEstimate: null,
      },
    });

    revalidateArticlePaths(articleId, article);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}
