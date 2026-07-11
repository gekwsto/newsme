'use client';

import { useState } from 'react';
import type { SemanticAnalysisResult } from '@/lib/semantic-service-db';

const EXAMPLES = [
  {
    label: 'Πυρκαγιά',
    title: 'Μεγάλη φωτιά στην Αττική — εκκένωση οικισμών',
    excerpt: 'Πυρκαγιά ξέσπασε το απόγευμα στα Βίλια. Ισχυροί άνεμοι δυσκολεύουν την κατάσβεση.',
  },
  {
    label: 'Εκλογές',
    title: 'Αποτελέσματα βουλευτικών εκλογών 2026',
    excerpt: 'Ο ΣΥΡΙΖΑ και η ΝΔ διεκδικούν πρωτιά στις κάλπες. Το ΚΚΕ αναμένεται να κρατήσει την τρίτη θέση.',
  },
  {
    label: 'Οικονομία',
    title: 'ΔΝΤ: Ανάπτυξη 2,3% για την Ελλάδα το 2026',
    excerpt: 'Θετικές προβλέψεις για ΑΕΠ και ανεργία. Ο πληθωρισμός παραμένει ανησυχητικός.',
  },
];

export default function SemanticTestPanel() {
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<SemanticAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  async function analyze() {
    if (!title.trim() && !excerpt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/semantic/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, excerpt, body }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Analysis failed');
      }
      setResult(await res.json() as SemanticAnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function loadExample(ex: (typeof EXAMPLES)[number]) {
    setTitle(ex.title);
    setExcerpt(ex.excerpt);
    setBody('');
    setResult(null);
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-slate-400 self-center">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => loadExample(ex)}
              className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-700 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title…"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Excerpt</label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={3}
            placeholder="Article excerpt…"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Body (optional, first 3000 chars used)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Article body…"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>

        <button
          onClick={analyze}
          disabled={loading || (!title.trim() && !excerpt.trim())}
          className="w-full py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Pass/fail banner */}
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            result.passedSemanticFilter
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <span className={`text-2xl font-bold ${result.passedSemanticFilter ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {result.semanticScore}
            </span>
            <div>
              <p className={`font-semibold text-sm ${result.passedSemanticFilter ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {result.passedSemanticFilter ? '✓ Passed semantic filter' : '✗ Failed semantic filter'}
              </p>
              {result.filteredReason && (
                <p className="text-xs text-slate-500 mt-0.5">{result.filteredReason}</p>
              )}
              {result.winningCategory && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Category: <strong>{result.winningCategory}</strong>
                  {result.secondaryCategory && ` · Secondary: ${result.secondaryCategory}`}
                </p>
              )}
            </div>
          </div>

          {/* Category scores */}
          {result.categoryScores.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Category Scores</h3>
              <div className="space-y-2">
                {result.categoryScores.map((cs) => (
                  <div key={cs.category} className="flex items-center gap-3">
                    <span className="text-sm text-slate-700 dark:text-slate-300 w-36 flex-shrink-0">{cs.category}</span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${Math.min(cs.finalScore, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-bold text-violet-600 dark:text-violet-400 w-10 text-right">
                      {cs.finalScore}
                    </span>
                    <span className="text-xs text-slate-400 w-20 text-right">
                      {cs.tagCount} tag{cs.tagCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched tags */}
          {result.matchedTags.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Matched Tags ({result.matchedTags.length})
              </h3>
              <div className="space-y-2">
                {result.matchedTags.map((mt) => (
                  <div key={mt.tagId} className="flex items-start gap-3 text-sm">
                    <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono mt-0.5 ${
                      mt.bestLocation === 'title'
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : mt.bestLocation === 'excerpt'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      {mt.bestLocation[0].toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-900 dark:text-white">{mt.tagName}</span>
                      <span className="text-slate-400 text-xs ml-1">({mt.category})</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mt.matchedAliases.map((a, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400">
                            {a.alias}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-violet-600 dark:text-violet-400 flex-shrink-0">
                      {mt.tagScore}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Article tag suggestions */}
          {result.articleTagSuggestions.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Article Tag Suggestions
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.articleTagSuggestions.map((t, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded-full ${
                    t.tagId
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {t.name}
                    {!t.tagId && <span className="ml-1 text-[10px] opacity-60">(no DB tag)</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Debug trace */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="w-full text-left px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-between"
            >
              <span>Debug trace ({result.debugTrace.length} entries)</span>
              <span>{showDebug ? '▲' : '▼'}</span>
            </button>
            {showDebug && (
              <div className="px-5 pb-4 space-y-1">
                {result.debugTrace.length === 0 ? (
                  <p className="text-xs text-slate-400">No matches.</p>
                ) : (
                  result.debugTrace.map((line, i) => (
                    <p key={i} className="text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{line}</p>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
