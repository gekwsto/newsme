import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runEvergreenEngine } from '@/services/evergreen-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

function athensHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' })
      .format(new Date()),
    10
  );
}

async function isAuthorized(request: Request): Promise<boolean> {
  const envSecret = process.env.CRON_SECRET;
  const xCron = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('secret');

  if (envSecret && (xCron === envSecret || bearer === `Bearer ${envSecret}` || query === envSecret)) {
    return true;
  }
  const session = await auth();
  return session?.user?.role === 'ADMIN';
}

async function handle(request: Request, skipHourCheck: boolean) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await prisma.evergreenAutomationSettings.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!settings) {
    return NextResponse.json({ ok: false, reason: 'No evergreen settings configured' });
  }

  if (!settings.isEnabled) {
    return NextResponse.json({ ok: true, reason: 'Evergreen pipeline disabled' });
  }

  const hour = athensHour();
  if (!skipHourCheck && !settings.allowedHours.includes(hour)) {
    return NextResponse.json({
      ok: true,
      reason: `Outside allowed hours (now: ${hour}h Athens, allowed: ${settings.allowedHours.join(', ')})`,
    });
  }

  const result = await runEvergreenEngine(settings.articlesPerRun, settings.targetDraftCount);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request, false);
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';
  return handle(request, force);
}
