import { z } from 'zod';
import { prisma } from '@/lib/db';
import { WordpressDeliveryStatus } from '@/generated/prisma/enums';
import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { checkRateLimit, rateLimitKeyFromRequest } from '@/lib/integrations/wordpress/rate-limit';
import type { WordPressAckResponse, WordPressAckResultItem } from '@/types/integrations/wordpress';

export const runtime = 'nodejs';

const AckArticleSchema = z.object({
  externalId: z.string().min(1).max(128),
  status: z.enum(['published', 'draft', 'failed']),
  wordpressPostId: z.number().int().positive().optional(),
  wordpressUrl: z.string().url().max(2048).optional(),
  error: z.string().max(1000).optional(),
});

const RequestSchema = z.object({
  site: z.string().min(1).max(64),
  runId: z.string().max(128).optional(),
  articles: z.array(AckArticleSchema).min(1).max(50),
});

function toDeliveryStatus(status: 'published' | 'draft' | 'failed'): WordpressDeliveryStatus {
  return status === 'failed' ? WordpressDeliveryStatus.FAILED : WordpressDeliveryStatus.PUBLISHED;
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkRateLimit(rateLimitKeyFromRequest(request));
  if (!rateLimit.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many requests' },
      429,
      rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined,
    );
  }

  if (!isAuthorizedWordPressRequest(request)) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: 'Invalid request body' }, 400);
  }

  const { site, articles } = parsed.data;
  const results: WordPressAckResultItem[] = [];

  // Per-article isolation: one bad/missing delivery row must not fail the batch.
  for (const item of articles) {
    try {
      const updated = await prisma.wordpressDelivery.updateMany({
        where: { site, articleId: item.externalId },
        data: {
          status: toDeliveryStatus(item.status),
          wordpressPostId: item.wordpressPostId ?? null,
          wordpressUrl: item.wordpressUrl ?? null,
          ackAt: new Date(),
          ackError: item.status === 'failed' ? (item.error ?? 'Import failed') : null,
        },
      });

      if (updated.count === 0) {
        results.push({ externalId: item.externalId, acknowledged: false, error: 'No matching delivery for site/externalId' });
      } else {
        results.push({ externalId: item.externalId, acknowledged: true });
      }
    } catch (err) {
      console.error('[wordpress-integration] ack failed for article', {
        externalId: item.externalId,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({ externalId: item.externalId, acknowledged: false, error: 'Internal error' });
    }
  }

  return jsonResponse({ success: true, results }, 200);
}

function jsonResponse(body: WordPressAckResponse, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}
