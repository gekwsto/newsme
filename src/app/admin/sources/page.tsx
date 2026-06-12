import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { formatRelativeDate } from '@/lib/utils';
import SourceActions from './SourceActions';
import AddSourceForm from './AddSourceForm';
import FetchAllButton from '../news-discovery/FetchAllButton';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ lang?: string; country?: string; type?: string }>;
}

function ReliabilityBar({ score }: { score: number }) {
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

function LangBadge({ language, country }: { language: string; country: string }) {
  const isGreek = language === 'EL' || country === 'GR';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
      isGreek
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
    }`}>
      {isGreek ? '🇬🇷 EL' : '🌍 EN'}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ECONOMY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    BUSINESS: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    TECH: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
    NEWS: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    GENERAL: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[type] ?? colors.GENERAL}`}>
      {type}
    </span>
  );
}

export default async function SourcesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { lang, country, type } = await searchParams;

  const sources = await prisma.rssSource.findMany({
    where: {
      ...(lang ? { language: lang } : {}),
      ...(country ? { country } : {}),
      ...(type ? { feedSourceType: type } : {}),
    },
    orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    include: {
      category: { select: { id: true, name: true, color: true } },
      _count: { select: { articles: true } },
    },
  });

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true },
  });

  const enabledCount = sources.filter((s) => s.enabled).length;
  const greekCount = sources.filter((s) => s.language === 'EL' || s.country === 'GR').length;

  const filterBase = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { lang, country, type, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const str = p.toString();
    return str ? `?${str}` : '/admin/sources';
  };

  const activeFilters = [lang, country, type].filter(Boolean).length;

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">RSS Sources</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {enabledCount} ενεργές · {greekCount} ελληνικές · {sources.length} συνολικά
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <FetchAllButton />
          </div>
        </div>

        {/* Add source form */}
        <div className="mb-6">
          <AddSourceForm categories={categories} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <a href="/admin/sources" className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeFilters === 0
              ? 'bg-red-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}>
            Όλες
          </a>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          <a href={filterBase({ lang: lang === 'EL' ? undefined : 'EL' })} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            lang === 'EL'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}>
            🇬🇷 EL
          </a>
          <a href={filterBase({ lang: lang === 'EN' ? undefined : 'EN' })} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            lang === 'EN'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}>
            🌍 EN
          </a>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {(['NEWS', 'ECONOMY', 'BUSINESS', 'TECH'] as const).map((t) => (
            <a key={t} href={filterBase({ type: type === t ? undefined : t })} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              type === t
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}>
              {t}
            </a>
          ))}
        </div>

        {/* Sources list */}
        {sources.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium">Δεν βρέθηκαν sources</p>
            <p className="text-sm mt-1">Δοκίμασε διαφορετικά φίλτρα ή πρόσθεσε νέα πηγή.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {sources.map((source) => (
              <div key={source.id} className={`px-4 py-3.5 ${source.enabled ? '' : 'opacity-60'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Status dot + name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${source.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {source.name}
                      </span>
                      <LangBadge language={source.language} country={source.country} />
                      <TypeBadge type={source.feedSourceType} />
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: source.category.color }}
                      >
                        {source.category.name}
                      </span>
                    </div>

                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-red-500 truncate block max-w-sm ml-4"
                    >
                      {source.url}
                    </a>

                    <div className="flex flex-wrap items-center gap-4 mt-1.5 ml-4">
                      <ReliabilityBar score={source.reliabilityScore} />
                      <span className="text-[10px] text-slate-400">
                        {source._count.articles} άρθρα
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {source.lastFetchedAt
                          ? formatRelativeDate(source.lastFetchedAt.toISOString())
                          : 'Ποτέ'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0">
                    <SourceActions
                      sourceId={source.id}
                      sourceName={source.name}
                      sourceUrl={source.url}
                      enabled={source.enabled}
                      language={source.language}
                      country={source.country}
                      reliabilityScore={source.reliabilityScore}
                      feedSourceType={source.feedSourceType}
                      categoryId={source.categoryId}
                      categories={categories}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
