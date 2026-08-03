import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      platform: true,
      deviceType: true,
      isTestDevice: true,
      failureCount: true,
      lastSuccessAt: true,
      createdAt: true,
    },
  });

  return Response.json({ subscriptions: subs });
}

const MarkTestSchema = z.object({
  subscriptionId: z.string().min(1).max(128),
  isTestDevice: z.boolean(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = MarkTestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  await prisma.pushSubscription.update({
    where: { id: parsed.data.subscriptionId },
    data: { isTestDevice: parsed.data.isTestDevice },
  });

  return Response.json({ ok: true });
}
