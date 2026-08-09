/**
 * GET /api/integrations/wordpress/pipeline/[jobId]
 */

jest.mock('@/lib/integrations/wordpress/auth', () => ({
  isAuthorizedWordPressRequest: jest.fn(),
}));

jest.mock('@/lib/integrations/wordpress/job', () => ({
  getPipelineJob: jest.fn(),
}));

import { isAuthorizedWordPressRequest } from '@/lib/integrations/wordpress/auth';
import { getPipelineJob } from '@/lib/integrations/wordpress/job';
import { GET } from '@/app/api/integrations/wordpress/pipeline/[jobId]/route';

const mockAuthorized = isAuthorizedWordPressRequest as jest.Mock;
const mockGetJob = getPipelineJob as jest.Mock;

function makeRequest(jobId: string, site?: string): { request: Request; context: { params: Promise<{ jobId: string }> } } {
  const url = new URL(`https://newsme.gr/api/integrations/wordpress/pipeline/${jobId}`);
  if (site) url.searchParams.set('site', site);
  return {
    request: new Request(url, { headers: { Authorization: 'Bearer whatever' } }),
    context: { params: Promise.resolve({ jobId }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthorized.mockReturnValue(true);
});

test('unauthorized request → 401', async () => {
  mockAuthorized.mockReturnValue(false);
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(401);
  expect(mockGetJob).not.toHaveBeenCalled();
});

test('missing site query param → 400', async () => {
  const { request, context } = makeRequest('job-1');
  const res = await GET(request, context);
  expect(res.status).toBe(400);
});

test('unknown job → 404', async () => {
  mockGetJob.mockResolvedValue({ jobStatus: 'not_found' });
  const { request, context } = makeRequest('ghost', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(404);
});

test('still processing → 200 with jobStatus processing', async () => {
  mockGetJob.mockResolvedValue({ jobStatus: 'processing' });
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toEqual({ success: true, jobStatus: 'processing', jobId: 'job-1' });
});

test('failed job → 200 (not 500) with the error message, so WordPress can show it cleanly', async () => {
  mockGetJob.mockResolvedValue({ jobStatus: 'failed', error: 'pipeline crashed' });
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toEqual({ success: true, jobStatus: 'failed', jobId: 'job-1', error: 'pipeline crashed' });
});

test('completed job → 200 with the full normalized result inline', async () => {
  mockGetJob.mockResolvedValue({
    jobStatus: 'completed',
    result: {
      runId: 'run-1',
      articles: [{ externalId: 'a1', title: 'T' }],
      stats: { discovered: 1, processed: 1, rejected: 0, duplicates: 0, returned: 1 },
      status: 'ok',
    },
  });
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.jobStatus).toBe('completed');
  expect(json.runId).toBe('run-1');
  expect(json.articles).toHaveLength(1);
  expect(json.status).toBe('ok');
});

test('completed job with a reason (e.g. lock contention during the run) includes it', async () => {
  mockGetJob.mockResolvedValue({
    jobStatus: 'completed',
    result: {
      runId: 'run-1',
      articles: [],
      stats: { discovered: 0, processed: 0, rejected: 0, duplicates: 0, returned: 0 },
      status: 'already_running',
      reason: 'Another pipeline run is already in progress',
    },
  });
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  const json = await res.json();
  expect(json.status).toBe('already_running');
  expect(json.reason).toBe('Another pipeline run is already in progress');
});

test('an internal error looking up the job returns a clean 500', async () => {
  mockGetJob.mockRejectedValue(new Error('db unreachable'));
  const { request, context } = makeRequest('job-1', 'onlinepress');
  const res = await GET(request, context);
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.success).toBe(false);
  expect(JSON.stringify(json)).not.toContain('db unreachable');
});
