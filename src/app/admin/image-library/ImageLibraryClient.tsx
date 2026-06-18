'use client';

import { useState, useCallback } from 'react';
import {
  Images,
  FolderOpen,
  Tag,
  Download,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImageTag {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  _count?: { assets: number };
}

interface ImageCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tags: ImageTag[];
  _count: { assets: number };
}

interface ImageAsset {
  id: string;
  categoryId: string;
  tagId: string | null;
  pexelsId: number;
  publicUrl: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
  altText: string;
  width: number;
  height: number;
  usedCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  category: { name: string; slug: string };
  tag: { name: string; slug: string } | null;
}

interface Props {
  initialCategories: ImageCategory[];
  totalAssets: number;
  activeAssets: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImageLibraryClient({ initialCategories, totalAssets, activeAssets }: Props) {
  const [tab, setTab] = useState<'categories' | 'import' | 'assets'>('categories');
  const [categories, setCategories] = useState<ImageCategory[]>(initialCategories);

  // ── Categories tab state ──────────────────────────────────────────────────

  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState('');
  const [selectedCat, setSelectedCat] = useState<ImageCategory | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState('');

  // ── Import tab state ──────────────────────────────────────────────────────

  const [importCatId, setImportCatId] = useState('');
  const [importTagId, setImportTagId] = useState('');
  const [importQuery, setImportQuery] = useState('');
  const [importCount, setImportCount] = useState(30);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string } | null>(null);

  // ── Assets tab state ──────────────────────────────────────────────────────

  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [assetTotal, setAssetTotal] = useState(totalAssets);
  const [assetPage, setAssetPage] = useState(1);
  const [assetCatFilter, setAssetCatFilter] = useState('');
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // ─── Category actions ──────────────────────────────────────────────────────

  async function addCategory() {
    if (!newCatName.trim()) return;
    setCatLoading(true);
    setCatError('');
    try {
      const res = await fetch('/api/admin/image-library/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCatError(data.error || 'Error'); return; }
      setCategories((prev) => [...prev, { ...data, tags: [], _count: { assets: 0 } }]);
      setNewCatName('');
      setNewCatDesc('');
    } catch (e) {
      setCatError('Network error');
    } finally {
      setCatLoading(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Διαγραφή κατηγορίας; Θα διαγραφούν και όλα τα tags/assets.')) return;
    const res = await fetch(`/api/admin/image-library/categories?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      if (selectedCat?.id === id) setSelectedCat(null);
    }
  }

  // ─── Tag actions ───────────────────────────────────────────────────────────

  async function addTag() {
    if (!newTagName.trim() || !selectedCat) return;
    setTagLoading(true);
    setTagError('');
    try {
      const res = await fetch('/api/admin/image-library/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), categoryId: selectedCat.id }),
      });
      const data = await res.json();
      if (!res.ok) { setTagError(data.error || 'Error'); return; }
      const newTag: ImageTag = { ...data, _count: { assets: 0 } };
      setCategories((prev) =>
        prev.map((c) =>
          c.id === selectedCat.id ? { ...c, tags: [...c.tags, newTag] } : c
        )
      );
      setSelectedCat((prev) => prev ? { ...prev, tags: [...prev.tags, newTag] } : prev);
      setNewTagName('');
    } catch {
      setTagError('Network error');
    } finally {
      setTagLoading(false);
    }
  }

  async function deleteTag(tagId: string) {
    if (!confirm('Διαγραφή tag;')) return;
    const res = await fetch(`/api/admin/image-library/tags?id=${tagId}`, { method: 'DELETE' });
    if (res.ok && selectedCat) {
      const updated = { ...selectedCat, tags: selectedCat.tags.filter((t) => t.id !== tagId) };
      setSelectedCat(updated);
      setCategories((prev) => prev.map((c) => c.id === selectedCat.id ? updated : c));
    }
  }

  // ─── Import action ─────────────────────────────────────────────────────────

  async function runImport() {
    if (!importCatId || !importQuery.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/image-library/import-pexels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: importCatId,
          tagId: importTagId || undefined,
          query: importQuery.trim(),
          perPage: importCount,
        }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.ok) {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === importCatId
              ? { ...c, _count: { assets: c._count.assets + (data.imported || 0) } }
              : c
          )
        );
      }
    } catch {
      setImportResult({ ok: false, error: 'Network error' });
    } finally {
      setImporting(false);
    }
  }

  // ─── Assets actions ────────────────────────────────────────────────────────

  const loadAssets = useCallback(async (page = 1, catId = '') => {
    setAssetsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '40' });
      if (catId) params.set('categoryId', catId);
      const res = await fetch(`/api/admin/image-library/assets?${params}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
      setAssetTotal(data.total ?? 0);
      setAssetPage(page);
      setAssetsLoaded(true);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/image-library/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    });
    if (res.ok) {
      setAssets((prev) => prev.map((a) => a.id === id ? { ...a, isActive: !current } : a));
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm('Οριστική διαγραφή εικόνας;')) return;
    const res = await fetch(`/api/admin/image-library/assets/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setAssetTotal((prev) => prev - 1);
    }
  }

  // ─── Tab switch ────────────────────────────────────────────────────────────

  function switchTab(t: typeof tab) {
    setTab(t);
    if (t === 'assets' && !assetsLoaded) {
      loadAssets(1, assetCatFilter);
    }
  }

  const importTagOptions = categories.find((c) => c.id === importCatId)?.tags ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Images size={22} className="text-violet-500" />
            Image Library
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {totalAssets} εικόνες συνολικά · {activeAssets} ενεργές
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: 'categories', label: 'Categories & Tags', icon: FolderOpen },
          { key: 'import', label: 'Import από Pexels', icon: Download },
          { key: 'assets', label: 'Εικόνες', icon: Images },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── CATEGORIES TAB ─────────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Left: list of categories */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Κατηγορίες
            </h2>

            {/* Add category form */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Νέα κατηγορία</p>
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="π.χ. Artificial Intelligence"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <input
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Περιγραφή (προαιρετικό)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              {catError && <p className="text-xs text-red-500">{catError}</p>}
              <button
                onClick={addCategory}
                disabled={!newCatName.trim() || catLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                <Plus size={14} />
                {catLoading ? 'Αποθήκευση…' : 'Προσθήκη'}
              </button>
            </div>

            {/* Category list */}
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedCat?.id === cat.id
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-violet-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen size={16} className="text-violet-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</p>
                      <p className="text-xs text-slate-400">{cat.tags.length} tags · {cat._count.assets} εικόνες</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ChevronRight size={14} className={`text-slate-400 transition-transform ${selectedCat?.id === cat.id ? 'rotate-90' : ''}`} />
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">Δεν υπάρχουν κατηγορίες ακόμα</p>
              )}
            </div>
          </div>

          {/* Right: tags for selected category */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              {selectedCat ? `Tags — ${selectedCat.name}` : 'Tags'}
            </h2>

            {!selectedCat ? (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
                <Tag size={24} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Επέλεξε κατηγορία για να διαχειριστείς τα tags</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                {/* Add tag */}
                <div className="flex gap-2">
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="π.χ. OpenAI"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    onClick={addTag}
                    disabled={!newTagName.trim() || tagLoading}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {tagError && <p className="text-xs text-red-500">{tagError}</p>}

                {/* Tag list */}
                <div className="flex flex-wrap gap-2">
                  {selectedCat.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full"
                    >
                      <Tag size={10} />
                      {tag.name}
                      {tag._count ? <span className="text-violet-400">({tag._count.assets})</span> : null}
                      <button
                        onClick={() => deleteTag(tag.id)}
                        className="ml-0.5 text-violet-400 hover:text-red-500"
                      >
                        <XCircle size={12} />
                      </button>
                    </span>
                  ))}
                  {selectedCat.tags.length === 0 && (
                    <p className="text-xs text-slate-400">Κανένα tag ακόμα</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ─────────────────────────────────────────────────────── */}
      {tab === 'import' && (
        <div className="max-w-xl space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Import από Pexels</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Κατηγορία *</label>
                <select
                  value={importCatId}
                  onChange={(e) => { setImportCatId(e.target.value); setImportTagId(''); }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">— Επέλεξε κατηγορία —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tag (προαιρετικό)</label>
                <select
                  value={importTagId}
                  onChange={(e) => setImportTagId(e.target.value)}
                  disabled={!importCatId}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                >
                  <option value="">— Χωρίς tag —</option>
                  {importTagOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Search query *</label>
                <input
                  value={importQuery}
                  onChange={(e) => setImportQuery(e.target.value)}
                  placeholder="π.χ. artificial intelligence robot"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Αριθμός εικόνων (max 80)
                </label>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={importCount}
                  onChange={(e) => setImportCount(Math.min(80, Math.max(1, Number(e.target.value))))}
                  className="w-32 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            <button
              onClick={runImport}
              disabled={!importCatId || !importQuery.trim() || importing}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              {importing ? 'Κατέβασμα…' : 'Εκκίνηση import'}
            </button>

            {/* Result */}
            {importResult && (
              <div className={`p-4 rounded-lg border ${
                importResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                {importResult.ok ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-emerald-800 dark:text-emerald-300">
                      <p className="font-semibold">Import ολοκληρώθηκε!</p>
                      <p>{importResult.imported} εικόνες κατέβηκαν · {importResult.skipped} παραλείφθηκαν (ήδη υπάρχουν)</p>
                      {importResult.errors && importResult.errors.length > 0 && (
                        <p className="text-amber-600 mt-1">{importResult.errors.length} σφάλματα — δες logs</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">{importResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold mb-1">Πώς λειτουργεί</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Αναζητά εικόνες στο Pexels API (landscape orientation)</li>
              <li>Κατεβάζει local copy στο <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">public/uploads/images/{'{category}/{tag}/'}</code></li>
              <li>Αποθηκεύει metadata στη DB</li>
              <li>Αν η εικόνα υπάρχει ήδη (pexels ID), γίνεται skip</li>
              <li>Τα άρθρα επιλέγουν αυτόματα εικόνα κατά τη δημιουργία τους</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── ASSETS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={assetCatFilter}
              onChange={(e) => { setAssetCatFilter(e.target.value); loadAssets(1, e.target.value); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Όλες οι κατηγορίες</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count.assets})</option>)}
            </select>
            <button
              onClick={() => loadAssets(assetPage, assetCatFilter)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-violet-600 transition-colors"
            >
              <RefreshCw size={14} className={assetsLoading ? 'animate-spin' : ''} />
              Ανανέωση
            </button>
            <span className="text-sm text-slate-400">{assetTotal} εικόνες</span>
          </div>

          {!assetsLoaded && (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">Κάνε κλικ σε μια κατηγορία ή &apos;Ανανέωση&apos; για να φορτωθούν οι εικόνες</p>
            </div>
          )}

          {assetsLoaded && assets.length === 0 && !assetsLoading && (
            <div className="text-center py-16">
              <Images size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Δεν βρέθηκαν εικόνες</p>
            </div>
          )}

          {assets.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`group relative rounded-xl overflow-hidden border ${
                      asset.isActive
                        ? 'border-slate-200 dark:border-slate-700'
                        : 'border-red-200 dark:border-red-900 opacity-60'
                    } bg-slate-100 dark:bg-slate-800`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.publicUrl}
                      alt={asset.altText}
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                    />

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => toggleActive(asset.id, asset.isActive)}
                          title={asset.isActive ? 'Deactivate' : 'Activate'}
                          className="p-1 rounded bg-white/20 hover:bg-white/40 text-white transition-colors"
                        >
                          {asset.isActive ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button
                          onClick={() => deleteAsset(asset.id)}
                          className="p-1 rounded bg-red-500/80 hover:bg-red-600 text-white transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div>
                        <p className="text-white text-[10px] leading-tight truncate">
                          <a href={asset.photographerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {asset.photographer}
                          </a>
                        </p>
                      </div>
                    </div>

                    {/* Stats bar */}
                    <div className="px-1.5 py-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">
                        {asset.tag ? <span className="text-violet-500">#{asset.tag.name}</span> : asset.category.name}
                      </span>
                      <span className="shrink-0 ml-1">{asset.usedCount}×</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {assetTotal > 40 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => loadAssets(assetPage - 1, assetCatFilter)}
                    disabled={assetPage <= 1 || assetsLoading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    ← Προηγούμενο
                  </button>
                  <span className="text-sm text-slate-500">
                    Σελίδα {assetPage} / {Math.ceil(assetTotal / 40)}
                  </span>
                  <button
                    onClick={() => loadAssets(assetPage + 1, assetCatFilter)}
                    disabled={assetPage >= Math.ceil(assetTotal / 40) || assetsLoading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Επόμενο →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
