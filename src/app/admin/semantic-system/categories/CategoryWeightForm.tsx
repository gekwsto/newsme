'use client';

import { useTransition, useState } from 'react';
import { updateCategoryWeight, toggleCategoryActive } from '../actions';

interface Props {
  id: string;
  name: string;
  currentWeight: number;
  isActive: boolean;
}

export default function CategoryWeightForm({ id, currentWeight, isActive }: Props) {
  const [weight, setWeight] = useState(currentWeight.toString());
  const [active, setActive] = useState(isActive);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) return;
    startTransition(async () => {
      await updateCategoryWeight(id, w);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function handleToggle() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      await toggleCategoryActive(id, next);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* Weight input */}
      <label className="text-xs text-slate-400">weight</label>
      <input
        type="number"
        min="0.1"
        max="5"
        step="0.1"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-16 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
      />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="text-xs px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {saved ? '✓' : 'Save'}
      </button>

      {/* Active toggle */}
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
          active
            ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 hover:text-red-600'
            : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 hover:text-emerald-600'
        }`}
      >
        {active ? 'Active' : 'Inactive'}
      </button>
    </div>
  );
}
