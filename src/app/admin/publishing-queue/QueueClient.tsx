'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, ChevronUp, ChevronDown, Trash2, Play, X,
  Calendar, Clock, FileText, Loader2, CheckCircle2,
  AlertTriangle, Info,
} from 'lucide-react';
import {
  addToQueue, removeFromQueue, moveQueueItem,
  scheduleQueue, publishQueueItemNow, cancelQueueItem,
} from '@/actions/queue';

type Category = { name: string; color: string };

type QueueItem = {
  id: string;
  queuePosition: number;
  priority: number;
  scheduledFor: Date | null;
  status: string;
  errorMessage: string | null;
  article: { id: string; title: string; slug: string; status: string; category: Category };
  socialPost: { id: string; content: string; status: string; platform: string } | null;
};

type ReadyArticle = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  category: Category;
  socialPosts: { id: string; status: string }[];
};

type HistoryItem = {
  id: string;
  status: string;
  publishedAt: Date | null;
  errorMessage: string | null;
  updatedAt: Date;
  article: { title: string; slug: string };
};

interface QueueClientProps {
  queueItems: QueueItem[];
  readyArticles: ReadyArticle[];
  recentHistory: HistoryItem[];
}

const STATUS_COLOR: Record<string, string> = {
  QUEUED: '#f59e0b',
  SCHEDULED: '#3b82f6',
  PUBLISHED: '#10b981',
  FAILED: '#ef4444',
  CANCELLED: '#94a3b8',
};

function fmt(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d));
}

function localDatetimeDefault() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
}

export default function QueueClient({ queueItems: initial, readyArticles, recentHistory }: QueueClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [startTime, setStartTime] = useState(localDatetimeDefault());
  const [intervalMin, setIntervalMin] = useState(20);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);

  // Sync local state when Server Component re-renders after router.refresh()
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const act = (id: string | null, fn: () => Promise<void>) => {
    setMsg(null);
    setActionId(id);
    startTransition(async () => {
      await fn();
      setActionId(null);
    });
  };

  const handleAdd = (articleId: string) =>
    act(articleId, async () => {
      const res = await addToQueue(articleId);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setMsg({ type: 'ok', text: 'Προστέθηκε στην ουρά' });
      router.refresh();
    });

  const handleRemove = (itemId: string) =>
    act(itemId, async () => {
      const res = await removeFromQueue(itemId);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      router.refresh();
    });

  const handleMove = (itemId: string, dir: 'up' | 'down') =>
    act(itemId, async () => {
      const res = await moveQueueItem(itemId, dir);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      // Optimistic local swap — router.refresh() will sync final state
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === itemId);
        if (idx === -1) return prev;
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[target]] = [next[target], next[idx]];
        return next;
      });
      router.refresh();
    });

  const handleSchedule = () =>
    act('schedule', async () => {
      const res = await scheduleQueue(new Date(startTime).toISOString(), intervalMin);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setMsg({ type: 'ok', text: `Ουρά προγραμματίστηκε — ξεκινά ${fmt(new Date(startTime))}` });
      router.refresh();
    });

  const handlePublishNow = (itemId: string) =>
    act(itemId, async () => {
      const res = await publishQueueItemNow(itemId);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setMsg({ type: 'ok', text: 'Δημοσιεύτηκε!' });
      router.refresh();
    });

  const handleCancel = (itemId: string) =>
    act(itemId, async () => {
      const res = await cancelQueueItem(itemId);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      router.refresh();
    });

  const inputClass =
    'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors';

  const isActing = (id: string) => isPending && actionId === id;

  // Preview scheduled times
  const previewTimes: string[] = [];
  if (startTime && intervalMin > 0 && items.length > 0) {
    const base = new Date(startTime);
    for (let i = 0; i < Math.min(items.length, 8); i++) {
      previewTimes.push(fmt(new Date(base.getTime() + i * intervalMin * 60 * 1000)));
    }
  }

  return (
    <div className="space-y-8">
      {msg && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl border"
          style={{
            background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
            borderColor: msg.type === 'ok' ? '#bbf7d0' : '#fecaca',
            color: msg.type === 'ok' ? '#166534' : '#991b1b',
          }}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Left: Queue ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
              Ουρά ({items.length})
            </h2>
            {items.length > 0 && (
              <span className="text-xs text-slate-500">
                {items.filter((i) => i.status === 'SCHEDULED').length} προγραμματισμένα
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
              <Calendar size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">Η ουρά είναι άδεια.</p>
              <p className="text-xs text-slate-400 mt-1">Πρόσθεσε άρθρα από τη λίστα δεξιά.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-start gap-3">
                    {/* Position badge */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-300">
                        {idx + 1}
                      </span>
                      <button
                        onClick={() => handleMove(item.id, 'up')}
                        disabled={idx === 0 || isPending}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => handleMove(item.id, 'down')}
                        disabled={idx === items.length - 1 || isPending}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: item.article.category.color + '22', color: item.article.category.color }}
                        >
                          {item.article.category.name}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: STATUS_COLOR[item.status] + '22', color: STATUS_COLOR[item.status] }}
                        >
                          {item.status}
                        </span>
                        {item.socialPost && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                            FB
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        <Link href={`/admin/articles/${item.article.id}/edit`} className="hover:text-red-600 transition-colors">
                          {item.article.title}
                        </Link>
                      </p>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {item.scheduledFor ? fmt(item.scheduledFor) : 'Μη προγραμματισμένο'}
                        </span>
                      </div>

                      {item.socialPost && (
                        <div className="mt-2">
                          <button
                            onClick={() => setExpandedContent(expandedContent === item.id ? null : item.id)}
                            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            {expandedContent === item.id ? '▲ Απόκρυψη FB post' : '▼ Εμφάνιση FB post'}
                          </button>
                          {expandedContent === item.id && (
                            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-4">
                              {item.socialPost.content}
                            </p>
                          )}
                        </div>
                      )}

                      {item.errorMessage && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={10} />
                          {item.errorMessage}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handlePublishNow(item.id)}
                        disabled={isPending}
                        title="Δημοσίευση τώρα"
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActing(item.id) ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                        Τώρα
                      </button>
                      <button
                        onClick={() => handleCancel(item.id)}
                        disabled={isPending}
                        title="Ακύρωση"
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        disabled={isPending}
                        title="Αφαίρεση"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── History ─────────────────────────────────────────────────── */}
          {recentHistory.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">
                Ιστορικό
              </h2>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                {recentHistory.map((h) => (
                  <div key={h.id} className="px-4 py-3 flex items-center gap-3">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: STATUS_COLOR[h.status] ?? '#94a3b8' }}
                    />
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{h.article.title}</span>
                    <span className="text-xs text-slate-400 shrink-0">{fmt(h.publishedAt ?? h.updatedAt)}</span>
                    {h.errorMessage && (
                      <span className="text-xs text-red-500 truncate max-w-32" title={h.errorMessage}>
                        {h.errorMessage}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Controls ──────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Batch schedule */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={13} />
              Batch Schedule
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Ώρα Έναρξης
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Interval (λεπτά)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
                <div className="flex gap-1">
                  {[15, 20, 30, 60].map((v) => (
                    <button
                      key={v}
                      onClick={() => setIntervalMin(v)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                        intervalMin === v
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {v}′
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            {previewTimes.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Info size={10} /> Προεπισκόπηση
                </p>
                {previewTimes.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">{items[i]?.article.title.slice(0, 30) ?? '—'}</span>
                    <span className="ml-auto text-[10px] text-slate-400 shrink-0">{t}</span>
                  </div>
                ))}
                {items.length > 8 && (
                  <p className="text-[10px] text-slate-400 pt-1">+{items.length - 8} ακόμα…</p>
                )}
              </div>
            )}

            <button
              onClick={handleSchedule}
              disabled={isPending || items.length === 0}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl px-4 py-2.5 transition-colors"
            >
              {isActing('schedule') ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
              Schedule Queue ({items.length})
            </button>
          </div>

          {/* Ready articles */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <FileText size={13} />
              Έτοιμα για Ουρά ({readyArticles.length})
            </h3>

            {readyArticles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                Δεν υπάρχουν εγκεκριμένα άρθρα εκτός ουράς.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {readyArticles.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[9px] font-bold px-1 rounded"
                          style={{ background: a.category.color + '22', color: a.category.color }}
                        >
                          {a.category.name}
                        </span>
                        {a.socialPosts.length > 0 && (
                          <span className="text-[9px] text-blue-500 font-bold">FB</span>
                        )}
                        <span className="text-[9px] text-slate-400">{a.status}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(a.id)}
                      disabled={isPending}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      title="Προσθήκη στην ουρά"
                    >
                      {isActing(a.id) ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
