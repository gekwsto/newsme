import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { BRAND } from '@/config/brand';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { updateAuthor } from '@/actions/authors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Επεξεργασία Author | Admin ${BRAND.name}`,
};

export default async function EditAuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { id } = await params;
  const author = await prisma.author.findUnique({ where: { id } });
  if (!author) notFound();

  const inputClass = 'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5';

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Επεξεργασία Author</h1>
          <p className="text-slate-400 text-sm mt-1">{author.name}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <form
            action={async (fd: FormData) => {
              'use server';
              const str = (key: string) => (fd.get(key) as string)?.trim() || null;
              await updateAuthor(id, {
                name: fd.get('name') as string,
                slug: fd.get('slug') as string,
                title: str('title'),
                bio: str('bio'),
                avatarUrl: str('avatarUrl'),
                twitterUrl: str('twitterUrl'),
                facebookUrl: str('facebookUrl'),
                instagramUrl: str('instagramUrl'),
                linkedinUrl: str('linkedinUrl'),
                youtubeUrl: str('youtubeUrl'),
                tiktokUrl: str('tiktokUrl'),
              });
              redirect('/admin/authors');
            }}
            className="space-y-4"
          >
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Όνομα *</label>
                <input name="name" required defaultValue={author.name} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Slug *</label>
                <input name="slug" required defaultValue={author.slug} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Τίτλος / Ρόλος</label>
                <input name="title" defaultValue={author.title ?? ''} className={inputClass} placeholder="Συντακτική Ομάδα" />
              </div>
              <div>
                <label className={labelClass}>Avatar URL</label>
                <input name="avatarUrl" defaultValue={author.avatarUrl ?? ''} className={inputClass} placeholder="https://..." />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Bio</label>
                <textarea name="bio" rows={3} defaultValue={author.bio ?? ''} className={`${inputClass} resize-none`} placeholder="Σύντομη περιγραφή..." />
              </div>
            </div>

            {/* Social media */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Social Media</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Twitter / X URL</label>
                  <input name="twitterUrl" defaultValue={author.twitterUrl ?? ''} className={inputClass} placeholder="https://x.com/username" />
                </div>
                <div>
                  <label className={labelClass}>Facebook URL</label>
                  <input name="facebookUrl" defaultValue={author.facebookUrl ?? ''} className={inputClass} placeholder="https://facebook.com/username" />
                </div>
                <div>
                  <label className={labelClass}>Instagram URL</label>
                  <input name="instagramUrl" defaultValue={author.instagramUrl ?? ''} className={inputClass} placeholder="https://instagram.com/username" />
                </div>
                <div>
                  <label className={labelClass}>LinkedIn URL</label>
                  <input name="linkedinUrl" defaultValue={author.linkedinUrl ?? ''} className={inputClass} placeholder="https://linkedin.com/in/username" />
                </div>
                <div>
                  <label className={labelClass}>YouTube URL</label>
                  <input name="youtubeUrl" defaultValue={author.youtubeUrl ?? ''} className={inputClass} placeholder="https://youtube.com/@channel" />
                </div>
                <div>
                  <label className={labelClass}>TikTok URL</label>
                  <input name="tiktokUrl" defaultValue={author.tiktokUrl ?? ''} className={inputClass} placeholder="https://tiktok.com/@username" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <a href="/admin/authors" className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors">
                Ακύρωση
              </a>
              <button type="submit" className="bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors">
                Αποθήκευση
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
