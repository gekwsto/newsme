import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import ImageLibraryClient from './ImageLibraryClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Image Library | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

export default async function ImageLibraryPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [categories, totalAssets, activeAssets] = await Promise.all([
    prisma.imageCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        tags: { orderBy: { name: 'asc' } },
        _count: { select: { assets: true } },
      },
    }),
    prisma.imageAsset.count(),
    prisma.imageAsset.count({ where: { isActive: true } }),
  ]);

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <ImageLibraryClient
        initialCategories={categories}
        totalAssets={totalAssets}
        activeAssets={activeAssets}
      />
    </AdminShell>
  );
}
