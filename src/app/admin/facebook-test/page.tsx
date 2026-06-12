import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';
import FacebookTestClient from './FacebookTestClient';

export const dynamic = 'force-dynamic';

export default async function FacebookTestPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');
  if (session.user.role !== 'ADMIN') redirect('/admin');

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const hasToken = !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/admin/social-posts"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Social Posts
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Facebook Test</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Facebook Publish Test
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Τοπική δοκιμή σύνδεσης με Facebook Graph API. Δεν επηρεάζει posts ή workflow.
          </p>
        </div>

        {/* Credential status */}
        <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">FACEBOOK_PAGE_ID</span>
            {pageId ? (
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                {pageId}
              </span>
            ) : (
              <span className="text-xs font-medium text-red-500">❌ Δεν έχει οριστεί</span>
            )}
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">FACEBOOK_PAGE_ACCESS_TOKEN</span>
            {hasToken ? (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Ορίστηκε</span>
            ) : (
              <span className="text-xs font-medium text-red-500">❌ Δεν έχει οριστεί</span>
            )}
          </div>
        </div>

        {!pageId || !hasToken ? (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 mb-6">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">
              Συμπλήρωσε τα credentials πρώτα
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Άνοιξε το <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env.local</code> και συμπλήρωσε{' '}
              <code className="font-mono">FACEBOOK_PAGE_ID</code> και{' '}
              <code className="font-mono">FACEBOOK_PAGE_ACCESS_TOKEN</code>.
              Κάνε restart τον dev server μετά.
            </p>
          </div>
        ) : null}

        {/* Test publisher */}
        <FacebookTestClient />
      </div>
    </AdminShell>
  );
}
