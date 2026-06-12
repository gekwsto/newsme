'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, SERVICE } from '@/lib/monitoring/events';
import { ArticleStatus, SocialPostStatus, QueueItemStatus } from '@/generated/prisma/enums';

type Result = { ok: true } | { ok: false; error: string };

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

function revalidateQueue() {
  revalidatePath('/admin/publishing-queue');
  revalidatePath('/admin/approvals');
}

export async function addToQueue(articleId: string): Promise<Result> {
  try {
    await requireAuth();

    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: {
        status: true,
        title: true,
        publishQueueItems: {
          where: { status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] } },
          select: { id: true },
        },
        socialPosts: {
          where: {
            platform: 'FACEBOOK',
            status: { in: [SocialPostStatus.APPROVED, SocialPostStatus.DRAFT] },
            publishQueueItem: null,
          },
          select: { id: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!['APPROVED', 'PUBLISHED'].includes(article.status)) {
      return { ok: false, error: 'Μόνο εγκεκριμένα ή δημοσιευμένα άρθρα μπορούν να μπουν στην ουρά' };
    }

    if (article.publishQueueItems.length > 0) {
      return { ok: false, error: 'Το άρθρο είναι ήδη στην ουρά' };
    }

    const lastItem = await prisma.publishQueueItem.findFirst({
      where: { status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] } },
      orderBy: { queuePosition: 'desc' },
      select: { queuePosition: true },
    });

    const nextPosition = (lastItem?.queuePosition ?? 0) + 1;
    const fbPost = article.socialPosts[0];

    await prisma.publishQueueItem.create({
      data: {
        articleId,
        socialPostId: fbPost?.id ?? null,
        queuePosition: nextPosition,
        priority: nextPosition,
        status: QueueItemStatus.QUEUED,
      },
    });

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_add',
      status: 'OK',
      message: `Added to queue: "${article.title}"`,
      metadata: { articleId, hasFbPost: Boolean(fbPost), position: nextPosition },
    });

    revalidateQueue();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function removeFromQueue(queueItemId: string): Promise<Result> {
  try {
    await requireAuth();

    const item = await prisma.publishQueueItem.findUniqueOrThrow({
      where: { id: queueItemId },
      select: { queuePosition: true, article: { select: { title: true } } },
    });

    await prisma.publishQueueItem.update({
      where: { id: queueItemId },
      data: { status: QueueItemStatus.CANCELLED },
    });

    // Compact positions for remaining items
    const remaining = await prisma.publishQueueItem.findMany({
      where: {
        status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] },
        queuePosition: { gt: item.queuePosition },
      },
      orderBy: { queuePosition: 'asc' },
    });
    for (const r of remaining) {
      await prisma.publishQueueItem.update({
        where: { id: r.id },
        data: { queuePosition: r.queuePosition - 1 },
      });
    }

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_remove',
      status: 'OK',
      message: `Removed from queue: "${item.article.title}"`,
      metadata: { queueItemId },
    });

    revalidateQueue();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function moveQueueItem(queueItemId: string, direction: 'up' | 'down'): Promise<Result> {
  try {
    await requireAuth();

    const item = await prisma.publishQueueItem.findUniqueOrThrow({
      where: { id: queueItemId },
      select: { queuePosition: true, status: true },
    });

    if (!['QUEUED', 'SCHEDULED'].includes(item.status)) {
      return { ok: false, error: 'Δεν μπορεί να μετακινηθεί' };
    }

    const targetPosition = direction === 'up' ? item.queuePosition - 1 : item.queuePosition + 1;
    if (targetPosition < 1) return { ok: false, error: 'Ήδη στην κορυφή' };

    const neighbor = await prisma.publishQueueItem.findFirst({
      where: {
        queuePosition: targetPosition,
        status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] },
      },
      select: { id: true },
    });

    if (!neighbor) return { ok: false, error: 'Δεν υπάρχει επόμενη θέση' };

    await prisma.$transaction([
      prisma.publishQueueItem.update({
        where: { id: queueItemId },
        data: { queuePosition: targetPosition, priority: targetPosition },
      }),
      prisma.publishQueueItem.update({
        where: { id: neighbor.id },
        data: { queuePosition: item.queuePosition, priority: item.queuePosition },
      }),
    ]);

    revalidateQueue();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function scheduleQueue(startTime: string, intervalMinutes: number): Promise<Result> {
  try {
    await requireAuth();

    if (intervalMinutes < 1 || intervalMinutes > 1440) {
      return { ok: false, error: 'Interval: 1–1440 λεπτά' };
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) return { ok: false, error: 'Μη έγκυρη ώρα έναρξης' };

    const items = await prisma.publishQueueItem.findMany({
      where: { status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] } },
      orderBy: [{ priority: 'asc' }, { queuePosition: 'asc' }],
    });

    if (items.length === 0) return { ok: false, error: 'Δεν υπάρχουν items στην ουρά' };

    await prisma.$transaction(
      items.map((item, index) =>
        prisma.publishQueueItem.update({
          where: { id: item.id },
          data: {
            scheduledFor: new Date(start.getTime() + index * intervalMinutes * 60 * 1000),
            status: QueueItemStatus.SCHEDULED,
          },
        })
      )
    );

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_scheduled',
      status: 'OK',
      message: `Queue scheduled: ${items.length} items from ${start.toISOString()}, every ${intervalMinutes}min`,
      metadata: { count: items.length, startTime, intervalMinutes },
    });

    revalidateQueue();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function publishQueueItemNow(queueItemId: string): Promise<Result> {
  try {
    await requireAuth();
    const result = await _executeQueueItem(queueItemId);
    revalidateQueue();
    revalidatePath('/');
    revalidatePath('/articles');
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function cancelQueueItem(queueItemId: string): Promise<Result> {
  try {
    await requireAuth();

    await prisma.publishQueueItem.update({
      where: { id: queueItemId },
      data: { status: QueueItemStatus.CANCELLED },
    });

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_cancel',
      status: 'OK',
      message: 'Queue item cancelled',
      metadata: { queueItemId },
    });

    revalidateQueue();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

// ─── Internal execution (used by scheduler + publishNow) ──────────────────────

export async function _executeQueueItem(queueItemId: string): Promise<Result> {
  const item = await prisma.publishQueueItem.findUniqueOrThrow({
    where: { id: queueItemId },
    include: {
      article: { select: { id: true, title: true, slug: true, status: true, category: { select: { slug: true } } } },
      socialPost: { select: { id: true, content: true, status: true } },
    },
  });

  try {
    // Step 1: Publish article if not already published
    if (item.article.status !== ArticleStatus.PUBLISHED) {
      await prisma.article.update({
        where: { id: item.articleId },
        data: { status: ArticleStatus.PUBLISHED, publishedAt: new Date() },
      });
      revalidatePath('/');
      revalidatePath('/articles');
      revalidatePath(`/article/${item.article.slug}`);
      revalidatePath(`/category/${item.article.category.slug}`);
    }

    // Step 2: Publish Facebook post if attached
    let fbError: string | undefined;
    if (item.socialPost) {
      const res = await FacebookClient.publish({ content: item.socialPost.content });
      if (res.ok) {
        await prisma.socialPost.update({
          where: { id: item.socialPost.id },
          data: {
            status: SocialPostStatus.PUBLISHED,
            publishedAt: new Date(),
            externalPostId: res.externalId,
          },
        });
      } else {
        fbError = res.error;
        await prisma.socialPost.update({
          where: { id: item.socialPost.id },
          data: { status: SocialPostStatus.FAILED, errorMessage: res.error },
        });
      }
    }

    await prisma.publishQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: QueueItemStatus.PUBLISHED,
        publishedAt: new Date(),
        errorMessage: fbError ? `Facebook: ${fbError}` : null,
      },
    });

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_published',
      status: fbError ? 'WARNING' : 'OK',
      message: `Published: "${item.article.title}"${fbError ? ` (FB error: ${fbError})` : ''}`,
      metadata: { queueItemId, articleId: item.articleId, fbError },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    await prisma.publishQueueItem.update({
      where: { id: queueItemId },
      data: { status: QueueItemStatus.FAILED, errorMessage: msg },
    });

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'queue_failed',
      status: 'ERROR',
      message: `Queue item failed: "${item.article.title}" — ${msg}`,
      metadata: { queueItemId, error: msg },
    });

    return { ok: false, error: msg };
  }
}
