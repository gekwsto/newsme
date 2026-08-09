import { z } from 'zod';
import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { checkRateLimit, rateLimitKeyFromRequest } from '@/lib/integrations/wordpress/rate-limit';
import { runWordPressPipeline } from '@/lib/integrations/wordpress/pipeline';
import type { WordPressPipelineResponse } from '@/types/integrations/wordpress';

// Mirrors /api/scheduler/news-pipeline: triggerRun:true can synchronously run
// a full RSS+AI generation cycle, which needs headroom under Vercel's cap.
export const runtime = 'nodejs';
export const maxDuration = 300;

const RequestSchema = z.object({
  site: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(20).optional().default(10),
  categories: z.array(z.string().min(1).max(64)).max(50).optional().default([]),
  publishMode: z.enum(['draft', 'publish']).optional().default('draft'),
  triggerRun: z.boolean().optional().default(false),
});

export async function POST(request: Request): Promise<Response> {
  const rateLimitKey = rateLimitKeyFromRequest(request);
  const rateLimit = checkRateLimit(rateLimitKey);
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

  try {
    const result = await runWordPressPipeline(parsed.data);
    return jsonResponse(
      {
        success: true,
        runId: result.runId,
        articles: result.articles,
        stats: result.stats,
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      200,
    );
  } catch (err) {
    console.error('[wordpress-integration] pipeline failed', {
      site: parsed.data.site,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ success: false, error: 'Internal pipeline error' }, 500);
  }
}

function jsonResponse(body: WordPressPipelineResponse, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}
