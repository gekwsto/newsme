import { prisma } from '@/lib/db';

export interface ServiceHealth {
  status: 'ok' | 'warning' | 'error';
  label: string;
  message: string;
  lastRun: Date | null;
  details?: string;
}

function withTimeout<T>(fn: () => Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([fn(), new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

export async function checkDatabase(): Promise<ServiceHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', label: 'Database', message: 'Connected', lastRun: new Date() };
  } catch (err) {
    return { status: 'error', label: 'Database', message: 'Connection failed', lastRun: null, details: String(err) };
  }
}

export async function checkOpenAI(): Promise<ServiceHealth> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: 'error', label: 'OpenAI API', message: 'OPENAI_API_KEY not configured', lastRun: null };
  if (!key.startsWith('sk-')) return { status: 'warning', label: 'OpenAI API', message: 'Key format unexpected', lastRun: null };

  const [lastOk, lastErr] = await Promise.all([
    prisma.systemEvent.findFirst({ where: { service: 'openai', status: 'OK' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.systemEvent.findFirst({ where: { service: 'openai', status: 'ERROR' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, message: true } }),
  ]);

  if (lastErr && (!lastOk || lastErr.createdAt > lastOk.createdAt)) {
    return { status: 'warning', label: 'OpenAI API', message: `Last error: ${lastErr.message}`, lastRun: lastOk?.createdAt ?? null };
  }
  return { status: 'ok', label: 'OpenAI API', message: 'Configured', lastRun: lastOk?.createdAt ?? null };
}

export async function checkFacebook(): Promise<ServiceHealth> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return { status: 'error', label: 'Facebook API', message: 'Credentials not configured', lastRun: null };

  const fallback: ServiceHealth = { status: 'error', label: 'Facebook API', message: 'Check timed out', lastRun: null };
  return withTimeout(async () => {
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=id,name&access_token=${token}`);
      const json = await res.json() as { id?: string; error?: { message?: string } };
      if (json.error) return { status: 'error' as const, label: 'Facebook API', message: json.error.message ?? 'API error', lastRun: null };
      if (json.id) return { status: 'ok' as const, label: 'Facebook API', message: 'Token valid', lastRun: new Date() };
      return { status: 'error' as const, label: 'Facebook API', message: 'Unexpected response', lastRun: null };
    } catch (err) {
      return { status: 'error' as const, label: 'Facebook API', message: 'Network error', lastRun: null, details: String(err) };
    }
  }, 5000, fallback);
}

export async function checkScheduler(): Promise<ServiceHealth> {
  const [overdue, lastRun] = await Promise.all([
    prisma.scheduledPost.count({ where: { status: 'PENDING', scheduledFor: { lte: new Date(Date.now() - 10 * 60 * 1000) } } }),
    prisma.systemEvent.findFirst({ where: { service: 'scheduler' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  if (overdue > 0) return { status: 'warning', label: 'Scheduler', message: `${overdue} overdue post(s)`, lastRun: lastRun?.createdAt ?? null };
  const msg = lastRun ? 'Running' : process.env.CRON_SECRET ? 'Configured (no runs yet)' : 'Configure CRON_SECRET + cron job';
  return { status: lastRun ? 'ok' : 'warning', label: 'Scheduler', message: msg, lastRun: lastRun?.createdAt ?? null };
}

export async function checkRSSEngine(): Promise<ServiceHealth> {
  const latest = await prisma.rssSource.findFirst({ where: { enabled: true }, orderBy: { lastFetchedAt: 'desc' }, select: { lastFetchedAt: true } });
  if (!latest) return { status: 'warning', label: 'RSS Engine', message: 'No enabled sources', lastRun: null };
  if (!latest.lastFetchedAt) return { status: 'warning', label: 'RSS Engine', message: 'Never fetched — click Ανανέωση Όλων', lastRun: null };

  const ageH = (Date.now() - latest.lastFetchedAt.getTime()) / 3600000;
  if (ageH > 24) return { status: 'warning', label: 'RSS Engine', message: `Last fetch ${Math.round(ageH)}h ago`, lastRun: latest.lastFetchedAt };
  return { status: 'ok', label: 'RSS Engine', message: 'Active', lastRun: latest.lastFetchedAt };
}

export async function checkTrendClustering(): Promise<ServiceHealth> {
  const [lastCluster, lastEvent] = await Promise.all([
    prisma.trendCluster.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.systemEvent.findFirst({ where: { service: 'clustering' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const lastRun = lastCluster?.updatedAt ?? lastEvent?.createdAt ?? null;
  if (!lastRun) return { status: 'warning', label: 'Trend Clustering', message: 'No clusters yet', lastRun: null };
  const ageH = (Date.now() - lastRun.getTime()) / 3600000;
  if (ageH > 48) return { status: 'warning', label: 'Trend Clustering', message: `Last run ${Math.round(ageH)}h ago`, lastRun };
  return { status: 'ok', label: 'Trend Clustering', message: 'Active', lastRun };
}

export async function checkAnalyticsSync(): Promise<ServiceHealth> {
  const [lastSync, lastEvent] = await Promise.all([
    prisma.postPerformance.findFirst({ where: { lastSyncedAt: { not: null } }, orderBy: { lastSyncedAt: 'desc' }, select: { lastSyncedAt: true } }),
    prisma.systemEvent.findFirst({ where: { service: 'analytics' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const lastRun = lastSync?.lastSyncedAt ?? lastEvent?.createdAt ?? null;
  return { status: 'ok', label: 'Analytics Sync', message: lastRun ? 'Available' : 'No syncs yet', lastRun };
}

export async function fetchAllHealthChecks() {
  const [database, openai, facebook, scheduler, rssEngine, trendClustering, analyticsSync] =
    await Promise.all([
      checkDatabase(), checkOpenAI(), checkFacebook(),
      checkScheduler(), checkRSSEngine(), checkTrendClustering(), checkAnalyticsSync(),
    ]);
  return { database, openai, facebook, scheduler, rssEngine, trendClustering, analyticsSync };
}
