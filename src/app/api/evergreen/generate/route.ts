import { runEvergreenEngine } from '@/services/evergreen-engine';
import { auth } from '@/lib/auth';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get('authorization');
  const customHeader = request.headers.get('x-cron-secret');
  return authHeader === `Bearer ${secret}` || customHeader === secret;
}

export async function POST(request: Request) {
  const session = await auth();
  const cronAuthorized = isAuthorized(request);

  if (!session?.user?.id && !cronAuthorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let limit = 5;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === 'number' && body.limit > 0 && body.limit <= 30) {
      limit = body.limit;
    }
  } catch {
    // use default limit
  }

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
