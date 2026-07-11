import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';
import TagFlagsForm from './TagFlagsForm';
import AliasManager from './AliasManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Tag Detail | Admin ${BRAND.name}`,
};

export default async function TagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { id } = await params;

  const tag = await prisma.semanticTag.findUnique({
    where: { id },
    include: {
      semanticCategory: { select: { name: true, slug: true } },
      aliases: { orderBy: [{ isActive: 'desc' }, { alias: 'asc' }] },
      tag: { select: { name: true } },
      imageTag: { select: { name: true, slug: true } },
    },
  });

  if (!tag) notFound();

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{tag.name}</h1>
              {tag.isPriority && (
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  PRIORITY
                </span>
              )}
              {!tag.isActive && (
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  INACTIVE
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              <Link
                href={`/admin/semantic-system/categories`}
                className="hover:text-violet-600 dark:hover:text-violet-400"
              >
                {tag.semanticCategory.name}
              </Link>
              {' · '}
              <span className="font-mono text-xs">{tag.slug}</span>
            </p>
          </div>
          <Link
            href="/admin/semantic-system/tags"
            className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            ← Tags
          </Link>
        </div>

        {/* Info boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-xs text-slate-400">Weight</p>
            <p className="text-lg font-bold text-violet-600 dark:text-violet-400">×{tag.weight}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-xs text-slate-400">Priority bonus</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{tag.isPriority ? `+${tag.bonus}` : '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-xs text-slate-400">Article Tag</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{tag.tag?.name ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-xs text-slate-400">Image Tag</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{tag.imageTag?.name ?? '—'}</p>
          </div>
        </div>

        {/* Flags */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Tag Flags</h2>
          <TagFlagsForm
            id={tag.id}
            isPriority={tag.isPriority}
            useForArticleTagging={tag.useForArticleTagging}
            useForImageMatching={tag.useForImageMatching}
            isActive={tag.isActive}
            currentWeight={tag.weight}
          />
        </section>

        {/* Aliases */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            Aliases ({tag.aliases.filter((a) => a.isActive).length} active / {tag.aliases.length} total)
          </h2>
          <AliasManager semanticTagId={tag.id} aliases={tag.aliases} />
        </section>
      </div>
    </AdminShell>
  );
}
