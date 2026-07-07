import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import TaxonomyClient, { type TagKeyword } from './TaxonomyClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Image Taxonomy | Admin' };

export default async function ImageTaxonomyPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const categories = await prisma.imageCategory.findMany({
    orderBy: { name: 'asc' },
    include: {
      tags: {
        orderBy: { name: 'asc' },
        include: { _count: { select: { assets: true } } },
      },
      _count: { select: { assets: true, tags: true } },
    },
  });

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <TaxonomyClient initialCategories={categories.map((c) => ({
          ...c,
          tags: c.tags.map((t) => ({ ...t, keywords: (t.keywords ?? []) as unknown as TagKeyword[] })),
        }))} />
    </AdminShell>
  );
}
