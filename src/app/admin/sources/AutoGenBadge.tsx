'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toggleSourceAutoGeneration } from '@/actions/news-settings';

interface Props {
  sourceId: string;
  allowAutoGeneration: boolean;
  enabled: boolean;
}

export default function AutoGenBadge({ sourceId, allowAutoGeneration, enabled: sourceEnabled }: Props) {
  const [on, setOn] = useState(allowAutoGeneration);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      await toggleSourceAutoGeneration(sourceId, next);
    } catch {
      setOn(!next);
    } finally {
      setSaving(false);
    }
  };

  const active = on && sourceEnabled;

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={on ? 'Απενεργοποίηση από Auto Pipeline' : 'Ενεργοποίηση στο Auto Pipeline'}
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all disabled:opacity-60 select-none ${
        active
          ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 hover:bg-violet-100'
          : on
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-100'
      }`}
    >
      <span
        className={`inline-flex w-6 h-3.5 rounded-full relative flex-shrink-0 transition-colors ${
          on ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
            on ? 'translate-x-3' : 'translate-x-0.5'
          }`}
        />
      </span>
      {saving ? (
        <Loader2 size={8} className="animate-spin" />
      ) : active ? (
        '⚡ AUTO ON'
      ) : on ? (
        '⚡ AUTO (inactive)'
      ) : (
        '⚪ AUTO OFF'
      )}
    </button>
  );
}
