'use client';

import { useState, useTransition } from 'react';
import { setHumanVerdict, clearHumanVerdict } from '@/actions/article-review';

interface Props {
  articleId: string;
  currentVerdict: string | null;
}

export default function ReviewActions({ articleId, currentVerdict }: Props) {
  const [verdict, setVerdict] = useState(currentVerdict);
  const [pending, startT] = useTransition();

  const handle = (v: 'accepted' | 'rejected' | null) =>
    startT(async () => {
      const res = v
        ? await setHumanVerdict(articleId, v)
        : await clearHumanVerdict(articleId);
      if (res.ok) setVerdict(v);
    });

  if (verdict === 'accepted') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
          ✓ Accepted
        </span>
        <button
          disabled={pending}
          onClick={() => handle(null)}
          className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
        >
          undo
        </button>
      </div>
    );
  }

  if (verdict === 'rejected') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
          ✗ Rejected
        </span>
        <button
          disabled={pending}
          onClick={() => handle(null)}
          className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
        >
          undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() => handle('accepted')}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40"
      >
        {pending ? '…' : '✓ Accept'}
      </button>
      <button
        disabled={pending}
        onClick={() => handle('rejected')}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
      >
        {pending ? '…' : '✗ Reject'}
      </button>
    </div>
  );
}
