import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Semantic System | Admin ${BRAND.name}`,
};

async function fetchStats() {
  const [
    categoryCount,
    activeTagCount,
    aliasCount,
    versions,
  ] = await Promise.all([
    prisma.semanticCategory.count({ where: { isActive: true } }),
    prisma.semanticTag.count({ where: { isActive: true } }),
    prisma.semanticTagAlias.count({ where: { isActive: true } }),
    prisma.semanticConfigVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { version: true, description: true, createdAt: true, isActive: true, createdBy: true },
    }),
  ]);

  const topCategories = await prisma.semanticTag.groupBy({
    by: ['semanticCategoryId'],
    _count: { id: true },
    where: { isActive: true },
    orderBy: { _count: { id: 'desc' } },
    take: 11,
  });

  const categoryNames = await prisma.semanticCategory.findMany({
    where: { id: { in: topCategories.map((c) => c.semanticCategoryId) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(categoryNames.map((c) => [c.id, c.name]));

  return {
    categoryCount,
    activeTagCount,
    aliasCount,
    versions,
    topCategories: topCategories.map((c) => ({
      name: nameMap.get(c.semanticCategoryId) ?? '?',
      count: c._count.id,
    })),
  };
}

export default async function SemanticSystemPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const stats = await fetchStats();

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Semantic System (DB)
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              DB-backed canonical tag matching — replaces JSON-based semantic filter in Phase C.
            </p>
          </div>
          <Link
            href="/admin/semantic-matrix"
            className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            ← Legacy Semantic Matrix
          </Link>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/admin/semantic-system/categories', label: 'Categories', count: stats.categoryCount, color: 'violet' },
            { href: '/admin/semantic-system/tags', label: 'Tags', count: stats.activeTagCount, color: 'indigo' },
            { href: '/admin/semantic-system/tags', label: 'Active Aliases', count: stats.aliasCount, color: 'blue' },
            { href: '/admin/semantic-system/test', label: 'Test Panel', count: null, color: 'emerald' },
          ].map(({ href, label, count, color }) => (
            <Link
              key={href + label}
              href={href}
              className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-${color}-400 dark:hover:border-${color}-600 transition-colors group`}
            >
              <p className="text-xs text-slate-500">{label}</p>
              {count !== null ? (
                <p className={`mt-1 text-2xl font-bold text-${color}-600 dark:text-${color}-400`}>{count}</p>
              ) : (
                <p className={`mt-1 text-sm font-semibold text-${color}-600 dark:text-${color}-400`}>Open →</p>
              )}
            </Link>
          ))}
        </div>

        {/* Tags by category */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Active Tags per Category
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.topCategories.map(({ name, count }) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300"
              >
                {name}
                <span className="font-bold bg-violet-200 dark:bg-violet-800 px-1.5 py-0.5 rounded-full">{count}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Version history */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Config Version History
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {stats.versions.length === 0 && (
              <p className="p-5 text-sm text-slate-400">No versions yet — run the import script to create one.</p>
            )}
            {stats.versions.map((v) => (
              <div key={v.version} className="flex items-center gap-4 px-5 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${v.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  v{v.version}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{v.description ?? '—'}</span>
                <span className="text-xs text-slate-400">
                  {new Date(v.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
                {v.isActive && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    ACTIVE
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Navigation links */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/admin/semantic-system/categories', title: 'Manage Categories', desc: 'Edit weights, activate/deactivate categories' },
            { href: '/admin/semantic-system/tags', title: 'Manage Tags', desc: 'Edit tag weights, flags, and aliases' },
            { href: '/admin/semantic-system/test', title: 'Test Scoring', desc: 'Analyze article text with the DB semantic engine' },
            { href: '/admin/semantic-system/compare', title: 'Compare Old vs New', desc: '50 real articles: JSON-based vs DB-backed side-by-side' },
            { href: '/admin/semantic-system/shadow', title: 'Shadow Mode Results', desc: 'Live production comparison — NEW runs in parallel, OLD stays primary' },
          ].map(({ href, title, desc }) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
            >
              <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{desc}</p>
            </Link>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
