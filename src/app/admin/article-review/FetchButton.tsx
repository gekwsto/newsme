'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { fetchArticlesForReview } from '@/actions/article-review';

export default function FetchButton() {
  const [pending, startT] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const run = () =>
    startT(async () => {
      setResult(null);
      const res = await fetchArticlesForReview();
      if (res.ok) {
        setResult(`+${res.newArticles} νέα άρθρα (${res.fetched} fetched)`);
      } else {
        setResult(`Σφάλμα: ${res.error}`);
      }
      setTimeout(() => setResult(null), 4000);
    });

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Fetch Νέα Άρθρα
      </button>
      {result && (
        <span className="text-sm text-slate-500 dark:text-slate-400">{result}</span>
      )}
    </div>
  );
}
