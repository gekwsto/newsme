'use client';

import { useState, useTransition } from 'react';
import { syncFacebookAnalytics } from '@/actions/analytics';

export default function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await syncFacebookAnalytics();
            if (r.ok) setResult(`✓ Synced ${r.synced} posts`);
            else setResult(`⚠ ${r.error}`);
          });
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {isPending ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing…
          </>
        ) : (
          <>📘 Sync from Facebook</>
        )}
      </button>
      {result && (
        <span className={`text-xs font-medium ${result.startsWith('⚠') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {result}
        </span>
      )}
    </div>
  );
}
