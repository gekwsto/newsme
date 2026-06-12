import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import QueueClient from './QueueClient';
import { QueueItemStatus, ArticleStatus, SocialPostStatus } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Publishing Queue | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

export default async function PublishingQueuePage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [queueItems, readyArticles] = await Promise.all([
    prisma.publishQueueItem.findMany({
      where: { status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] } },
      orderBy: [{ priority: 'asc' }, { queuePosition: 'asc' }],
      include: {
        article: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            category: { select: { name: true, color: true } },
          },
        },
        socialPost: {
          select: { id: true, content: true, status: true, platform: true },
        },
      },
    }),

    prisma.article.findMany({
      where: {
        status: { in: [ArticleStatus.APPROVED, ArticleStatus.PUBLISHED] },
        publishQueueItems: {
          none: { status: { in: [QueueItemStatus.QUEUED, QueueItemStatus.SCHEDULED] } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        category: { select: { name: true, color: true } },
        socialPosts: {
          where: {
            platform: 'FACEBOOK',
            status: { in: [SocialPostStatus.APPROVED, SocialPostStatus.DRAFT] },
            publishQueueItem: null,
          },
          select: { id: true, status: true },
          take: 1,
        },
      },
    }),
  ]);

  const recentHistory = await prisma.publishQueueItem.findMany({
    where: { status: { in: [QueueItemStatus.PUBLISHED, QueueItemStatus.FAILED, QueueItemStatus.CANCELLED] } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: {
      article: { select: { title: true, slug: true } },
    },
  });

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Publishing Queue</h1>
          <p className="text-slate-400 text-sm mt-1">
            Εγκρίνεις άρθρα → τα βάζεις στην ουρά → ορίζεις χρόνο → δημοσιεύονται αυτόματα ένα-ένα.
          </p>
        </div>
        <QueueClient
          queueItems={queueItems}
          readyArticles={readyArticles}
          recentHistory={recentHistory}
        />
      </div>
    </AdminShell>
  );
}
