import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { checkRateLimit, rateLimitKeyFromRequest } from '@/lib/integrations/wordpress/rate-limit';
import { getPipelineJob } from '@/lib/integrations/wordpress/job';
import type { WordPressPipelineJobResponse } from '@/types/integrations/wordpress';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
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

  const { jobId } = await context.params;
  const site = new URL(request.url).searchParams.get('site');
  if (!site) {
    return jsonResponse({ success: false, error: 'Missing required "site" query parameter' }, 400);
  }

  try {
    const job = await getPipelineJob(jobId, site);

    if (job.jobStatus === 'not_found') {
      return jsonResponse({ success: false, error: 'Job not found' }, 404);
    }

    if (job.jobStatus === 'processing') {
      return jsonResponse({ success: true, jobStatus: 'processing', jobId }, 200);
    }

    if (job.jobStatus === 'failed') {
      return jsonResponse({ success: true, jobStatus: 'failed', jobId, error: job.error ?? 'Unknown error' }, 200);
    }

    const result = job.result!;
    return jsonResponse(
      {
        success: true,
        jobStatus: 'completed',
        jobId,
        runId: result.runId,
        articles: result.articles,
        stats: result.stats,
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      200,
    );
  } catch (err) {
    console.error('[wordpress-integration] failed to read pipeline job', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ success: false, error: 'Internal error reading pipeline job' }, 500);
  }
}

function jsonResponse(body: WordPressPipelineJobResponse, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}
