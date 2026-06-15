import { runEvergreenEngine } from '@/services/evergreen-engine';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    const customHeader = request.headers.get('x-cron-secret');
    const isAuthorized =
      authHeader === `Bearer ${secret}` || customHeader === secret;
    if (!isAuthorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(30, Math.max(1, parseInt(limitParam, 10))) : 5;

  try {
    const result = await runEvergreenEngine(limit);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' },
      { status: 500 },
    );
  }
}
