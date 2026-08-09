/**
 * The database-backed mutex used to stop runNewsPipeline() from ever
 * running concurrently (Vercel cron vs. a WordPress-triggered request, or
 * two overlapping requests). Kept in its own lightweight module specifically
 * so it's testable without pulling in the rest of the pipeline's heavy
 * dependency graph (jsdom, sharp, the OpenAI SDK, ...).
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    pipelineLock: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { acquirePipelineLock, releasePipelineLock, renewPipelineLock, startLockHeartbeat } from '@/lib/pipeline/pipeline-lock';

const mockUpdateMany = prisma.pipelineLock.updateMany as jest.Mock;
const mockCreate = prisma.pipelineLock.create as jest.Mock;

const LOCK_ID = 'news-auto-pipeline';
const TTL_MS = 300_000;

beforeEach(() => {
  jest.clearAllMocks();
});

test('claims the lock when the row is unlocked (lockedAt: null)', async () => {
  mockUpdateMany.mockResolvedValue({ count: 1 });
  const acquired = await acquirePipelineLock(LOCK_ID, TTL_MS);
  expect(acquired).toBe(true);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: LOCK_ID, OR: expect.arrayContaining([{ lockedAt: null }]) }),
    }),
  );
});

test('claims a stale lock (lockedAt older than the TTL) instead of waiting forever', async () => {
  mockUpdateMany.mockResolvedValue({ count: 1 });
  const acquired = await acquirePipelineLock(LOCK_ID, TTL_MS);
  expect(acquired).toBe(true);
  const call = mockUpdateMany.mock.calls[0][0];
  expect(call.where.OR[1]).toHaveProperty('lockedAt.lt');
});

test('fails to claim when another process holds a fresh lock', async () => {
  mockUpdateMany.mockResolvedValue({ count: 0 });
  mockCreate.mockRejectedValue(new Error('Unique constraint failed on the fields: (`id`)'));
  const acquired = await acquirePipelineLock(LOCK_ID, TTL_MS);
  expect(acquired).toBe(false);
});

test('creates the singleton row (already locked) on the very first ever run', async () => {
  mockUpdateMany.mockResolvedValue({ count: 0 });
  mockCreate.mockResolvedValue({ id: LOCK_ID, lockedAt: new Date() });
  const acquired = await acquirePipelineLock(LOCK_ID, TTL_MS);
  expect(acquired).toBe(true);
  expect(mockCreate).toHaveBeenCalledWith({ data: { id: LOCK_ID, lockedAt: expect.any(Date) } });
});

test('release clears lockedAt so the next acquire succeeds immediately', async () => {
  mockUpdateMany.mockResolvedValue({ count: 1 });
  await releasePipelineLock(LOCK_ID);
  expect(mockUpdateMany).toHaveBeenCalledWith({ where: { id: LOCK_ID }, data: { lockedAt: null } });
});

test('release swallows errors — a failed release must never crash the caller', async () => {
  mockUpdateMany.mockRejectedValue(new Error('db unreachable'));
  await expect(releasePipelineLock(LOCK_ID)).resolves.toBeUndefined();
});

test('renewPipelineLock refreshes lockedAt to now', async () => {
  mockUpdateMany.mockResolvedValue({ count: 1 });
  await renewPipelineLock(LOCK_ID);
  expect(mockUpdateMany).toHaveBeenCalledWith({ where: { id: LOCK_ID }, data: { lockedAt: expect.any(Date) } });
});

test('renewPipelineLock swallows errors — a failed heartbeat tick must never crash the pipeline', async () => {
  mockUpdateMany.mockRejectedValue(new Error('db unreachable'));
  await expect(renewPipelineLock(LOCK_ID)).resolves.toBeUndefined();
});

/**
 * A minimal stateful fake for the `pipeline_locks` table — real enough that
 * acquirePipelineLock/renewPipelineLock's actual staleness math runs against
 * fake-advanced Date.now(), instead of a bare jest.fn() that can't reproduce
 * a timing race. Handles both call shapes: the conditional OR (acquire) and
 * the unconditional where:{id} (renew/release) update.
 */
function installFakeLockTable() {
  let row: { lockedAt: Date | null } | null = null;

  mockUpdateMany.mockImplementation(async ({ where, data }: { where: { id: string; OR?: Array<{ lockedAt: null } | { lockedAt: { lt: Date } }> }; data: { lockedAt: Date | null } }) => {
    if (!row) return { count: 0 };
    if (!where.OR) {
      // Unconditional update (renewPipelineLock / releasePipelineLock).
      row.lockedAt = data.lockedAt;
      return { count: 1 };
    }
    const matches = where.OR.some((cond) =>
      'lockedAt' in cond && cond.lockedAt === null ? row!.lockedAt === null : row!.lockedAt !== null && row!.lockedAt < (cond as { lockedAt: { lt: Date } }).lockedAt.lt,
    );
    if (!matches) return { count: 0 };
    row.lockedAt = data.lockedAt;
    return { count: 1 };
  });

  mockCreate.mockImplementation(async ({ data }: { data: { lockedAt: Date | null } }) => {
    if (row) throw new Error('already exists');
    row = { lockedAt: data.lockedAt };
    return row;
  });
}

describe('startLockHeartbeat — the fix for the TTL race', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('THE BUG THIS FIXES: with acquire-once and no renewal, a second caller CAN steal the lock mid-run', async () => {
    installFakeLockTable();

    const ttlMs = 300_000; // 5 min — matches the real PIPELINE_LOCK_TTL_MS

    // First caller acquires the lock and does NOT renew it (simulating the
    // pre-fix code: acquire once, no heartbeat).
    const firstAcquired = await acquirePipelineLock(LOCK_ID, ttlMs);
    expect(firstAcquired).toBe(true);

    // Time passes — the first run is still genuinely executing (e.g. a slow
    // OpenAI call), well past the fixed TTL window, but never renewed.
    jest.advanceTimersByTime(ttlMs + 1_000);

    // A second caller (WordPress trigger landing while the cron run is still
    // active) tries to acquire — WITHOUT the heartbeat fix, this succeeds,
    // proving two pipeline runs could execute concurrently.
    const secondAcquiredWithoutHeartbeat = await acquirePipelineLock(LOCK_ID, ttlMs);
    expect(secondAcquiredWithoutHeartbeat).toBe(true); // the bug, reproduced
  });

  test('THE FIX: with the heartbeat running, a second caller cannot acquire the lock no matter how long the first run takes', async () => {
    installFakeLockTable();

    const ttlMs = 300_000;
    const firstAcquired = await acquirePipelineLock(LOCK_ID, ttlMs);
    expect(firstAcquired).toBe(true);

    const stop = startLockHeartbeat(LOCK_ID, ttlMs); // renews every 60s

    // Advance well past the fixed TTL — 12 minutes, with heartbeats ticking
    // every 60s along the way. Uses the async variant so each interval tick's
    // renewPipelineLock() promise actually resolves (updating the fake row)
    // before the next tick fires, not just synchronously fast-forwarding time.
    await jest.advanceTimersByTimeAsync(12 * 60_000);

    const secondAcquiredWithHeartbeat = await acquirePipelineLock(LOCK_ID, ttlMs);
    expect(secondAcquiredWithHeartbeat).toBe(false); // fixed: still held, correctly

    stop();
  });

  test('renews the lock on an interval well within the TTL (5x margin)', () => {
    const ttlMs = 300_000;
    const stop = startLockHeartbeat(LOCK_ID, ttlMs);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    expect(mockUpdateMany).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(120_000);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2); // no further ticks after stop()
  });

  test('a run lasting well past the TTL keeps the lock fresh via repeated heartbeats', () => {
    const ttlMs = 300_000; // 5 min
    const stop = startLockHeartbeat(LOCK_ID, ttlMs); // heartbeats every 60s
    mockUpdateMany.mockResolvedValue({ count: 1 });

    // Simulate a run lasting 12 minutes — well past the 5-minute TTL — and
    // confirm the heartbeat renews often enough that the lock is never
    // stale for longer than one missed interval, let alone the full TTL.
    jest.advanceTimersByTime(12 * 60_000);
    expect(mockUpdateMany).toHaveBeenCalledTimes(12);

    stop();
  });

  test('stopping the heartbeat (run genuinely finished) lets the lock go stale again after the TTL, enabling crash recovery', () => {
    const ttlMs = 300_000;
    const stop = startLockHeartbeat(LOCK_ID, ttlMs);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    jest.advanceTimersByTime(60_000);
    stop(); // simulates the process crashing right after its last heartbeat — no more renewals arrive
    jest.advanceTimersByTime(300_000); // TTL fully elapses with no further heartbeat
    // acquirePipelineLock's own staleness check (tested above) is what actually
    // reclaims it — this test documents that stopping the heartbeat is what
    // allows that staleness window to start counting down again.
    expect(mockUpdateMany).toHaveBeenCalledTimes(1); // no renewals after stop()
  });
});
