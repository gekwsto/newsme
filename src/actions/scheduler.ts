'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, SERVICE } from '@/lib/monitoring/events';
import { SocialPostStatus, ScheduledPostStatus, SocialPlatform, QueueItemStatus } from '@/generated/prisma/enums';
import { _executeQueueItem } from './queue';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

export type ScheduleResult =
  | { ok: true; scheduledPostId: string }
  | { ok: false; error: string };

export async function scheduleSocialPost(
  socialPostId: string,
  scheduledFor: Date
): Promise<ScheduleResult> {
  try {
    const user = await requireAuth();

    const socialPost = await prisma.socialPost.findUniqueOrThrow({
      where: { id: socialPostId },
      select: { platform: true, articleId: true, scheduledPost: { select: { id: true } } },
    });

    if (socialPost.scheduledPost) {
      return { ok: false, error: 'Αυτό το post έχει ήδη προγραμματιστεί' };
    }

    const scheduled = await prisma.scheduledPost.create({
      data: {
        articleId: socialPost.articleId,
        socialPostId,
        platform: socialPost.platform,
        scheduledFor,
      },
    });

    await prisma.socialPost.update({
      where: { id: socialPostId },
      data: { status: SocialPostStatus.SCHEDULED },
    });

    revalidatePath('/admin/news-discovery');
    revalidatePath('/admin/analytics');
    return { ok: true, scheduledPostId: scheduled.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export type CancelScheduleResult = { ok: true } | { ok: false; error: string };

export async function cancelScheduledPost(scheduledPostId: string): Promise<CancelScheduleResult> {
  try {
    await requireAuth();
    const sp = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: scheduledPostId } });
    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: ScheduledPostStatus.CANCELLED },
    });
    await prisma.socialPost.update({
      where: { id: sp.socialPostId },
      data: { status: SocialPostStatus.DRAFT },
    });
    revalidatePath('/admin/analytics');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export type RunSchedulerResult = {
  ok: true;
  published: number;
  failed: number;
  details: Array<{ id: string; ok: boolean; error?: string }>;
};

export async function runScheduler(): Promise<RunSchedulerResult> {
  const pending = await prisma.scheduledPost.findMany({
    where: {
      status: ScheduledPostStatus.PENDING,
      scheduledFor: { lte: new Date() },
    },
    include: { socialPost: { select: { content: true, platform: true } } },
  });

  let published = 0;
  let failed = 0;
  const details: RunSchedulerResult['details'] = [];

  for (const sp of pending) {
    let result: { ok: boolean; error?: string };

    if (sp.platform === SocialPlatform.FACEBOOK) {
      const res = await FacebookClient.publish({ content: sp.socialPost.content });
      if (res.ok) {
        await prisma.scheduledPost.update({
          where: { id: sp.id },
          data: { status: ScheduledPostStatus.PUBLISHED, publishedAt: new Date() },
        });
        await prisma.socialPost.update({
          where: { id: sp.socialPostId },
          data: {
            status: SocialPostStatus.PUBLISHED,
            publishedAt: new Date(),
            externalPostId: res.externalId,
          },
        });
        published++;
        result = { ok: true };
      } else {
        await prisma.scheduledPost.update({
          where: { id: sp.id },
          data: { status: ScheduledPostStatus.FAILED, errorMessage: res.error },
        });
        await prisma.socialPost.update({
          where: { id: sp.socialPostId },
          data: { status: SocialPostStatus.FAILED, errorMessage: res.error },
        });
        failed++;
        result = { ok: false, error: res.error };
      }
    } else {
      // Platform not yet implemented — skip gracefully
      result = { ok: false, error: `Platform ${sp.platform} not yet supported` };
      failed++;
    }

    details.push({ id: sp.id, ...result });
  }

  // ── Publishing Queue items ──────────────────────────────────────────────────
  const queueItems = await prisma.publishQueueItem.findMany({
    where: {
      status: QueueItemStatus.SCHEDULED,
      scheduledFor: { lte: new Date() },
    },
    orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }],
    select: { id: true },
  });

  for (const qi of queueItems) {
    const res = await _executeQueueItem(qi.id);
    if (res.ok) {
      published++;
    } else {
      failed++;
    }
    details.push({ id: qi.id, ...res });
  }

  void logEvent({
    service: SERVICE.SCHEDULER,
    type: 'scheduler_run',
    status: failed > 0 ? 'WARNING' : 'OK',
    message: `Scheduler run: ${published} published, ${failed} failed (queue: ${queueItems.length})`,
    metadata: { published, failed, total: pending.length, queueItems: queueItems.length },
  });

  return { ok: true, published, failed, details };
}
