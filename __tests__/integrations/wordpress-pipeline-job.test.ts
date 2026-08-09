/**
 * The async job layer (createPipelineJob / runPipelineJobInBackground /
 * getPipelineJob) that backs POST .../pipeline/start + GET .../pipeline/[jobId].
 * runWordPressPipeline itself is mocked — this only tests the job
 * bookkeeping, not the selection logic (covered separately).
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    wordPressPipelineJob: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/integrations/wordpress/pipeline', () => ({
  runWordPressPipeline: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { runWordPressPipeline } from '@/lib/integrations/wordpress/pipeline';
import { createPipelineJob, runPipelineJobInBackground, getPipelineJob } from '@/lib/integrations/wordpress/job';

const mockCreate = prisma.wordPressPipelineJob.create as jest.Mock;
const mockUpdate = prisma.wordPressPipelineJob.update as jest.Mock;
const mockFindUnique = prisma.wordPressPipelineJob.findUnique as jest.Mock;
const mockRunPipeline = runWordPressPipeline as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test('createPipelineJob creates a processing job row and returns its id', async () => {
  mockCreate.mockResolvedValue({ id: 'job-1' });
  const jobId = await createPipelineJob('onlinepress');
  expect(jobId).toBe('job-1');
  expect(mockCreate).toHaveBeenCalledWith({ data: { site: 'onlinepress', status: 'processing' } });
});

describe('runPipelineJobInBackground', () => {
  test('runs the real pipeline and records a completed result', async () => {
    mockRunPipeline.mockResolvedValue({
      runId: 'run-1',
      articles: [{ externalId: 'a1' }],
      stats: { discovered: 1, processed: 1, rejected: 0, duplicates: 0, returned: 1 },
      status: 'ok',
    });

    await runPipelineJobInBackground('job-1', { site: 'onlinepress', limit: 5, triggerRun: true });

    expect(mockRunPipeline).toHaveBeenCalledWith({ site: 'onlinepress', limit: 5, triggerRun: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'completed', pipelineRunId: 'run-1' }),
    });
  });

  test('records a failed job if the pipeline throws, without throwing itself', async () => {
    mockRunPipeline.mockRejectedValue(new Error('boom'));
    mockUpdate.mockResolvedValue({});

    await expect(runPipelineJobInBackground('job-1', { site: 'onlinepress', limit: 5 })).resolves.toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'failed', error: 'boom' }),
    });
  });

  test('a failed job-record update itself does not throw (best-effort)', async () => {
    mockRunPipeline.mockRejectedValue(new Error('boom'));
    mockUpdate.mockRejectedValue(new Error('db unreachable'));

    await expect(runPipelineJobInBackground('job-1', { site: 'onlinepress', limit: 5 })).resolves.toBeUndefined();
  });
});

describe('getPipelineJob', () => {
  test('returns not_found for a missing job', async () => {
    mockFindUnique.mockResolvedValue(null);
    const view = await getPipelineJob('ghost', 'onlinepress');
    expect(view.jobStatus).toBe('not_found');
  });

  test('returns not_found if the job belongs to a different site (tenant isolation)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'job-1', site: 'another-site', status: 'completed', createdAt: new Date() });
    const view = await getPipelineJob('job-1', 'onlinepress');
    expect(view.jobStatus).toBe('not_found');
  });

  test('returns processing while still running and recent', async () => {
    mockFindUnique.mockResolvedValue({ id: 'job-1', site: 'onlinepress', status: 'processing', createdAt: new Date() });
    const view = await getPipelineJob('job-1', 'onlinepress');
    expect(view.jobStatus).toBe('processing');
  });

  test('self-heals a stuck "processing" job into "failed" after the staleness window (server restart mid-run)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-1',
      site: 'onlinepress',
      status: 'processing',
      createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
    });
    const view = await getPipelineJob('job-1', 'onlinepress');
    expect(view.jobStatus).toBe('failed');
    expect(view.error).toMatch(/restarted/);
  });

  test('returns failed with the recorded error', async () => {
    mockFindUnique.mockResolvedValue({ id: 'job-1', site: 'onlinepress', status: 'failed', error: 'boom', createdAt: new Date() });
    const view = await getPipelineJob('job-1', 'onlinepress');
    expect(view).toEqual({ jobStatus: 'failed', error: 'boom' });
  });

  test('returns completed with the stored result', async () => {
    const result = { runId: 'run-1', articles: [], stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 }, status: 'ok' };
    mockFindUnique.mockResolvedValue({ id: 'job-1', site: 'onlinepress', status: 'completed', resultJson: result, createdAt: new Date() });
    const view = await getPipelineJob('job-1', 'onlinepress');
    expect(view).toEqual({ jobStatus: 'completed', result });
  });
});
