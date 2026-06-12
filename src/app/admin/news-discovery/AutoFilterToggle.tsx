'use client';

import { useState, useTransition } from 'react';
import { toggleAutoFilter } from '@/actions/settings';

export default function AutoFilterToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      await toggleAutoFilter(next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={enabled ? 'Auto-filter ενεργό — κλίκ για απενεργοποίηση' : 'Auto-filter ανενεργό — κλίκ για ενεργοποίηση'}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
        enabled
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
      Auto-filter {enabled ? 'ON' : 'OFF'}
    </button>
  );
}
