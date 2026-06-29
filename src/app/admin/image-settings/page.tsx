import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { ImageIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCategoryImageSettings } from '@/actions/news-settings';
import AdminShell from '@/components/admin/AdminShell';
import ImageSettingsForm from './ImageSettingsForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Image Settings | Admin ${BRAND.name}`,
};

export default async function ImageSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [categories, settings] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    getCategoryImageSettings(),
  ]);

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon size={22} className="text-slate-400" />
            Image Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Ρύθμιση image mode ανά κατηγορία</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex items-start gap-4 mb-5 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Σχετικά με τα modes</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                <strong>TEMPLATE</strong> — Χρησιμοποιεί το χρώμα της κατηγορίας για branded placeholder image. Χωρίς κόστος.<br />
                <strong>AI_GENERATED</strong> — Δεσμεύεται για μελλοντική υλοποίηση AI image generation (π.χ. DALL-E ή Stable Diffusion).
              </p>
            </div>
          </div>
          <ImageSettingsForm categories={categories} settings={settings} />
        </div>
      </div>
    </AdminShell>
  );
}
