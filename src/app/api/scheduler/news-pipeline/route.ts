import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runNewsPipeline } from '@/services/news-auto-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function isAuthorized(request: Request): Promise<boolean> {
  const envSecret = process.env.CRON_SECRET;

  const xCronHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  const hasXCron = Boolean(envSecret) && xCronHeader === envSecret;
  const hasBearer = Boolean(envSecret) && authHeader === `Bearer ${envSecret}`;
  const hasQuery = Boolean(envSecret) && querySecret === envSecret;

  if (hasXCron || hasBearer || hasQuery) return true;

  const session = await auth();
  if (session?.user?.role === 'ADMIN') return true;

  console.log('[news-pipeline] auth_failed', {
    hasCronSecretEnv: Boolean(envSecret),
    hasXCronSecretHeader: Boolean(xCronHeader),
    hasAuthorizationHeader: Boolean(authHeader),
    hasQuerySecret: Boolean(querySecret),
    hasAdminSession: Boolean(session?.user),
  });

  return false;
}

export async function GET(request: Request) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runNewsPipeline();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';
  const result = await runNewsPipeline(force);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
