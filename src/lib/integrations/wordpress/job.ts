import { prisma } from '@/lib/db';
import { runWordPressPipeline, type RunWordPressPipelineOptions, type WordPressPipelineResult } from '@/lib/integrations/wordpress/pipeline';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Async "start + poll" flow for the WordPress integration.
 *
 * Why this exists: the production domain sits behind Cloudflare (confirmed —
 * `server: cloudflare` on the live response headers), whose default proxy
 * read timeout (~100s) is well under the pipeline's worst-case duration
 * (up to ~270s by design). A single long-held synchronous HTTP request
 * cannot be relied on to survive that. This does NOT reimplement or
 * duplicate the pipeline — `runPipelineJobInBackground` calls the exact same
 * `runWordPressPipeline()` used by the synchronous `POST /pipeline` route;
 * it just runs it after the HTTP response has already been sent, via
 * Next's `after()`, and records the result in a pollable row.
 *
 * `after()` is safe here specifically because this app runs as a
 * self-hosted, persistent Node process (`next start` in `docker-compose.yml`),
 * not a serverless function that gets frozen right after the response —
 * see docs/wordpress-integration.md for the full reasoning.
 */

// If a job has been "processing" for longer than this with no result, the
// server process most likely restarted mid-run (deploy, crash) and will
// never finish it. Comfortably above the pipeline's own worst-case duration
// (~270s) so this never fires while a run is still legitimately in flight.
const JOB_STALE_MS = 10 * 60 * 1000;

export type PipelineJobStatus = 'processing' | 'completed' | 'failed' | 'not_found';

export interface PipelineJobView {
  jobStatus: PipelineJobStatus;
  result?: WordPressPipelineResult;
  error?: string;
}

export async function createPipelineJob(site: string): Promise<string> {
  const job = await prisma.wordPressPipelineJob.create({ data: { site, status: 'processing' } });
  return job.id;
}

/**
 * Runs the real pipeline and records the outcome. Intended to be invoked via
 * `after()` from the /start route — must never throw uncaught, since nothing
 * downstream awaits it.
 */
export async function runPipelineJobInBackground(jobId: string, options: RunWordPressPipelineOptions): Promise<void> {
  try {
    const result = await runWordPressPipeline(options);
    await prisma.wordPressPipelineJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        pipelineRunId: result.runId,
        resultJson: result as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wordpress-integration] background pipeline job failed', { jobId, error: message });
    await prisma.wordPressPipelineJob
      .update({ where: { id: jobId }, data: { status: 'failed', error: message, finishedAt: new Date() } })
      .catch(() => {});
  }
}

/**
 * @param site Must match the job's own site — prevents one site's plugin
 *             from polling another site's job/content by guessing an id.
 */
export async function getPipelineJob(jobId: string, site: string): Promise<PipelineJobView> {
  const job = await prisma.wordPressPipelineJob.findUnique({ where: { id: jobId } });
  if (!job || job.site !== site) {
    return { jobStatus: 'not_found' };
  }

  if (job.status === 'processing') {
    if (Date.now() - job.createdAt.getTime() > JOB_STALE_MS) {
      return { jobStatus: 'failed', error: `Job produced no result after ${JOB_STALE_MS / 1000}s — the server process likely restarted mid-run.` };
    }
    return { jobStatus: 'processing' };
  }

  if (job.status === 'failed') {
    return { jobStatus: 'failed', error: job.error ?? 'Unknown error' };
  }

  return { jobStatus: 'completed', result: job.resultJson as unknown as WordPressPipelineResult };
}
