import { runScheduler } from '@/actions/scheduler';

// Called by Vercel Cron or external cron every minute.
// Secured with CRON_SECRET header when env var is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('x-cron-secret');
    if (header !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runScheduler();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    );
  }
}
