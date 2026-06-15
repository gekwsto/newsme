'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { updateNewsAutomationSettings } from '@/actions/news-settings';

interface Settings {
  id: string;
  rssScanIntervalMinutes: number;
  maxNewsPerDay: number;
  publishMode: string;
  facebookAutoPost: boolean;
  allowedPublishHours: number[];
  minimumImportanceScore: number;
  dailyAiBudgetLimit: number;
  isEnabled: boolean;
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function NewsSettingsForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState({
    rssScanIntervalMinutes: settings.rssScanIntervalMinutes,
    maxNewsPerDay: settings.maxNewsPerDay,
    publishMode: settings.publishMode,
    facebookAutoPost: settings.facebookAutoPost,
    allowedPublishHours: settings.allowedPublishHours,
    minimumImportanceScore: settings.minimumImportanceScore,
    dailyAiBudgetLimit: settings.dailyAiBudgetLimit,
    isEnabled: settings.isEnabled,
  });
  const [saving, startSave] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const toggleHour = (h: number) =>
    setForm((p) => ({
      ...p,
      allowedPublishHours: p.allowedPublishHours.includes(h)
        ? p.allowedPublishHours.filter((x) => x !== h)
        : [...p.allowedPublishHours, h].sort((a, b) => a - b),
    }));

  const handleSave = () =>
    startSave(async () => {
      const res = await updateNewsAutomationSettings({
        ...form,
        rssScanIntervalMinutes: Number(form.rssScanIntervalMinutes),
        maxNewsPerDay: Number(form.maxNewsPerDay),
        minimumImportanceScore: Number(form.minimumImportanceScore),
        dailyAiBudgetLimit: Number(form.dailyAiBudgetLimit),
      });
      setResult(res.ok ? 'Αποθηκεύτηκε!' : ('error' in res ? res.error : 'Σφάλμα'));
      setTimeout(() => setResult(null), 3000);
    });

  const label = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';
  const input = 'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-500 transition-colors';

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className={label}>Ενεργοποίηση Pipeline</p>
          <p className="text-xs text-slate-400">Ενεργοποιεί ή απενεργοποιεί όλη την αυτόματη λειτουργία</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, isEnabled: !p.isEnabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            form.isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Interval Σάρωσης RSS (λεπτά)</label>
          <input type="number" min={15} max={1440} value={form.rssScanIntervalMinutes}
            onChange={(e) => setForm((p) => ({ ...p, rssScanIntervalMinutes: Number(e.target.value) }))}
            className={input} />
        </div>
        <div>
          <label className={label}>Μέγιστα Άρθρα/Ημέρα</label>
          <input type="number" min={1} max={50} value={form.maxNewsPerDay}
            onChange={(e) => setForm((p) => ({ ...p, maxNewsPerDay: Number(e.target.value) }))}
            className={input} />
        </div>
        <div>
          <label className={label}>Ελάχιστο AI Score (1-10)</label>
          <input type="number" min={1} max={10} step={0.5} value={form.minimumImportanceScore}
            onChange={(e) => setForm((p) => ({ ...p, minimumImportanceScore: Number(e.target.value) }))}
            className={input} />
          <p className="text-[10px] text-slate-400 mt-1">overallScore ÷ 10 — {form.minimumImportanceScore * 10}/100</p>
        </div>
        <div>
          <label className={label}>Μηνιαίο AI Budget ($)</label>
          <input type="number" min={0} max={100} step={0.1} value={form.dailyAiBudgetLimit}
            onChange={(e) => setForm((p) => ({ ...p, dailyAiBudgetLimit: Number(e.target.value) }))}
            className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Publish Mode</label>
        <select value={form.publishMode} onChange={(e) => setForm((p) => ({ ...p, publishMode: e.target.value }))} className={input}>
          <option value="DRAFT">DRAFT — χρειάζεται έγκριση</option>
          <option value="APPROVED">APPROVED — εγκεκριμένο, δεν δημοσιεύεται ακόμα</option>
          <option value="PUBLISH">PUBLISH — αυτόματη δημοσίευση</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className={label}>Facebook Auto-Post</p>
          <p className="text-xs text-slate-400">Αυτόματη δημοσίευση στο Facebook (μόνο αν publishMode=PUBLISH)</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, facebookAutoPost: !p.facebookAutoPost }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            form.facebookAutoPost ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.facebookAutoPost ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div>
        <label className={label}>Επιτρεπόμενες Ώρες Δημοσίευσης</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {ALL_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggleHour(h)}
              className={`text-xs w-8 h-8 rounded font-semibold transition-colors ${
                form.allowedPublishHours.includes(h)
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Ώρες Αθήνας (Europe/Athens)</p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Αποθήκευση
        </button>
        {result && (
          <span className={`text-sm font-medium ${result === 'Αποθηκεύτηκε!' ? 'text-emerald-600' : 'text-red-500'}`}>
            {result}
          </span>
        )}
      </div>
    </div>
  );
}
