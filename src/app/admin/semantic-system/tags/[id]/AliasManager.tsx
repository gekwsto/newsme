'use client';

import { useState, useTransition } from 'react';
import { addAlias, toggleAlias } from '../../actions';

interface AliasRow {
  id: string;
  alias: string;
  isActive: boolean;
}

export default function AliasManager({
  semanticTagId,
  aliases: initial,
}: {
  semanticTagId: string;
  aliases: AliasRow[];
}) {
  const [aliases, setAliases] = useState(initial);
  const [newAlias, setNewAlias] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    setError(null);

    startTransition(async () => {
      try {
        await addAlias(semanticTagId, trimmed);
        setAliases((prev) => [
          ...prev,
          { id: `new-${Date.now()}`, alias: trimmed, isActive: true },
        ]);
        setNewAlias('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error adding alias');
      }
    });
  }

  function handleToggle(aliasId: string, currentActive: boolean) {
    startTransition(async () => {
      await toggleAlias(aliasId, !currentActive, semanticTagId);
      setAliases((prev) =>
        prev.map((a) => (a.id === aliasId ? { ...a, isActive: !currentActive } : a))
      );
    });
  }

  const active = aliases.filter((a) => a.isActive);
  const inactive = aliases.filter((a) => !a.isActive);

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newAlias}
          onChange={(e) => setNewAlias(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New alias…"
          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !newAlias.trim()}
          className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Active aliases */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {active.map((a) => (
            <div key={a.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300">
              <span>{a.alias}</span>
              <button
                onClick={() => handleToggle(a.id, a.isActive)}
                disabled={isPending}
                className="ml-1 text-slate-400 hover:text-red-500 disabled:opacity-50 text-xs"
                title="Deactivate"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Inactive aliases */}
      {inactive.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">Inactive:</p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((a) => (
              <div key={a.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                <span>{a.alias}</span>
                <button
                  onClick={() => handleToggle(a.id, a.isActive)}
                  disabled={isPending}
                  className="ml-1 text-slate-300 hover:text-emerald-500 disabled:opacity-50"
                  title="Reactivate"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
