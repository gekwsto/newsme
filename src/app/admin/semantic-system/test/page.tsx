import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';
import { BRAND } from '@/config/brand';
import SemanticTestPanel from './SemanticTestPanel';

export const metadata: Metadata = {
  title: `Semantic Test | Admin ${BRAND.name}`,
};

export default async function SemanticTestPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Semantic Test Panel</h1>
            <p className="text-sm text-slate-500 mt-1">
              Analyze article text with the DB-backed semantic engine (Phase B).
            </p>
          </div>
          <Link href="/admin/semantic-system" className="text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Back
          </Link>
        </div>
        <SemanticTestPanel />
      </div>
    </AdminShell>
  );
}
