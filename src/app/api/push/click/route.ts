import { z } from 'zod';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const ClickSchema = z.object({
  campaignId: z.string().min(1).max(128),
});

/**
 * Per-campaign per-IP deduplication — prevents trivial click inflation.
 * Uses an in-memory Map (resets on server restart, acceptable for Phase 1).
 * Evicts oldest entries once MAX_ENTRIES is reached to cap memory usage.
 */
const MAX_ENTRIES = 50_000;
const seen = new Map<string, true>();

function alreadySeen(key: string): boolean {
  if (seen.has(key)) return true;
  if (seen.size >= MAX_ENTRIES) {
    const firstKey = seen.keys().next().value;
    if (firstKey !== undefined) seen.delete(firstKey);
  }
  seen.set(key, true);
  return false;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: true });
  }

  const parsed = ClickSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: true });
  }

  const { campaignId } = parsed.data;

  // Per-campaign per-IP deduplication
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (alreadySeen(`${campaignId}:${ip}`)) {
    return Response.json({ ok: true });
  }

  // Increment clickedCount, capped at totalTargeted to prevent inflation
  // beyond the subscriber count. Best-effort — errors are silently ignored.
  await prisma.pushCampaign
    .findUnique({ where: { id: campaignId }, select: { clickedCount: true, totalTargeted: true } })
    .then((campaign) => {
      if (!campaign) return;
      if (campaign.totalTargeted > 0 && campaign.clickedCount >= campaign.totalTargeted) return;
      return prisma.pushCampaign.update({
        where: { id: campaignId },
        data: { clickedCount: { increment: 1 } },
      });
    })
    .catch(() => {});

  return Response.json({ ok: true });
}
