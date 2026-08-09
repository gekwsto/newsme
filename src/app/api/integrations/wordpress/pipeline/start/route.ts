import { z } from 'zod';
import { after } from 'next/server';
import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { checkRateLimit, rateLimitKeyFromRequest } from '@/lib/integrations/wordpress/rate-limit';
import { createPipelineJob, runPipelineJobInBackground } from '@/lib/integrations/wordpress/job';
import type { WordPressPipelineStartResponse } from '@/types/integrations/wordpress';

// This route itself must return almost immediately (it only creates a job
// row and schedules the real work via after()) — it does not need the long
// maxDuration the synchronous /pipeline route needs.
export const runtime = 'nodejs';
export const maxDuration = 30;

const RequestSchema = z.object({
  site: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(20).optional().default(10),
  categories: z.array(z.string().min(1).max(64)).max(50).optional().default([]),
  publishMode: z.enum(['draft', 'publish']).optional().default('draft'),
  triggerRun: z.boolean().optional().default(true),
});

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

  try {
    const jobId = await createPipelineJob(parsed.data.site);

    // Runs after this response has been sent. Safe specifically because this
    // app runs as a persistent, self-hosted Node process (docker-compose.yml
    // + `next start`), not a serverless function that gets frozen once the
    // response completes — see docs/wordpress-integration.md.
    after(() => runPipelineJobInBackground(jobId, parsed.data));

    return jsonResponse({ success: true, jobId, jobStatus: 'processing' }, 202);
  } catch (err) {
    console.error('[wordpress-integration] failed to start pipeline job', {
      site: parsed.data.site,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ success: false, error: 'Internal error starting pipeline job' }, 500);
  }
}

function jsonResponse(body: WordPressPipelineStartResponse, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}
