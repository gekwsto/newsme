'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';

export default function EvergreenEngineButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string>('');

  async function run() {
    setState('loading');
    setResult('');
    try {
      const res = await fetch('/api/evergreen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Σφάλμα');
      setResult(`✓ ${data.generated} δημιουργήθηκαν, ${data.failed} απέτυχαν — drafts: ${data.draftCount}`);
      setState('done');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Άγνωστο σφάλμα');
      setState('error');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={state === 'loading'}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        <Zap size={14} />
        {state === 'loading' ? 'Γεμίζει...' : 'Τρέξε Evergreen Engine'}
      </button>
      {result && (
        <span className={`text-xs font-medium ${state === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {result}
        </span>
      )}
    </div>
  );
}
