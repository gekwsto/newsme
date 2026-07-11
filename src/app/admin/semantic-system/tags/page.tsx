import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Semantic Tags | Admin ${BRAND.name}`,
};

export default async function SemanticTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { category: categorySlug, q } = await searchParams;

  const categories = await prisma.semanticCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, isActive: true },
  });

  const selectedCat = categories.find((c) => c.slug === categorySlug);

  const tags = await prisma.semanticTag.findMany({
    where: {
      ...(selectedCat ? { semanticCategoryId: selectedCat.id } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ semanticCategoryId: 'asc' }, { name: 'asc' }],
    include: {
      semanticCategory: { select: { name: true, slug: true } },
      _count: { select: { aliases: { where: { isActive: true } } } },
    },
  });

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Semantic Tags</h1>
            <p className="text-sm text-slate-500 mt-1">{tags.length} tags</p>
          </div>
          <Link href="/admin/semantic-system" className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Back
          </Link>
        </div>

        {/* Filters */}
        <form method="GET" className="flex gap-3 flex-wrap">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name..."
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 w-48"
          />
          <select
            name="category"
            defaultValue={categorySlug ?? ''}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Filter
          </button>
          {(q || categorySlug) && (
            <Link href="/admin/semantic-system/tags" className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        {/* Tags table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {tags.length === 0 && (
            <p className="p-5 text-sm text-slate-400">No tags found.</p>
          )}
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/admin/semantic-system/tags/${tag.id}`}
              className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              {/* Status */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tag.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-900 dark:text-white">{tag.name}</span>
                {tag.isPriority && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                    PRIORITY
                  </span>
                )}
              </div>

              {/* Category */}
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 flex-shrink-0">
                {tag.semanticCategory.name}
              </span>

              {/* Aliases count */}
              <span className="text-xs text-slate-400 w-20 text-right flex-shrink-0">
                {tag._count.aliases} aliases
              </span>

              {/* Weight */}
              <span className="text-xs font-mono text-slate-500 w-16 text-right flex-shrink-0">
                ×{tag.weight}
              </span>

              {/* Flags */}
              <div className="flex gap-1 flex-shrink-0">
                {tag.useForArticleTagging && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">art</span>
                )}
                {tag.useForImageMatching && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">img</span>
                )}
              </div>

              <span className="text-slate-400 flex-shrink-0">›</span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
