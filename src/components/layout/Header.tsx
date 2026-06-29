'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Search, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import BreakingNewsTicker from './BreakingNewsTicker';
import Logo from '@/components/ui/Logo';
import { BRAND } from '@/config/brand';

interface HeaderProps {
  categories: { name: string; slug: string }[];
  newsItems: string[];
}

export default function Header({ categories, newsItems }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  return (
    <header className="sticky top-0 z-50 bg-slate-900 shadow-lg">
      {/* Breaking news ticker */}
      <BreakingNewsTicker items={newsItems} />

      {/* Main header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex flex-col leading-none group shrink-0">
            <Logo
              firstPartClassName="text-red-500 group-hover:text-red-400 transition-colors"
              secondPartClassName="text-white"
            />
            <span className="text-slate-500 text-[9px] tracking-wide hidden sm:block mt-0.5">
              {BRAND.tagline}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="text-slate-400 hover:text-white hover:bg-slate-700/60 px-3 py-1.5 rounded text-[13px] font-medium transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/60 transition-colors"
              aria-label="Αναζήτηση"
            >
              <Search size={17} />
            </button>

            {/* Dark mode toggle */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/60 transition-colors"
                aria-label={resolvedTheme === 'dark' ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα'}
              >
                {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/60 transition-colors"
              aria-label="Μενού"
            >
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="pb-3">
            <input
              type="text"
              placeholder="Αναζήτηση άρθρων..."
              autoFocus
              className="w-full bg-slate-800 text-white placeholder-slate-400 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-2 gap-1">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                onClick={() => setMobileOpen(false)}
                className="text-slate-300 hover:text-white hover:bg-slate-700/60 px-3 py-2 rounded text-sm font-medium transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-800 px-4 py-3 flex gap-4 text-sm">
            <Link href="/about" onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">Σχετικά</Link>
            <Link href="/contact" onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">Επικοινωνία</Link>
          </div>
        </div>
      )}
    </header>
  );
}
