'use client';

import { useState, useTransition } from 'react';
import { Play, Loader2 } from 'lucide-react';

interface EngineResult {
  ok: boolean;
  generated: number;
  failed: number;
  draftCount: number;
  totalWords: number;
  estimatedCostUsd: number;
  reason?: string;
  error?: string;
}

export default function EvergreenPipelineTrigger() {
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<EngineResult | null>(null);

  const run = () =>
    startRun(async () => {
      setResult(null);
      const res = await fetch('/api/scheduler/evergreen-pipeline?force=1', { method: 'POST' });
      const data = (await res.json()) as EngineResult;
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
        Εκτέλεση Evergreen Pipeline Τώρα
      </button>

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          result.ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {result.reason ? (
            <p>Παρακάμφθηκε: {result.reason}</p>
          ) : result.ok ? (
            <p>
              {result.generated} άρθρα δημιουργήθηκαν · {result.failed} failed ·{' '}
              {result.totalWords.toLocaleString()} λέξεις · ${result.estimatedCostUsd.toFixed(3)} · drafts: {result.draftCount}
            </p>
          ) : (
            <p>Σφάλμα: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
