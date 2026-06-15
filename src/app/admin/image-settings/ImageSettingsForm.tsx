'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { upsertCategoryImageSettings } from '@/actions/news-settings';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Setting {
  categoryId: string;
  imageMode: string;
  templateColor: string;
}

export default function ImageSettingsForm({
  categories,
  settings,
}: {
  categories: Category[];
  settings: Setting[];
}) {
  const [rows, setRows] = useState(() =>
    categories.map((cat) => {
      const existing = settings.find((s) => s.categoryId === cat.id);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        imageMode: existing?.imageMode ?? 'TEMPLATE',
        templateColor: existing?.templateColor ?? cat.color,
      };
    })
  );
  const [saving, startSave] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);

  const update = (categoryId: string, field: 'imageMode' | 'templateColor', value: string) =>
    setRows((p) => p.map((r) => (r.categoryId === categoryId ? { ...r, [field]: value } : r)));

  const save = (row: (typeof rows)[0]) =>
    startSave(async () => {
      await upsertCategoryImageSettings({
        categoryId: row.categoryId,
        imageMode: row.imageMode,
        templateColor: row.templateColor,
      });
      setSavedId(row.categoryId);
      setTimeout(() => setSavedId(null), 2000);
    });

  const inputClass = 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-500 transition-colors text-slate-900 dark:text-slate-100';

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-700">
      {rows.map((row) => (
        <div key={row.categoryId} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.categoryColor }} />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-36 truncate">{row.categoryName}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={row.imageMode}
              onChange={(e) => update(row.categoryId, 'imageMode', e.target.value)}
              className={inputClass}
            >
              <option value="TEMPLATE">TEMPLATE</option>
              <option value="AI_GENERATED">AI_GENERATED</option>
            </select>

            {row.imageMode === 'TEMPLATE' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Χρώμα:</span>
                <input
                  type="color"
                  value={row.templateColor}
                  onChange={(e) => update(row.categoryId, 'templateColor', e.target.value)}
                  className="h-6 w-10 rounded border border-slate-200 dark:border-slate-600 cursor-pointer p-0"
                />
                <span className="text-[10px] font-mono text-slate-400">{row.templateColor}</span>
              </div>
            )}

            <button
              onClick={() => save(row)}
              disabled={saving}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-semibold transition-colors disabled:opacity-50"
            >
              {saving && savedId === null ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
              Αποθήκευση
            </button>

            {savedId === row.categoryId && (
              <span className="text-[10px] text-emerald-600 font-semibold">✓ OK</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
