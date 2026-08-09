import { prisma } from '@/lib/db';

/**
 * Database-backed mutex for the news auto-pipeline. An in-memory lock would
 * not be shared across separate serverless invocations (Vercel cron vs. a
 * WordPress-triggered request, or two overlapping requests), so this uses a
 * singleton row claimed via an atomic conditional update.
 *
 * Lease + heartbeat, not a fixed "start time + TTL" window: `ttlMs` is a
 * staleness threshold measured from `lockedAt`, and the holder is expected
 * to call `renewPipelineLock()` periodically (see `startLockHeartbeat`)
 * while it's still genuinely working. This matters because the pipeline's
 * own *total* execution time is not bounded by `ttlMs` — a fixed
 * "acquired-at + ttlMs" expiry would let a second caller acquire the lock
 * while the first is still legitimately running past that point. As long as
 * heartbeats keep landing, the lease never goes stale; it only expires if
 * heartbeats actually stop (crash, hard platform kill), which is exactly
 * the crash-recovery case this is meant to handle.
 *
 * Kept in its own module (no heavy imports) so it can be unit-tested without
 * pulling in the rest of the pipeline's dependency graph (jsdom, sharp, the
 * OpenAI SDK, ...).
 */

export const NEWS_PIPELINE_LOCK_ID = 'news-auto-pipeline';

/** Shared exact string so callers (e.g. the WordPress integration) can reliably
 *  detect "no new run happened because one was already in progress" without
 *  parsing free-text reasons that could drift between files. */
export const LOCK_CONTENTION_REASON = 'Another pipeline run is already in progress';

export async function acquirePipelineLock(lockId: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ttlMs);

  const claimed = await prisma.pipelineLock.updateMany({
    where: { id: lockId, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    data: { lockedAt: now },
  });
  if (claimed.count > 0) return true;

  // First-ever run for this lockId: the singleton row doesn't exist yet —
  // try to create it already locked. If another caller wins the race, its
  // create() succeeds and ours throws (unique id), which we correctly read
  // as "not acquired".
  try {
    await prisma.pipelineLock.create({ data: { id: lockId, lockedAt: now } });
    return true;
  } catch {
    return false;
  }
}

export async function renewPipelineLock(lockId: string): Promise<void> {
  await prisma.pipelineLock.updateMany({ where: { id: lockId }, data: { lockedAt: new Date() } }).catch(() => {});
}

export async function releasePipelineLock(lockId: string): Promise<void> {
  await prisma.pipelineLock.updateMany({ where: { id: lockId }, data: { lockedAt: null } }).catch(() => {});
}

/**
 * Starts a periodic renewal ("heartbeat") of the lease while the caller is
 * still actively holding it. Returns a stop function — always call it
 * (typically in a `finally`) once the held work finishes, both to stop the
 * timer and because releasing the lock is a separate, explicit call.
 *
 * `intervalMs` must be comfortably shorter than `ttlMs` so a single missed
 * or slow heartbeat can't tip the lock into staleness — default gives a 5x
 * margin (e.g. 60s heartbeat against a 300s TTL).
 */
export function startLockHeartbeat(lockId: string, ttlMs: number, intervalMs = Math.floor(ttlMs / 5)): () => void {
  const timer = setInterval(() => {
    void renewPipelineLock(lockId);
  }, intervalMs);
  return () => clearInterval(timer);
}
