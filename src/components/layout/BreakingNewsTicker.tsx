'use client';

interface BreakingNewsTickerProps {
  items: string[];
}

export default function BreakingNewsTicker({ items }: BreakingNewsTickerProps) {
  if (!items.length) return null;

  const doubled = [...items, ...items];

  return (
    <div className="bg-red-600 text-white overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center">
        {/* Live badge — pinned left, above the scroll */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 z-10 shrink-0 border-r border-red-500">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="font-black text-[11px] uppercase tracking-widest">LIVE</span>
        </div>

        {/* Scrolling track */}
        <div className="overflow-hidden flex-1 py-1.5">
          <div className="ticker-track flex whitespace-nowrap" style={{ width: 'max-content' }}>
            {doubled.map((item, i) => (
              <span key={i} className="text-xs font-medium">
                <span className="mx-4 text-red-300">⚡</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
