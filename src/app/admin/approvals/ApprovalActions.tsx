'use client';

import { useState, useTransition } from 'react';
import { Check, X, Globe, Loader2, Bell } from 'lucide-react';
import { approveArticle, rejectArticle, publishArticle } from '@/actions/articles';

interface ApprovalActionsProps {
  articleId: string;
  showPublish?: boolean;
}

export default function ApprovalActions({ articleId, showPublish = false }: ApprovalActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState('Ολοκληρώθηκε');
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [sendPush, setSendPush] = useState(false);

  if (done) {
    return <span className="text-xs text-slate-400 italic">{doneMsg}</span>;
  }

  const handle = (action: () => Promise<void>) => {
    startTransition(async () => {
      await action();
      setDone(true);
    });
  };

  const handlePublishWithPush = () => {
    startTransition(async () => {
      await publishArticle(articleId);

      if (sendPush) {
        try {
          const res = await fetch('/api/admin/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId }),
          });
          const data = await res.json() as { ok: boolean; sentCount?: number; totalTargeted?: number };
          if (data.ok && data.totalTargeted && data.totalTargeted > 0) {
            setDoneMsg(`Δημοσιεύτηκε + push σε ${data.sentCount}/${data.totalTargeted}`);
          } else if (data.ok && (!data.totalTargeted || data.totalTargeted === 0)) {
            setDoneMsg('Δημοσιεύτηκε (0 subscribers)');
          } else {
            setDoneMsg('Δημοσιεύτηκε (push απέτυχε)');
          }
        } catch {
          setDoneMsg('Δημοσιεύτηκε (push απέτυχε)');
        }
      }

      setDone(true);
    });
  };

  if (showPublish) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendPush}
            onChange={(e) => setSendPush(e.target.checked)}
            className="rounded border-slate-300 text-red-600 focus:ring-red-500 w-3 h-3"
          />
          <Bell size={10} className={sendPush ? 'text-red-500' : 'text-slate-400'} />
          Push
        </label>
        <button
          onClick={handlePublishWithPush}
          disabled={isPending}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
          Δημοσίευση
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {showRejectInput ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Αιτία (προαιρετική)"
            className="text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-400 w-36"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handle(() => rejectArticle(articleId, rejectNote || undefined));
              if (e.key === 'Escape') setShowRejectInput(false);
            }}
            autoFocus
          />
          <button
            onClick={() => handle(() => rejectArticle(articleId, rejectNote || undefined))}
            disabled={isPending}
            className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Επιβεβαίωση'}
          </button>
          <button
            onClick={() => setShowRejectInput(false)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => handle(() => approveArticle(articleId))}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Έγκριση
          </button>
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={13} />
            Απόρριψη
          </button>
        </>
      )}
    </div>
  );
}
