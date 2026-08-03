import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [activeCount, inactiveCount, campaigns] = await Promise.all([
    prisma.pushSubscription.count({ where: { isActive: true } }),
    prisma.pushSubscription.count({ where: { isActive: false } }),
    prisma.pushCampaign.aggregate({
      _sum: { sentCount: true, failedCount: true, clickedCount: true },
      _count: { id: true },
    }),
  ]);

  const totalSent = campaigns._sum.sentCount ?? 0;
  const totalClicks = campaigns._sum.clickedCount ?? 0;
  const ctr = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '0.0';

  return Response.json({
    activeSubscribers: activeCount,
    inactiveSubscribers: inactiveCount,
    totalCampaigns: campaigns._count.id,
    totalSent,
    totalFailed: campaigns._sum.failedCount ?? 0,
    totalClicks,
    ctr: parseFloat(ctr),
  });
}
