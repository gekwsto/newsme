import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendToSubscription, type PushPayload } from '@/lib/push/web-push-server';
import { isVapidConfigured } from '@/lib/push/vapid-config';

export const runtime = 'nodejs';

const TestSchema = z.object({
  title: z.string().min(1).max(100).default('Test — Newsme.gr'),
  body: z.string().min(1).max(200).default('Αυτή είναι μια δοκιμαστική ειδοποίηση.'),
  // Allow relative paths (e.g. '/') and absolute URLs. Validation of unsafe
  // URLs is handled by the Service Worker's same-origin check.
  url: z.string().min(1).max(2048).default('/'),
  imageUrl: z.string().url().max(2048).optional(),
  subscriptionId: z.string().min(1).max(128).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return Response.json(
      { error: 'VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { title, body: notifBody, url, imageUrl, subscriptionId } = parsed.data;

  const whereClause = subscriptionId
    ? { id: subscriptionId, isActive: true }
    : { isTestDevice: true, isActive: true };

  const testSubs = await prisma.pushSubscription.findMany({
    where: whereClause,
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    take: 5,
  });

  if (testSubs.length === 0) {
    return Response.json({
      ok: false,
      error: subscriptionId
        ? 'Subscription not found or inactive.'
        : 'No test devices found. Mark a subscription as test device first.',
    });
  }

  const payload: PushPayload = {
    title,
    body: notifBody,
    url,
    icon: '/og-default.jpg',
    badge: '/og-default.jpg',
    image: imageUrl,
    tag: 'newsme-test',
  };

  const results = await Promise.all(
    testSubs.map((s) =>
      sendToSubscription(s.id, s.endpoint, s.p256dh, s.auth, payload),
    ),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return Response.json({ ok: sent > 0, sent, failed, total: testSubs.length });
}
