'use client';

import { useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Save, Eye, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { updateArticle } from '@/actions/articles';
import type { Article, Category } from '@/generated/prisma/client';
import { ArticleStatus } from '@/generated/prisma/enums';

interface ArticleEditFormProps {
  article: Article & { category: Category };
  categories: Category[];
  imageSlot?: ReactNode;
}

const statusLabels: Record<ArticleStatus, string> = {
  DRAFT: 'Πρόχειρο',
  PENDING_APPROVAL: 'Προς Έγκριση',
  APPROVED: 'Εγκεκριμένο',
  PUBLISHED: 'Δημοσιευμένο',
  REJECTED: 'Απορριφθέν',
};

export default function ArticleEditForm({ article, categories, imageSlot }: ArticleEditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    categoryId: article.categoryId,
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    status: article.status,
    aiCommentary: article.aiCommentary ?? '',
  });

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await updateArticle(article.id, {
        ...form,
        status: form.status as ArticleStatus,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        aiCommentary: form.aiCommentary || undefined,
      });
      setSaved(true);
    });
  };

  const inputClass =
    'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
        <Link
          href="/admin/approvals"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Πίσω
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/articles/${article.id}/preview`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Eye size={14} />
            Preview
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm font-bold bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <CheckCircle size={14} />
            ) : (
              <Save size={14} />
            )}
            {saved ? 'Αποθηκεύτηκε!' : 'Αποθήκευση'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: content */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div>
              <label className={labelClass}>Τίτλος</label>
              <input type="text" value={form.title} onChange={set('title')} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input type="text" value={form.slug} onChange={set('slug')} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Εισαγωγή (Excerpt)</label>
              <textarea
                value={form.excerpt}
                onChange={set('excerpt')}
                required
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Περιεχόμενο (HTML)</label>
              <textarea
                value={form.content}
                onChange={set('content')}
                required
                rows={16}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelClass}>AI Σχολιασμός</label>
              <textarea
                value={form.aiCommentary}
                onChange={set('aiCommentary')}
                rows={3}
                placeholder="Αφήστε κενό για να μην εμφανιστεί..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Right: meta */}
        <div className="space-y-5">
          {/* Status + Category */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div>
              <label className={labelClass}>Κατάσταση</label>
              <select value={form.status} onChange={set('status')} className={inputClass}>
                {(Object.entries(statusLabels) as [ArticleStatus, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Κατηγορία</label>
              <select value={form.categoryId} onChange={set('categoryId')} className={inputClass}>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {imageSlot}

          {/* SEO */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
              SEO
            </h3>
            <div>
              <label className={labelClass}>SEO Title</label>
              <input
                type="text"
                value={form.seoTitle}
                onChange={set('seoTitle')}
                placeholder={form.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>SEO Description</label>
              <textarea
                value={form.seoDescription}
                onChange={set('seoDescription')}
                rows={3}
                placeholder={form.excerpt}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
