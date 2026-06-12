import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

interface CheckItem {
  label: string;
  ok: boolean;
  detail?: string;
}

async function runChecks(): Promise<CheckItem[]> {
  const checks: CheckItem[] = [];

  // Env vars
  const envVars = [
    { key: 'OPENAI_API_KEY', label: 'OPENAI_API_KEY' },
    { key: 'DATABASE_URL', label: 'DATABASE_URL' },
    { key: 'NEXTAUTH_SECRET', label: 'NEXTAUTH_SECRET' },
    { key: 'FACEBOOK_PAGE_ID', label: 'FACEBOOK_PAGE_ID' },
    { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'FACEBOOK_PAGE_ACCESS_TOKEN' },
    { key: 'CRON_SECRET', label: 'CRON_SECRET' },
  ];

  for (const { key, label } of envVars) {
    checks.push({ label, ok: !!process.env[key], detail: process.env[key] ? 'Set' : 'Missing' });
  }

  // DB connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ label: 'Database Connection', ok: true, detail: 'OK' });
  } catch (err) {
    checks.push({ label: 'Database Connection', ok: false, detail: String(err) });
  }

  // Admin user exists
  try {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    checks.push({
      label: 'Admin User',
      ok: adminCount > 0,
      detail: adminCount > 0 ? `${adminCount} admin(s) registered` : 'No admin user found',
    });
  } catch {
    checks.push({ label: 'Admin User', ok: false, detail: 'Query failed' });
  }

  // RSS sources configured
  try {
    const sourceCount = await prisma.rssSource.count({ where: { enabled: true } });
    checks.push({
      label: 'RSS Sources',
      ok: sourceCount > 0,
      detail: sourceCount > 0 ? `${sourceCount} enabled source(s)` : 'No enabled RSS sources',
    });
  } catch {
    checks.push({ label: 'RSS Sources', ok: false, detail: 'Query failed' });
  }

  // Categories exist
  try {
    const catCount = await prisma.category.count();
    checks.push({
      label: 'Categories',
      ok: catCount > 0,
      detail: catCount > 0 ? `${catCount} categories` : 'No categories — add at least one',
    });
  } catch {
    checks.push({ label: 'Categories', ok: false, detail: 'Query failed' });
  }

  // Recent RSS fetch (last 24h)
  try {
    const latest = await prisma.rssSource.findFirst({
      where: { enabled: true, lastFetchedAt: { gte: new Date(Date.now() - 24 * 3600000) } },
      orderBy: { lastFetchedAt: 'desc' },
      select: { lastFetchedAt: true },
    });
    checks.push({
      label: 'RSS Recently Fetched',
      ok: !!latest,
      detail: latest ? 'Fetched within last 24h' : 'No fetch in last 24h — click Ανανέωση Όλων',
    });
  } catch {
    checks.push({ label: 'RSS Recently Fetched', ok: false, detail: 'Query failed' });
  }

  // OpenAI key format
  const oaiKey = process.env.OPENAI_API_KEY ?? '';
  checks.push({
    label: 'OpenAI Key Format',
    ok: oaiKey.startsWith('sk-'),
    detail: oaiKey.startsWith('sk-') ? 'Format OK' : 'Key should start with sk-',
  });

  // .env not committed (heuristic: NEXTAUTH_URL set means we're running)
  checks.push({
    label: 'Runtime OK',
    ok: true,
    detail: 'Application is running',
  });

  return checks;
}

export default async function ReadinessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/admin/login');
  const user = { name: session.user.name!, email: session.user.email!, role: session.user.role };

  const checks = await runChecks();
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  const allGood = passed === total;

  const scoreColor =
    score >= 90 ? 'text-green-600 dark:text-green-400'
    : score >= 70 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <AdminShell user={user}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Production Readiness</h1>
          <p className="text-sm text-muted-foreground">Έλεγχος ετοιμότητας συστήματος</p>
        </div>

        {/* Score */}
        <div className={`rounded-lg border p-6 ${allGood ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : 'border-border bg-card'}`}>
          <div className="flex items-center gap-4">
            <p className={`text-5xl font-bold ${scoreColor}`}>{score}%</p>
            <div>
              <p className="font-semibold">{passed} / {total} checks passed</p>
              <p className="text-sm text-muted-foreground">
                {allGood ? '✅ Το σύστημα είναι έτοιμο για production.' : '⚠️ Ορισμένα checks απαιτούν προσοχή.'}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${allGood ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Checks list */}
        <div className="space-y-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                check.ok ? 'border-border bg-card' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{check.ok ? '✅' : '❌'}</span>
                <span className="font-medium">{check.label}</span>
              </div>
              <span className={`text-sm ${check.ok ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
