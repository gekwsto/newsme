'use client';

import { useState, useTransition } from 'react';
import { Play, Loader2 } from 'lucide-react';

interface PipelineResult {
  ok: boolean;
  scannedFeeds: number;
  failedFeeds: number;
  rssItems: number;
  candidates: number;
  generated: number;
  rejected: number;
  facebookPosted: number;
  reason?: string;
  error?: string;
  scoreStats?: {
    min: number;
    max: number;
    average: number;
    threshold: number;
    passedCount: number;
    rejectedCount: number;
  };
}

export default function PipelineTrigger() {
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<PipelineResult | null>(null);

  const run = () =>
    startRun(async () => {
      setResult(null);
      const res = await fetch('/api/scheduler/news-pipeline?force=1', { method: 'POST' });
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
        <div className={`rounded-lg px-4 py-3 text-sm border space-y-1 ${
          result.ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {result.error ? (
            <p>Σφάλμα: {result.error}</p>
          ) : result.reason ? (
            <p>Παρακάμφθηκε: {result.reason}</p>
          ) : (
            <>
              <p className="font-semibold">
                ✓ {result.generated} άρθρα δημιουργήθηκαν · {result.facebookPosted} Facebook posts
              </p>
              <p className="text-xs opacity-75">
                Feeds: {result.scannedFeeds} ({result.failedFeeds} failed) ·
                RSS items: {result.rssItems} ·
                Candidates: {result.candidates} ·
                Rejected: {result.rejected}
              </p>
              {result.scoreStats && (
                <p className="text-xs opacity-75">
                  Compound scores — min: {result.scoreStats.min} · max: {result.scoreStats.max} · avg: {result.scoreStats.average} · threshold: {result.scoreStats.threshold}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
