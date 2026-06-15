import { NextResponse } from 'next/server';
import { runNewsPipeline } from '@/services/news-auto-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const cronSecret = request.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNewsPipeline();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNewsPipeline();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
