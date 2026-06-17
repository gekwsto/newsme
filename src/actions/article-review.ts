'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

export type VerdictResult = { ok: true } | { ok: false; error: string };

export async function setHumanVerdict(
  articleId: string,
  verdict: 'accepted' | 'rejected',
  note?: string
): Promise<VerdictResult> {
  try {
    await requireAuth();
    await prisma.discoveredArticle.update({
      where: { id: articleId },
      data: {
        humanVerdict: verdict,
        humanVerdictAt: new Date(),
        humanVerdictNote: note ?? null,
      },
    });
    revalidatePath('/admin/article-review');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function clearHumanVerdict(articleId: string): Promise<VerdictResult> {
  try {
    await requireAuth();
    await prisma.discoveredArticle.update({
      where: { id: articleId },
      data: { humanVerdict: null, humanVerdictAt: null, humanVerdictNote: null },
    });
    revalidatePath('/admin/article-review');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export interface FetchResult {
  ok: boolean;
  fetched: number;
  newArticles: number;
  error?: string;
}

export async function fetchArticlesForReview(): Promise<FetchResult> {
  try {
    await requireAuth();

    const sources = await prisma.rssSource.findMany({
      where: { enabled: true },
      select: { id: true, name: true, url: true, categoryId: true },
    });

    let fetched = 0;
    let newArticles = 0;

    for (const source of sources) {
      try {
        const items = await fetchFeed(source.url);
        fetched += items.length;

        for (const item of items.slice(0, 15)) {
          if (!item.url || !item.title) continue;
          const exists = await prisma.discoveredArticle.findUnique({ where: { url: item.url } });
          if (exists) continue;

          await prisma.discoveredArticle.create({
            data: {
              sourceId: source.id,
              title: item.title,
              url: item.url,
              excerpt: item.excerpt ?? null,
              imageUrl: item.imageUrl ?? null,
              categoryId: source.categoryId,
            },
          });
          newArticles++;
        }
      } catch {
        // skip failed feeds silently
      }
    }

    revalidatePath('/admin/article-review');
    return { ok: true, fetched, newArticles };
  } catch (err) {
    return { ok: false, fetched: 0, newArticles: 0, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}
