'use client';

import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toggleSourceAutoGeneration } from '@/actions/news-settings';

interface Props {
  sourceId: string;
  allowAutoGeneration: boolean;
}

export default function AutoGenBadge({ sourceId, allowAutoGeneration }: Props) {
  const [pending, startToggle] = useTransition();

  const toggle = () =>
    startToggle(async () => {
      await toggleSourceAutoGeneration(sourceId, !allowAutoGeneration);
    });

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title="Αυτόματη Δημιουργία Άρθρου"
      className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
        allowAutoGeneration
          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
      }`}
    >
      {pending ? <Loader2 size={8} className="animate-spin" /> : null}
      {allowAutoGeneration ? '⚡ AUTO' : '— AUTO'}
    </button>
  );
}
