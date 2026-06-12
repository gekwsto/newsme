'use client';

import { useState, useTransition } from 'react';
import { Plus, Loader2, TestTube, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { addRssSource, testRssFeed } from '@/actions/rss';

interface Category {
  id: string;
  name: string;
  color: string;
}

export default function AddSourceForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    url: '',
    categoryId: categories[0]?.id ?? '',
    language: 'EN',
    country: 'GLOBAL',
    reliabilityScore: 70,
    feedSourceType: 'NEWS',
    enabled: false,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleTest = () => {
    if (!form.url.trim()) return;
    setTestResult(null);
    startTest(async () => {
      const res = await testRssFeed(form.url);
      if (res.ok) {
        setTestResult({ ok: true, message: `${res.itemCount} items — "${res.sampleTitles[0] ?? ''}"` });
        setForm((p) => ({ ...p, name: p.name || new URL(res.sampleTitles[0] ? form.url : form.url).hostname.replace(/^www\./, '').split('.')[0] }));
      } else {
        setTestResult({ ok: false, message: res.error });
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addRssSource({
        ...form,
        reliabilityScore: Number(form.reliabilityScore),
      });
      if (!res.ok) { setError(res.error); return; }
      setOpen(false);
      setForm({ name: '', url: '', categoryId: categories[0]?.id ?? '', language: 'EN', country: 'GLOBAL', reliabilityScore: 70, feedSourceType: 'NEWS', enabled: false });
      setTestResult(null);
    });
  };

  const inputClass = 'w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
  const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-xl transition-colors"
      >
        <Plus size={15} /> Νέα Πηγή
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Νέα RSS Πηγή</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelClass}>RSS URL</label>
          <div className="flex gap-2">
            <input type="url" value={form.url} onChange={set('url')} required placeholder="https://..." className={inputClass} />
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !form.url.trim()}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 border border-slate-200 dark:border-slate-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {isTesting ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
              Test
            </button>
          </div>
          {testResult && (
            <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
              {testResult.ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              {testResult.message}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Όνομα</label>
          <input type="text" value={form.name} onChange={set('name')} required placeholder="Ναυτεμπορική" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Κατηγορία</label>
          <select value={form.categoryId} onChange={set('categoryId')} className={inputClass}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Γλώσσα</label>
          <select value={form.language} onChange={set('language')} className={inputClass}>
            <option value="EL">🇬🇷 EL — Ελληνικά</option>
            <option value="EN">🌍 EN — English</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Χώρα</label>
          <select value={form.country} onChange={set('country')} className={inputClass}>
            <option value="GR">🇬🇷 GR — Ελλάδα</option>
            <option value="GLOBAL">🌍 GLOBAL — Διεθνές</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Τύπος</label>
          <select value={form.feedSourceType} onChange={set('feedSourceType')} className={inputClass}>
            <option value="NEWS">NEWS</option>
            <option value="BUSINESS">BUSINESS</option>
            <option value="ECONOMY">ECONOMY</option>
            <option value="TECH">TECH</option>
            <option value="GENERAL">GENERAL</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Reliability Score (0-100)</label>
          <input type="number" min={0} max={100} value={form.reliabilityScore} onChange={set('reliabilityScore')} className={inputClass} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending || !testResult?.ok}
          className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Προσθήκη
        </button>
        <p className="text-xs text-slate-400">Απαιτείται επιτυχής Test πριν την αποθήκευση</p>
      </div>
    </form>
  );
}
