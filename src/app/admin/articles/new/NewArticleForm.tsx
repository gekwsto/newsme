'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FilePlus, Loader2 } from 'lucide-react';
import { createArticle } from '@/actions/articles';
import { ArticleType } from '@/generated/prisma/enums';

interface Category {
  id: string;
  name: string;
}

const articleTypeOptions: { value: ArticleType; label: string }[] = [
  { value: ArticleType.NEWS, label: 'News — Επικαιρότητα' },
  { value: ArticleType.OPINION, label: 'Opinion — Άποψη' },
  { value: ArticleType.GUIDE, label: 'Guide — Οδηγός' },
  { value: ArticleType.EVERGREEN, label: 'Evergreen — Διαχρονικό' },
];

export default function NewArticleForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    excerpt: '',
    categoryId: categories[0]?.id ?? '',
    articleType: ArticleType.NEWS,
  });

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createArticle({
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || form.title.trim(),
        categoryId: form.categoryId,
        articleType: form.articleType as ArticleType,
      });
      if (result.ok) {
        router.push(`/admin/articles/${result.id}/edit`);
      } else {
        setError(result.error);
      }
    });
  };

  const inputClass =
    'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
  const labelClass =
    'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
        <Link
          href="/admin/articles"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Πίσω στα Άρθρα
        </Link>
        <button
          type="submit"
          disabled={isPending || !form.title.trim() || !form.categoryId}
          className="flex items-center gap-1.5 text-sm font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <FilePlus size={14} />}
          Δημιουργία Άρθρου
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
        <div>
          <label className={labelClass}>Τίτλος *</label>
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            required
            autoFocus
            placeholder="π.χ. Πώς η AI αλλάζει την ιατρική διάγνωση"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Κατηγορία *</label>
            <select value={form.categoryId} onChange={set('categoryId')} required className={inputClass}>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Τύπος Άρθρου</label>
            <select value={form.articleType} onChange={set('articleType')} className={inputClass}>
              {articleTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Εισαγωγή (Excerpt)</label>
          <textarea
            value={form.excerpt}
            onChange={set('excerpt')}
            rows={3}
            placeholder="Σύντομη περιγραφή του άρθρου (προαιρετικό — αν αφεθεί κενό, θα χρησιμοποιηθεί ο τίτλος)"
            className={`${inputClass} resize-none`}
          />
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Μετά τη δημιουργία θα ανακατευθυνθείς στον επεξεργαστή για να προσθέσεις το περιεχόμενο, tags, εικόνα και SEO.
        </p>
      </div>
    </form>
  );
}
