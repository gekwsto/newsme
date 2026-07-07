'use client';

import { useState, useTransition, useRef } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Save, Eye, ArrowLeft, Loader2, CheckCircle, Code2, FileText } from 'lucide-react';
import { updateArticle } from '@/actions/articles';
import { markdownToHtml } from '@/lib/markdown';
import type { Article, Category } from '@/generated/prisma/client';
import { ArticleStatus } from '@/generated/prisma/enums';

interface AuthorOption { id: string; name: string; }

interface ArticleEditFormProps {
  article: Article & { category: Category };
  categories: Category[];
  authors: AuthorOption[];
  imageSlot?: ReactNode;
}

const statusLabels: Record<ArticleStatus, string> = {
  DRAFT: 'Πρόχειρο',
  PENDING_APPROVAL: 'Προς Έγκριση',
  APPROVED: 'Εγκεκριμένο',
  PUBLISHED: 'Δημοσιευμένο',
  REJECTED: 'Απορριφθέν',
};

export default function ArticleEditForm({ article, categories, authors, imageSlot }: ArticleEditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [markdownMode, setMarkdownMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    categoryId: article.categoryId,
    displayAuthorId: (article as Article & { displayAuthorId?: string | null }).displayAuthorId ?? '',
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

  // Insert markdown syntax around the selected text (or a placeholder)
  const insertAtCursor = (before: string, after = '', placeholder = 'κείμενο') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = form.content.slice(start, end) || placeholder;
    const newContent = form.content.slice(0, start) + before + selected + after + form.content.slice(end);
    setForm((prev) => ({ ...prev, content: newContent }));
    setSaved(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      // Convert markdown to HTML before saving
      const contentToSave = markdownMode
        ? markdownToHtml(form.content)
        : form.content;

      await updateArticle(article.id, {
        ...form,
        content: contentToSave,
        status: form.status as ArticleStatus,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        aiCommentary: form.aiCommentary || undefined,
        displayAuthorId: form.displayAuthorId || null,
      });

      if (markdownMode) {
        setForm((prev) => ({ ...prev, content: contentToSave }));
        setMarkdownMode(false);
        setShowPreview(false);
      }
      setSaved(true);
    });
  };

  const renderedContent = markdownMode
    ? markdownToHtml(form.content)
    : form.content;

  const inputClass =
    'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5';
  const toolbarBtn = 'px-2.5 py-1 text-xs font-bold rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50';

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

            {/* Content editor */}
            <div>
              {/* Content header: label + mode toggle + preview toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className={labelClass + ' mb-0'}>Περιεχόμενο</label>
                <div className="flex items-center gap-2">
                  {/* Markdown / HTML mode toggle */}
                  <button
                    type="button"
                    onClick={() => { setMarkdownMode((m) => !m); setShowPreview(false); }}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                      markdownMode
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                        : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {markdownMode ? <FileText size={11} /> : <Code2 size={11} />}
                    {markdownMode ? 'Markdown' : 'HTML'}
                  </button>
                  {/* Preview toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                      showPreview
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                        : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Eye size={11} />
                    {showPreview ? 'Κλείσιμο' : 'Preview'}
                  </button>
                </div>
              </div>

              {/* Markdown toolbar */}
              {markdownMode && !showPreview && (
                <div className="flex flex-wrap gap-1 mb-2 p-2 bg-slate-50 dark:bg-slate-700/60 rounded-lg border border-slate-200 dark:border-slate-600">
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('**', '**', 'bold')} title="Bold"><strong>B</strong></button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('*', '*', 'italic')} title="Italic"><em>I</em></button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n# ', '', 'Τίτλος H1')} title="H1">H1</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n## ', '', 'Τίτλος H2')} title="H2">H2</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n### ', '', 'Τίτλος H3')} title="H3">H3</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('[', '](https://)', 'κείμενο')} title="Link">🔗</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n- ', '', 'item')} title="Bullet list">• List</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n1. ', '', 'item')} title="Numbered list">1. List</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('\n> ', '', 'quote')} title="Blockquote">&ldquo;</button>
                  <button type="button" className={toolbarBtn} onClick={() => insertAtCursor('`', '`', 'code')} title="Inline code">{'<>'}</button>
                </div>
              )}

              {/* Preview pane */}
              {showPreview ? (
                <div className="min-h-64 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-600 overflow-auto">
                  {renderedContent ? (
                    <div
                      className="article-content prose prose-slate dark:prose-invert max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: renderedContent }}
                    />
                  ) : (
                    <p className="text-slate-400 italic text-sm">Δεν υπάρχει περιεχόμενο για preview.</p>
                  )}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={form.content}
                  onChange={set('content')}
                  required
                  rows={18}
                  placeholder={markdownMode
                    ? '# Τίτλος άρθρου\n\nΠρώτη παράγραφος...\n\n## Υπότιτλος\n\nΔεύτερη παράγραφος.\n\n- Bullet item 1\n- Bullet item 2\n\n**bold** και *italic*'
                    : '<p>Περιεχόμενο HTML...</p>'
                  }
                  className={`${inputClass} resize-y ${markdownMode ? 'font-mono text-sm leading-relaxed' : 'font-mono text-xs'}`}
                />
              )}

              {markdownMode && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">
                  Markdown mode — κατά την αποθήκευση μετατρέπεται αυτόματα σε HTML. Μη χρησιμοποιείς αν το κείμενο είναι ήδη HTML.
                </p>
              )}
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
            <div>
              <label className={labelClass}>Συντάκτης</label>
              <select value={form.displayAuthorId} onChange={set('displayAuthorId')} className={inputClass}>
                <option value="">— Default (Newsme Team) —</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
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
