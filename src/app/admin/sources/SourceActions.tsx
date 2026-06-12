'use client';

import { useState, useTransition } from 'react';
import { TestTube, Pencil, Trash2, Loader2, X, Save } from 'lucide-react';
import { fetchSourceNow, toggleRssSource, testRssFeed, updateRssSource, deleteRssSource } from '@/actions/rss';

interface Category {
  id: string;
  name: string;
}

interface Props {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  enabled: boolean;
  language: string;
  country: string;
  reliabilityScore: number;
  feedSourceType: string;
  categoryId: string;
  categories: Category[];
}

export default function SourceActions(props: Props) {
  const [isFetching, startFetch] = useTransition();
  const [isToggling, startToggle] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    name: props.sourceName,
    language: props.language,
    country: props.country,
    reliabilityScore: props.reliabilityScore,
    feedSourceType: props.feedSourceType,
    categoryId: props.categoryId,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleTest = () => {
    setTestResult(null);
    startTest(async () => {
      const res = await testRssFeed(props.sourceUrl);
      setTestResult(res.ok
        ? { ok: true, message: `✓ ${res.itemCount} items` }
        : { ok: false, message: res.error.slice(0, 60) });
    });
  };

  const handleSave = () =>
    startSave(async () => {
      await updateRssSource(props.sourceId, { ...form, reliabilityScore: Number(form.reliabilityScore) });
      setEditing(false);
    });

  const handleDelete = () =>
    startDelete(async () => {
      await deleteRssSource(props.sourceId);
    });

  const inputClass = 'bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-500 transition-colors';

  if (editing) {
    return (
      <div className="flex flex-col gap-2 py-2 col-span-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Όνομα</p>
            <input value={form.name} onChange={set('name')} className={`${inputClass} w-full`} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Γλώσσα</p>
            <select value={form.language} onChange={set('language')} className={`${inputClass} w-full`}>
              <option value="EL">🇬🇷 EL</option>
              <option value="EN">🌍 EN</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Χώρα</p>
            <select value={form.country} onChange={set('country')} className={`${inputClass} w-full`}>
              <option value="GR">GR</option>
              <option value="GLOBAL">GLOBAL</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Reliability</p>
            <input type="number" min={0} max={100} value={form.reliabilityScore} onChange={set('reliabilityScore')} className={`${inputClass} w-full`} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Τύπος</p>
            <select value={form.feedSourceType} onChange={set('feedSourceType')} className={`${inputClass} w-full`}>
              <option value="NEWS">NEWS</option>
              <option value="BUSINESS">BUSINESS</option>
              <option value="ECONOMY">ECONOMY</option>
              <option value="TECH">TECH</option>
              <option value="GENERAL">GENERAL</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-1">Κατηγορία</p>
            <select value={form.categoryId} onChange={set('categoryId')} className={`${inputClass} w-full`}>
              {props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Αποθήκευση
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5">Ακύρωση</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex flex-col items-center gap-0.5">
        <button
          disabled={isFetching || !props.enabled}
          onClick={() => {
            setFetchResult(null);
            startFetch(async () => {
              const r = await fetchSourceNow(props.sourceId);
              setFetchResult(r.ok ? (r.newCount > 0 ? `+${r.newCount}` : '✓') : '⚠');
            });
          }}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 transition-colors font-medium"
        >
          {isFetching ? <Loader2 size={11} className="animate-spin inline" /> : 'Fetch'}
        </button>
        {fetchResult && (
          <span className={`text-[9px] font-bold ${fetchResult.startsWith('⚠') ? 'text-red-500' : 'text-emerald-600'}`}>
            {fetchResult}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={handleTest}
          disabled={isTesting}
          title="Test feed"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40"
        >
          {isTesting ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
        </button>
        {testResult && (
          <span className={`text-[9px] font-bold ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
            {testResult.ok ? '✓' : '✗'}
          </span>
        )}
      </div>

      <button
        disabled={isToggling}
        onClick={() => startToggle(async () => { await toggleRssSource(props.sourceId, !props.enabled); })}
        className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
          props.enabled
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
        }`}
      >
        {props.enabled ? 'ON' : 'OFF'}
      </button>

      <button
        onClick={() => setEditing(true)}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
      >
        <Pencil size={12} />
      </button>

      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button onClick={handleDelete} disabled={isDeleting} className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors disabled:opacity-50">
            {isDeleting ? <Loader2 size={10} className="animate-spin inline" /> : 'Διαγραφή;'}
          </button>
          <button onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
