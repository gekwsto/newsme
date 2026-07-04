import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Star, UserPlus } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { toggleAuthorActive, setDefaultAuthor, createAuthor } from '@/actions/authors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Authors | Admin ${BRAND.name}`,
};

export default async function AdminAuthorsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const authors = await prisma.author.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { articles: true } } },
  });

  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5';
  const inputClass = 'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Authors</h1>
            <p className="text-slate-400 text-sm mt-1">{authors.length} συντάκτες</p>
          </div>
        </div>

        {/* Author list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mb-8 overflow-hidden">
          {authors.length === 0 ? (
            <p className="p-6 text-slate-400 text-sm">Δεν υπάρχουν ακόμα authors.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Όνομα</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Slug</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Τίτλος</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Άρθρα</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Default</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {authors.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {a.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{a.slug}</td>
                    <td className="px-4 py-3 text-slate-500">{a.title ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{a._count.articles}</td>
                    <td className="px-4 py-3 text-center">
                      <form action={toggleAuthorActive.bind(null, a.id, !a.isActive)}>
                        <button type="submit" title={a.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}>
                          {a.isActive
                            ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                            : <XCircle size={16} className="text-slate-300 mx-auto" />}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.isDefault ? (
                        <Star size={16} className="text-amber-400 mx-auto fill-amber-400" />
                      ) : (
                        <form action={setDefaultAuthor.bind(null, a.id)}>
                          <button type="submit" title="Ορισμός ως default">
                            <Star size={16} className="text-slate-300 mx-auto hover:text-amber-400 transition-colors" />
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/authors/${a.id}/edit`}
                        className="text-xs font-medium text-red-600 hover:text-red-500 transition-colors"
                      >
                        Επεξεργασία
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create author form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
            <UserPlus size={15} /> Νέος Author
          </h2>
          <form
            action={async (fd: FormData) => {
              'use server';
              await createAuthor({
                name: fd.get('name') as string,
                slug: (fd.get('slug') as string) || undefined,
                title: (fd.get('title') as string) || undefined,
                bio: (fd.get('bio') as string) || undefined,
                avatarUrl: (fd.get('avatarUrl') as string) || undefined,
              });
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <label className={labelClass}>Όνομα *</label>
              <input name="name" required className={inputClass} placeholder="Newsme Team" />
            </div>
            <div>
              <label className={labelClass}>Slug (προαιρετικό)</label>
              <input name="slug" className={inputClass} placeholder="newsme-team" />
            </div>
            <div>
              <label className={labelClass}>Τίτλος / Ρόλος</label>
              <input name="title" className={inputClass} placeholder="Συντακτική Ομάδα" />
            </div>
            <div>
              <label className={labelClass}>Avatar URL</label>
              <input name="avatarUrl" className={inputClass} placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Bio</label>
              <textarea name="bio" rows={3} className={`${inputClass} resize-none`} placeholder="Σύντομη περιγραφή..." />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
              >
                Δημιουργία
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
