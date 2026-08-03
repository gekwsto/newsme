import { prisma } from '@/lib/db';
import { sendToAllActive, type PushPayload } from './web-push-server';
import { isVapidConfigured } from './vapid-config';
import { BRAND } from '@/config/brand';
import { resolveArticleImageUrl } from '@/lib/article-mapper';

function buildArticleUrl(categorySlug: string, articleSlug: string, campaignId: string): string {
  const base = `${BRAND.domain}/${categorySlug}/${articleSlug}`;
  const params = new URLSearchParams({
    utm_source: 'webpush',
    utm_medium: 'notification',
    utm_campaign: campaignId,
  });
  return `${base}?${params.toString()}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export interface CampaignInput {
  title: string;
  body: string;
  targetUrl: string;
  imageUrl?: string | null;
  articleId?: string | null;
}

export interface CampaignResult {
  campaignId: string;
  status: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
}

export async function createAndSendCampaign(
  input: CampaignInput,
): Promise<CampaignResult> {
  if (!isVapidConfigured()) {
    throw new Error('VAPID keys are not configured. Cannot send push notifications.');
  }

  const totalTargeted = await prisma.pushSubscription.count({
    where: { isActive: true },
  });

  const campaign = await prisma.pushCampaign.create({
    data: {
      title: truncate(input.title, 100),
      body: truncate(input.body, 200),
      targetUrl: input.targetUrl,
      imageUrl: input.imageUrl ?? null,
      articleId: input.articleId ?? null,
      status: 'PROCESSING',
      totalTargeted,
      startedAt: new Date(),
    },
  });

  if (totalTargeted === 0) {
    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return {
      campaignId: campaign.id,
      status: 'COMPLETED',
      totalTargeted: 0,
      sentCount: 0,
      failedCount: 0,
    };
  }

  const payload: PushPayload = {
    title: campaign.title,
    body: campaign.body,
    url: input.targetUrl,
    icon: '/og-default.jpg',
    badge: '/og-default.jpg',
    image: campaign.imageUrl ?? undefined,
    campaignId: campaign.id,
    articleId: campaign.articleId ?? undefined,
    tag: campaign.articleId ? `article-${campaign.articleId}` : `campaign-${campaign.id}`,
  };

  try {
    const { sent, failed } = await sendToAllActive(payload);

    const finalStatus =
      failed === 0 ? 'COMPLETED' : sent === 0 ? 'FAILED' : 'PARTIALLY_FAILED';

    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: {
        status: finalStatus,
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      },
    });

    return {
      campaignId: campaign.id,
      status: finalStatus,
      totalTargeted,
      sentCount: sent,
      failedCount: failed,
    };
  } catch (err) {
    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
    throw err;
  }
}

export async function createArticleCampaign(
  articleId: string,
  overrides?: { title?: string; body?: string; imageUrl?: string | null },
): Promise<CampaignResult> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      excerpt: true,
      slug: true,
      generatedImageUrl: true,
      coverImage: true,
      status: true,
      category: { select: { slug: true } },
    },
  });

  // Resolve image with fallback chain
  const rawImageUrl =
    overrides?.imageUrl !== undefined
      ? overrides.imageUrl
      : resolveArticleImageUrl(article.generatedImageUrl, article.coverImage) ?? null;

  const safeImageUrl =
    rawImageUrl && (rawImageUrl.startsWith('https://') || rawImageUrl.startsWith('/'))
      ? rawImageUrl
      : null;

  const title = overrides?.title ?? truncate(article.title, 100);
  const body = overrides?.body ?? truncate(article.excerpt ?? '', 200);

  // Count active subscribers first, then build the campaign ID by creating
  // it immediately as PROCESSING. This avoids the previous create-delete-recreate
  // dance that risked leaving orphaned DRAFT records on server interruption.
  const totalTargeted = await prisma.pushSubscription.count({
    where: { isActive: true },
  });

  const campaign = await prisma.pushCampaign.create({
    data: {
      title,
      body,
      // targetUrl includes the campaign ID for UTM tracking — we update it
      // in the next statement once we have the real ID.
      targetUrl: 'pending',
      imageUrl: safeImageUrl,
      articleId,
      status: 'PROCESSING',
      totalTargeted,
      startedAt: new Date(),
    },
  });

  // Now that we have the real campaign.id, build the canonical URL with UTM params.
  const targetUrl = buildArticleUrl(article.category.slug, article.slug, campaign.id);

  await prisma.pushCampaign.update({
    where: { id: campaign.id },
    data: { targetUrl },
  });

  if (totalTargeted === 0) {
    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return {
      campaignId: campaign.id,
      status: 'COMPLETED',
      totalTargeted: 0,
      sentCount: 0,
      failedCount: 0,
    };
  }

  const payload: PushPayload = {
    title,
    body,
    url: targetUrl,
    icon: '/og-default.jpg',
    badge: '/og-default.jpg',
    image: safeImageUrl ?? undefined,
    campaignId: campaign.id,
    articleId,
    tag: `article-${articleId}`,
  };

  try {
    const { sent, failed } = await sendToAllActive(payload);

    const finalStatus =
      failed === 0 ? 'COMPLETED' : sent === 0 ? 'FAILED' : 'PARTIALLY_FAILED';

    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: {
        status: finalStatus,
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      },
    });

    return {
      campaignId: campaign.id,
      status: finalStatus,
      totalTargeted,
      sentCount: sent,
      failedCount: failed,
    };
  } catch (err) {
    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
    throw err;
  }
}
