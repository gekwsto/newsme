'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      <span className={loading ? 'animate-spin' : ''}>↻</span>
      {loading ? 'Ανανέωση...' : 'Ανανέωση'}
    </button>
  );
}
