'use client';

import { useRouter, usePathname } from 'next/navigation';

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  currentCategory: string;
  currentStatus: string;
  currentSort: string;
}

const statusOptions = [
  { value: '', label: 'Όλα' },
  { value: 'NEW', label: 'Νέα' },
  { value: 'DRAFT_CREATED', label: 'Draft' },
  { value: 'IGNORED', label: 'Αγνοήθηκαν' },
];

const sortOptions = [
  { value: 'facebook', label: '📘 Facebook Potential' },
  { value: 'overall', label: '⭐ Overall Score' },
  { value: 'controversy', label: '⚡ Controversy' },
  { value: 'viral', label: '🔥 Viral Score' },
  { value: 'discussion', label: '💬 Discussion' },
  { value: 'business', label: '💼 Business Value' },
  { value: 'search', label: '🔍 Search Potential' },
  { value: 'date', label: '📅 Ημερομηνία' },
];

export default function DiscoveryFilters({ categories, currentCategory, currentStatus, currentSort }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string) {
    const params = new URLSearchParams();
    if (key !== 'category' && currentCategory) params.set('category', currentCategory);
    if (key !== 'status' && currentStatus) params.set('status', currentStatus);
    if (key !== 'sort' && currentSort) params.set('sort', currentSort);
    if (value) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update('status', opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              currentStatus === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <select
        value={currentCategory}
        onChange={(e) => update('category', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">Όλες οι κατηγορίες</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Sort */}
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs text-gray-500 dark:text-gray-400">Ταξινόμηση:</span>
        <select
          value={currentSort}
          onChange={(e) => update('sort', e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
