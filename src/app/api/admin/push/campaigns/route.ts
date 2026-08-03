import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const campaigns = await prisma.pushCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      title: true,
      status: true,
      totalTargeted: true,
      sentCount: true,
      failedCount: true,
      clickedCount: true,
      articleId: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return Response.json({ campaigns });
}
