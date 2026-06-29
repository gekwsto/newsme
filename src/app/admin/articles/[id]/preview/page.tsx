import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Clock, Eye, Edit } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import AICommentaryBox from '@/components/ui/AICommentaryBox';
import { addHeadingIds } from '@/lib/toc';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Preview Άρθρου | Admin ${BRAND.name}`,
};

export default async function ArticlePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { id } = await params;

  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      category: true,
      author: { select: { name: true } },
    },
  });

  if (!article) notFound();

  const contentWithIds = addHeadingIds(article.content);

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      {/* Preview toolbar */}
      <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-4 py-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Preview Mode — Δεν έχει δημοσιευτεί ακόμα
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/articles/${article.id}/edit`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors"
          >
            <Edit size={13} />
            Επεξεργασία
          </Link>
          <Link
            href="/admin/approvals"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Πίσω
          </Link>
        </div>
      </div>

      {/* Article preview */}
      <div className="max-w-3xl mx-auto">
        {/* Category */}
        <div className="flex items-center gap-2 mb-3">
          {article.status === 'PENDING_APPROVAL' && (
            <span className="bg-amber-500 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Προς Έγκριση
            </span>
          )}
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${article.category.color}20`, color: article.category.color }}
          >
            {article.category.name}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 leading-tight mb-4">
          {article.title}
        </h1>

        {/* Excerpt */}
        <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-6 border-l-4 border-red-500 pl-4">
          {article.excerpt}
        </p>

        {/* Author + meta */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 text-sm font-bold shrink-0">
              {article.author.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{article.author.name}</p>
              <p className="text-slate-400 text-xs">{formatDate(article.createdAt.toISOString())}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-500 text-sm">
            <span className="flex items-center gap-1"><Clock size={14} />{article.readTime} λεπτά</span>
            <span className="flex items-center gap-1"><Eye size={14} />{formatNumber(article.views)} views</span>
          </div>
        </div>

        {/* Cover image */}
        {article.coverImage && (
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-6 shadow-md">
            <Image
              src={article.coverImage}
              alt={article.title}
              fill
              className="object-cover"
              sizes="768px"
            />
          </div>
        )}

        {/* Content */}
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: contentWithIds }}
        />

        {/* AI Commentary */}
        {article.aiCommentary && (
          <AICommentaryBox commentary={article.aiCommentary} articleTitle={article.title} />
        )}
      </div>
    </AdminShell>
  );
}
