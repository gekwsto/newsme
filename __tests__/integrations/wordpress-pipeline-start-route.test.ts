/**
 * POST /api/integrations/wordpress/pipeline/start
 * Must respond immediately (job bookkeeping only) and schedule the real
 * work via next/server's after() — never await the pipeline itself here.
 */

jest.mock('@/lib/integrations/wordpress/auth', () => ({
  isAuthorizedWordPressRequest: jest.fn(),
}));

jest.mock('@/lib/integrations/wordpress/job', () => ({
  createPipelineJob: jest.fn(),
  runPipelineJobInBackground: jest.fn(),
}));

const mockAfter = jest.fn();
jest.mock('next/server', () => ({
  after: (...args: unknown[]) => mockAfter(...args),
}));

import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { createPipelineJob, runPipelineJobInBackground } from '@/lib/integrations/wordpress/job';
import { POST } from '@/app/api/integrations/wordpress/pipeline/start/route';

const mockAuthorized = isAuthorizedWordPressRequest as jest.Mock;
const mockCreateJob = createPipelineJob as jest.Mock;

function makeRequest(body: unknown): Request {
  return new Request('https://newsme.gr/api/integrations/wordpress/pipeline/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer whatever' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthorized.mockReturnValue(true);
  mockCreateJob.mockResolvedValue('job-123');
});

test('unauthorized request → 401, no job created', async () => {
  mockAuthorized.mockReturnValue(false);
  const res = await POST(makeRequest({ site: 'onlinepress' }));
  expect(res.status).toBe(401);
  expect(mockCreateJob).not.toHaveBeenCalled();
});

test('invalid payload → 400', async () => {
  const res = await POST(makeRequest({}));
  expect(res.status).toBe(400);
  expect(mockCreateJob).not.toHaveBeenCalled();
});

test('creates a job and returns 202 immediately, without waiting for the pipeline', async () => {
  const res = await POST(makeRequest({ site: 'onlinepress', limit: 5 }));

  expect(res.status).toBe(202);
  const json = await res.json();
  expect(json).toEqual({ success: true, jobId: 'job-123', jobStatus: 'processing' });
  expect(mockCreateJob).toHaveBeenCalledWith('onlinepress');
});

test('schedules the real pipeline work via after(), passing the parsed request through', async () => {
  await POST(makeRequest({ site: 'onlinepress', limit: 5, triggerRun: true }));

  expect(mockAfter).toHaveBeenCalledTimes(1);
  const scheduledFn = mockAfter.mock.calls[0][0];
  await scheduledFn();
  expect(runPipelineJobInBackground).toHaveBeenCalledWith(
    'job-123',
    expect.objectContaining({ site: 'onlinepress', limit: 5, triggerRun: true }),
  );
});

test('triggerRun defaults to true for the start endpoint (this endpoint exists specifically to trigger safely)', async () => {
  await POST(makeRequest({ site: 'onlinepress' }));
  const scheduledFn = mockAfter.mock.calls[0][0];
  await scheduledFn();
  expect(runPipelineJobInBackground).toHaveBeenCalledWith('job-123', expect.objectContaining({ triggerRun: true }));
});

test('a failure creating the job returns a clean 500, not an uncaught exception', async () => {
  mockCreateJob.mockRejectedValue(new Error('db unreachable'));
  const res = await POST(makeRequest({ site: 'onlinepress' }));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.success).toBe(false);
});
