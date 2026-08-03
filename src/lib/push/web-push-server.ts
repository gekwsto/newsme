import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { getVapidConfig } from './vapid-config';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  image?: string;
  campaignId?: string;
  articleId?: string;
  tag?: string;
}

export interface SendResult {
  subscriptionId: string;
  ok: boolean;
  expired: boolean;
  error?: string;
}

let _initialized = false;

function ensureInitialized() {
  if (_initialized) return;
  const cfg = getVapidConfig();
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  _initialized = true;
}

export async function sendToSubscription(
  subscriptionId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload,
): Promise<SendResult> {
  ensureInitialized();

  const pushSubscription = {
    endpoint,
    keys: { p256dh, auth },
  };

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      { TTL: 86400 },
    );

    await prisma.pushSubscription.update({
      where: { id: subscriptionId },
      data: { lastSuccessAt: new Date(), failureCount: 0 },
    });

    return { subscriptionId, ok: true, expired: false };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const expired = status === 404 || status === 410;

    const sanitizedError =
      err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';

    await prisma.pushSubscription.update({
      where: { id: subscriptionId },
      data: {
        failureCount: { increment: 1 },
        lastFailureAt: new Date(),
        ...(expired ? { isActive: false } : {}),
      },
    });

    return {
      subscriptionId,
      ok: false,
      expired,
      error: sanitizedError,
    };
  }
}

export async function sendToAllActive(
  payload: PushPayload,
  batchSize = 50,
): Promise<{ sent: number; failed: number; expired: number }> {
  ensureInitialized();

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (let i = 0; i < subscriptions.length; i += batchSize) {
    const batch = subscriptions.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((sub) =>
        sendToSubscription(sub.id, sub.endpoint, sub.p256dh, sub.auth, payload),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.ok) {
          sent++;
        } else {
          failed++;
          if (result.value.expired) expired++;
        }
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, expired };
}
