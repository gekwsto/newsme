import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';
import CategoryWeightForm from './CategoryWeightForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Semantic Categories | Admin ${BRAND.name}`,
};

export default async function SemanticCategoriesPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const categories = await prisma.semanticCategory.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { tags: true } },
      category: { select: { name: true, slug: true } },
    },
  });

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Semantic Categories</h1>
            <p className="text-sm text-slate-500 mt-1">{categories.length} κατηγορίες</p>
          </div>
          <Link href="/admin/semantic-system" className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Back
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-4 px-5 py-4">
              {/* Status dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cat.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />

              {/* Name + DB category link */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white">{cat.name}</p>
                <p className="text-xs text-slate-400 font-mono">{cat.slug}</p>
                {cat.category && (
                  <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                    → Article category: {cat.category.name}
                  </p>
                )}
              </div>

              {/* Tag count */}
              <span className="text-sm text-slate-500 w-20 text-right flex-shrink-0">
                {cat._count.tags} tags
              </span>

              {/* Weight editor */}
              <CategoryWeightForm id={cat.id} name={cat.name} currentWeight={cat.weight} isActive={cat.isActive} />
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
