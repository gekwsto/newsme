'use client';

import { useState, useTransition } from 'react';
import { updateTagFlags, updateTagWeight } from '../../actions';

interface Props {
  id: string;
  isPriority: boolean;
  useForArticleTagging: boolean;
  useForImageMatching: boolean;
  isActive: boolean;
  currentWeight: number;
}

export default function TagFlagsForm(props: Props) {
  const [flags, setFlags] = useState({
    isPriority: props.isPriority,
    useForArticleTagging: props.useForArticleTagging,
    useForImageMatching: props.useForImageMatching,
    isActive: props.isActive,
  });
  const [weight, setWeight] = useState(props.currentWeight.toString());
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof typeof flags) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  function handleSave() {
    startTransition(async () => {
      await updateTagFlags(props.id, flags);
      const w = parseFloat(weight);
      if (!isNaN(w) && w > 0 && w !== props.currentWeight) {
        await updateTagWeight(props.id, w);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  const CheckboxRow = ({ label, field }: { label: string; field: keyof typeof flags }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={flags[field]}
        onChange={() => toggle(field)}
        className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
      />
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <CheckboxRow label="Active (included in scoring)" field="isActive" />
        <CheckboxRow label="Priority tag (adds bonus score)" field="isPriority" />
        <CheckboxRow label="Use for article tagging suggestions" field="useForArticleTagging" />
        <CheckboxRow label="Use for image matching" field="useForImageMatching" />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <label className="text-sm text-slate-500">Weight</label>
        <input
          type="number"
          min="0.1"
          max="5"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-20 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
