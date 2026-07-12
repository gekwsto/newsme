'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateAndSaveArticle } from '@/actions/generate';
import type { GenerateInput } from '@/lib/ai/schemas';
import {
  TONES,
  ARTICLE_TYPES,
  TARGET_LENGTHS,
  toneLabels,
  articleTypeLabels,
  targetLengthLabels,
} from '@/lib/ai/schemas';

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
}

interface SuccessState {
  articleId: string;
  title: string;
}

export default function GeneratorForm({ categories }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const [topic, setTopic] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tone, setTone] = useState<GenerateInput['tone']>('informative');
  const [articleType, setArticleType] = useState<GenerateInput['articleType']>('original');
  const [targetLength, setTargetLength] = useState<GenerateInput['targetLength']>('medium');
  const [sourceUrl, setSourceUrl] = useState('');
  const [generateFacebookPost, setGenerateFacebookPost] = useState(true);
  const [generateAiCommentary, setGenerateAiCommentary] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const input: GenerateInput = {
      topic,
      categoryId,
      tone,
      articleType,
      targetLength,
      sourceUrl: sourceUrl.trim() || undefined,
      generateFacebookPost,
      generateAiCommentary,
    };

    startTransition(async () => {
      const result = await generateAndSaveArticle(input);
      if (result.ok) {
        setSuccess({ articleId: result.articleId, title: result.title });
      } else {
        setError(result.error);
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">✅</span>
          <div>
            <h2 className="font-semibold text-green-800 dark:text-green-200">Το άρθρο δημιουργήθηκε!</h2>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1 line-clamp-2">{success.title}</p>
          </div>
        </div>
        <p className="text-sm text-green-600 dark:text-green-400 mb-5">
          Αποθηκεύτηκε ως <strong>Pending Approval</strong>. Μπορείς να το δεις, να το επεξεργαστείς ή να το στείλεις για έγκριση.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/admin/articles/${success.articleId}/preview`}
            className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Προεπισκόπηση
          </a>
          <a
            href={`/admin/articles/${success.articleId}/edit`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Επεξεργασία
          </a>
          <a
            href="/admin/approvals"
            className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Ουρά Εγκρίσεων
          </a>
        </div>
        <button
          onClick={() => {
            setSuccess(null);
            setTopic('');
            setSourceUrl('');
          }}
          className="mt-4 text-sm text-green-600 dark:text-green-400 underline hover:no-underline"
        >
          Δημιούργησε άλλο άρθρο
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Topic */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Θέμα / Τίτλος <span className="text-red-500">*</span>
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          placeholder="π.χ. Η Ελλάδα ανακοινώνει νέο πακέτο μέτρων για την ενέργεια..."
          required
          minLength={5}
          maxLength={500}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <p className="mt-1 text-xs text-gray-400">{topic.length}/500</p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Κατηγορία <span className="text-red-500">*</span>
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Επιλέξτε κατηγορία...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Tone + Article Type row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ύφος</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as GenerateInput['tone'])}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TONES.map((t) => (
              <option key={t} value={t}>{toneLabels[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Τύπος Άρθρου</label>
          <select
            value={articleType}
            onChange={(e) => setArticleType(e.target.value as GenerateInput['articleType'])}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ARTICLE_TYPES.map((t) => (
              <option key={t} value={t}>{articleTypeLabels[t]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Target Length */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Μήκος Άρθρου</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TARGET_LENGTHS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setTargetLength(l)}
              className={`rounded-lg border px-3 py-2.5 text-xs font-medium text-center transition-colors ${
                targetLength === l
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {targetLengthLabels[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Source URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          URL Πηγής <span className="text-gray-400 font-normal">(προαιρετικό)</span>
        </label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Checkboxes */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={generateFacebookPost}
            onChange={(e) => setGenerateFacebookPost(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Δημιούργησε Facebook post <span className="text-gray-400">(αποθηκεύεται ως draft)</span>
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={generateAiCommentary}
            onChange={(e) => setGenerateAiCommentary(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Δημιούργησε AI Σχολιασμό <span className="text-gray-400">(εμφανίζεται στο άρθρο)</span>
          </span>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Δημιουργία άρθρου... (15-30 δευτ.)
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Δημιούργησε Άρθρο με AI
          </>
        )}
      </button>
    </form>
  );
}
