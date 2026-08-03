import { z } from 'zod';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  await prisma.pushSubscription
    .updateMany({
      where: { endpoint: parsed.data.endpoint },
      data: { isActive: false },
    })
    .catch(() => {});

  return Response.json({ ok: true });
}
