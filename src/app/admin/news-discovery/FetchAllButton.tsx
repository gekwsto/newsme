'use client';

import { useState, useTransition } from 'react';
import { fetchAllSources } from '@/actions/rss';

export default function FetchAllButton() {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        disabled={isPending}
        onClick={() => {
          setSummary(null);
          startTransition(async () => {
            const r = await fetchAllSources();
            if (r.ok) {
              const total = r.results.reduce((s, x) => s + x.newCount, 0);
              const errors = r.results.filter((x) => x.error).length;
              const scoredStr = r.scored > 0 ? ` · ${r.scored} scored` : '';
              const clusteredStr = r.clustered > 0 ? ` · ${r.clustered} trends` : '';
              setSummary(
                `+${total} νέα άρθρα${scoredStr}${clusteredStr}` + (errors > 0 ? ` (${errors} σφάλματα)` : '')
              );
            } else {
              setSummary(`⚠ ${r.error}`);
            }
          });
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Ανανέωση…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Ανανέωση Όλων
          </>
        )}
      </button>
      {summary && (
        <span
          className={`text-xs font-medium ${
            summary.startsWith('⚠') ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          {summary}
        </span>
      )}
    </div>
  );
}
