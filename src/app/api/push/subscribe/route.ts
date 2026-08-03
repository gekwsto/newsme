import { z } from 'zod';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

function detectDevice(ua: string): { platform: string; deviceType: string } {
  const lower = ua.toLowerCase();
  const platform = /android/.test(lower)
    ? 'Android'
    : /iphone|ipad/.test(lower)
      ? 'iOS'
      : /windows/.test(lower)
        ? 'Windows'
        : /mac/.test(lower)
          ? 'macOS'
          : /linux/.test(lower)
            ? 'Linux'
            : 'Other';
  const deviceType = /mobile|android|iphone/.test(lower) ? 'mobile' : 'desktop';
  return { platform, deviceType };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid subscription data' }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  const ua = request.headers.get('user-agent') ?? '';
  const { platform, deviceType } = detectDevice(ua);

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: ua.slice(0, 512),
      platform,
      deviceType,
      isActive: true,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      isActive: true,
      failureCount: 0,
      userAgent: ua.slice(0, 512),
      platform,
      deviceType,
    },
  });

  return Response.json({ ok: true });
}
