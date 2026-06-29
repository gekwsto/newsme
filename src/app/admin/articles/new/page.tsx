import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { FilePlus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import NewArticleForm from './NewArticleForm';

export const metadata: Metadata = {
  title: `Νέο Άρθρο | Admin ${BRAND.name}`,
};

export default async function NewArticlePage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FilePlus size={22} className="text-slate-400" />
          Νέο Άρθρο
        </h1>
        <p className="text-slate-400 text-sm mt-1">Δημιούργησε νέο άρθρο χειροκίνητα</p>
      </div>
      <NewArticleForm categories={categories} />
    </AdminShell>
  );
}
