'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { updateEvergreenAutomationSettings } from '@/actions/evergreen-settings';

interface Settings {
  id: string;
  isEnabled: boolean;
  allowedHours: number[];
  targetDraftCount: number;
  articlesPerRun: number;
  dailyAiBudgetLimit: number;
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function EvergreenSettingsForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState({
    isEnabled: settings.isEnabled,
    allowedHours: settings.allowedHours,
    targetDraftCount: settings.targetDraftCount,
    articlesPerRun: settings.articlesPerRun,
    dailyAiBudgetLimit: settings.dailyAiBudgetLimit,
  });
  const [saving, startSave] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const toggleHour = (h: number) =>
    setForm((p) => ({
      ...p,
      allowedHours: p.allowedHours.includes(h)
        ? p.allowedHours.filter((x) => x !== h)
        : [...p.allowedHours, h].sort((a, b) => a - b),
    }));

  const handleSave = () =>
    startSave(async () => {
      const res = await updateEvergreenAutomationSettings({
        ...form,
        targetDraftCount: Number(form.targetDraftCount),
        articlesPerRun: Number(form.articlesPerRun),
        dailyAiBudgetLimit: Number(form.dailyAiBudgetLimit),
      });
      setResult(res.ok ? 'Αποθηκεύτηκε!' : ('error' in res ? res.error : 'Σφάλμα'));
      setTimeout(() => setResult(null), 3000);
    });

  const label = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';
  const input = 'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors';

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className={label}>Ενεργοποίηση Evergreen Pipeline</p>
          <p className="text-xs text-slate-400">Αυτόματη δημιουργία evergreen άρθρων στις καθορισμένες ώρες</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={label}>Target Draft Count</label>
          <input type="number" min={1} max={20} value={form.targetDraftCount}
            onChange={(e) => setForm((p) => ({ ...p, targetDraftCount: Number(e.target.value) }))}
            className={input} />
          <p className="text-[10px] text-slate-400 mt-1">Στόχος drafts σε αναμονή</p>
        </div>
        <div>
          <label className={label}>Άρθρα ανά Εκτέλεση</label>
          <input type="number" min={1} max={10} value={form.articlesPerRun}
            onChange={(e) => setForm((p) => ({ ...p, articlesPerRun: Number(e.target.value) }))}
            className={input} />
          <p className="text-[10px] text-slate-400 mt-1">Max articles per cron run</p>
        </div>
        <div>
          <label className={label}>Ημερήσιο AI Budget ($)</label>
          <input type="number" min={0} max={50} step={0.1} value={form.dailyAiBudgetLimit}
            onChange={(e) => setForm((p) => ({ ...p, dailyAiBudgetLimit: Number(e.target.value) }))}
            className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Ώρες Εκτέλεσης</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {ALL_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggleHour(h)}
              className={`text-xs w-8 h-8 rounded font-semibold transition-colors ${
                form.allowedHours.includes(h)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Ώρες Αθήνας (Europe/Athens) — επίλεξε ώρες που ΔΕΝ συγκρούονται με το news pipeline</p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
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
