'use client';

import { useState, useTransition } from 'react';
import { Play, Loader2 } from 'lucide-react';

interface PipelineResult {
  ok: boolean;
  articlesGenerated: number;
  facebookPosted: number;
  error?: string;
  skippedReason?: string;
}

export default function PipelineTrigger() {
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<PipelineResult | null>(null);

  const run = () =>
    startRun(async () => {
      setResult(null);
      const res = await fetch('/api/scheduler/news-pipeline', { method: 'POST' });
      const data = (await res.json()) as PipelineResult;
      setResult(data);
    });

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 self-start"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        Εκτέλεση Pipeline Τώρα
      </button>

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          result.ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {result.skippedReason ? (
            <p>Παρακάμφθηκε: {result.skippedReason}</p>
          ) : result.ok ? (
            <p>{result.articlesGenerated} άρθρα δημιουργήθηκαν · {result.facebookPosted} Facebook posts</p>
          ) : (
            <p>Σφάλμα: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
