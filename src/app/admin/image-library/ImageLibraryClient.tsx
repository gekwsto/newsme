'use client';

import { useState, useCallback } from 'react';
import {
  Images, FolderOpen, Tag, Download, Plus, Trash2, Eye, EyeOff,
  RefreshCw, CheckCircle, XCircle, ChevronRight, Check, Square,
  CheckSquare, Key, Settings, Bug, Star, Zap, Folder, X, Save,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImageCollection {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  description?: string | null;
  _count: { assets: number };
}

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
  collections: ImageCollection[];
  _count: { assets: number };
}

interface ImageKeyword {
  id: string;
  imageAssetId: string;
  keyword: string;
  aliases: string[];
  isPriority: boolean;
  isOverride: boolean;
}

interface ImageAsset {
  id: string;
  categoryId: string;
  tagId: string | null;
  collectionId: string | null;
  publicUrl: string;
  photographer: string | null;
  altText: string;
  description: string | null;
  width: number;
  height: number;
  qualityScore: number;
  seasonStart: string | null;
  seasonEnd: string | null;
  theme: string;
  uploadSource: string;
  usedCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  category: { name: string; slug: string };
  tag: { name: string; slug: string } | null;
  collection: { name: string; slug: string } | null;
  keywords: ImageKeyword[];
}

interface ScoreBreakdown {
  categoryBase: number;
  subcategoryMatch: number;
  exactPhraseBonus: number;
  keywordHits: { keyword: string; score: number; isPriority: boolean; isOverride: boolean }[];
  multiKeywordBonus: number;
  qualityBonus: number;
  recentUsagePenalty: number;
  usageCountPenalty: number;
  total: number;
}

interface DebugTop5 {
  rank: number;
  imageId: string;
  publicUrl: string;
  altText: string;
  score: number;
  breakdown: ScoreBreakdown;
}

interface SettingsData {
  categoryWeight: number;
  subcategoryWeight: number;
  priorityKeywordWeight: number;
  keywordWeight: number;
  exactPhraseWeight: number;
  multiKeyword2Bonus: number;
  multiKeyword3Bonus: number;
  qualityScoreWeight: number;
  overrideBonus: number;
  recentUsage1dPenalty: number;
  recentUsage3dPenalty: number;
  recentUsage7dPenalty: number;
  usageCountPenalty: number;
  usageCountCap: number;
}

const DEFAULT_SETTINGS: SettingsData = {
  categoryWeight: 40, subcategoryWeight: 30, priorityKeywordWeight: 25,
  keywordWeight: 10, exactPhraseWeight: 15, multiKeyword2Bonus: 10,
  multiKeyword3Bonus: 20, qualityScoreWeight: 1, overrideBonus: 1000,
  recentUsage1dPenalty: -15, recentUsage3dPenalty: -10, recentUsage7dPenalty: -5,
  usageCountPenalty: -1, usageCountCap: -20,
};

const THEMES = ['global', 'aisxoliasmos'];

interface Props {
  initialCategories: ImageCategory[];
  totalAssets: number;
  activeAssets: number;
  noKeywordsCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreColor(s: number) {
  if (s >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (s >= 60) return 'text-yellow-600 dark:text-yellow-400';
  if (s >= 0)  return 'text-blue-600 dark:text-blue-400';
  return 'text-slate-400';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImageLibraryClient({ initialCategories, totalAssets, activeAssets, noKeywordsCount }: Props) {
  type Tab = 'categories' | 'import' | 'assets' | 'settings' | 'debug';
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<ImageCategory[]>(initialCategories);

  // ── Categories tab ─────────────────────────────────────────────────────────
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState('');
  const [selectedCat, setSelectedCat] = useState<ImageCategory | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [colLoading, setColLoading] = useState(false);
  const [colError, setColError] = useState('');

  // ── Import tab ─────────────────────────────────────────────────────────────
  const [importCatId, setImportCatId] = useState('');
  const [importTagId, setImportTagId] = useState('');
  const [importQuery, setImportQuery] = useState('');
  const [importCount, setImportCount] = useState(30);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string } | null>(null);

  // ── Assets tab ─────────────────────────────────────────────────────────────
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [assetTotal, setAssetTotal] = useState(totalAssets);
  const [assetPage, setAssetPage] = useState(1);
  const [assetCatFilter, setAssetCatFilter] = useState('');
  const [assetThemeFilter, setAssetThemeFilter] = useState('');
  const [assetKwFilter, setAssetKwFilter] = useState('');
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Asset editor ───────────────────────────────────────────────────────────
  const [editingAsset, setEditingAsset] = useState<ImageAsset | null>(null);
  const [editQuality, setEditQuality] = useState(5);
  const [editTagId, setEditTagId] = useState('');
  const [editColId, setEditColId] = useState('');
  const [editSeasonStart, setEditSeasonStart] = useState('');
  const [editSeasonEnd, setEditSeasonEnd] = useState('');
  const [editTheme, setEditTheme] = useState('global');
  const [editDescription, setEditDescription] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editKeywords, setEditKeywords] = useState<ImageKeyword[]>([]);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [newKwText, setNewKwText] = useState('');
  const [newKwAliasText, setNewKwAliasText] = useState('');
  const [newKwPriority, setNewKwPriority] = useState(false);
  const [newKwOverride, setNewKwOverride] = useState(false);
  const [kwAdding, setKwAdding] = useState(false);

  // ── Settings tab ───────────────────────────────────────────────────────────
  const [settingsData, setSettingsData] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Debug tab ──────────────────────────────────────────────────────────────
  const [debugCatSlug, setDebugCatSlug] = useState('');
  const [debugTitle, setDebugTitle] = useState('');
  const [debugKeywords, setDebugKeywords] = useState('');
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugResult, setDebugResult] = useState<{ result: { publicUrl: string; altText: string; fallbackLevel: number; debug?: { candidateCount: number; seasonallyExcluded: number; top5: DebugTop5[] } } | null } | null>(null);

  // ─── Category actions ────────────────────────────────────────────────────────

  async function addCategory() {
    if (!newCatName.trim()) return;
    setCatLoading(true); setCatError('');
    try {
      const res = await fetch('/api/admin/image-library/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCatError(data.error || 'Error'); return; }
      setCategories((prev) => [...prev, { ...data, tags: [], collections: [], _count: { assets: 0 } }]);
      setNewCatName(''); setNewCatDesc('');
    } catch { setCatError('Network error'); }
    finally { setCatLoading(false); }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Διαγραφή κατηγορίας; Θα διαγραφούν και όλα τα tags/collections/assets.')) return;
    const res = await fetch(`/api/admin/image-library/categories?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      if (selectedCat?.id === id) setSelectedCat(null);
    }
  }

  // ─── Tag actions ─────────────────────────────────────────────────────────────

  async function addTag() {
    if (!newTagName.trim() || !selectedCat) return;
    setTagLoading(true); setTagError('');
    try {
      const res = await fetch('/api/admin/image-library/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), categoryId: selectedCat.id }),
      });
      const data = await res.json();
      if (!res.ok) { setTagError(data.error || 'Error'); return; }
      const newTag: ImageTag = { ...data, _count: { assets: 0 } };
      const updatedCat = { ...selectedCat, tags: [...selectedCat.tags, newTag] };
      setSelectedCat(updatedCat);
      setCategories((prev) => prev.map((c) => c.id === selectedCat.id ? updatedCat : c));
      setNewTagName('');
    } catch { setTagError('Network error'); }
    finally { setTagLoading(false); }
  }

  async function deleteTag(tagId: string) {
    if (!confirm('Διαγραφή tag;')) return;
    const res = await fetch(`/api/admin/image-library/tags?id=${tagId}`, { method: 'DELETE' });
    if (res.ok && selectedCat) {
      const updatedCat = { ...selectedCat, tags: selectedCat.tags.filter((t) => t.id !== tagId) };
      setSelectedCat(updatedCat);
      setCategories((prev) => prev.map((c) => c.id === selectedCat.id ? updatedCat : c));
    }
  }

  // ─── Collection actions ───────────────────────────────────────────────────────

  async function addCollection() {
    if (!newColName.trim() || !selectedCat) return;
    setColLoading(true); setColError('');
    try {
      const res = await fetch('/api/admin/image-library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColName.trim(), categoryId: selectedCat.id, description: newColDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setColError(data.error || 'Error'); return; }
      const updatedCat = { ...selectedCat, collections: [...selectedCat.collections, data] };
      setSelectedCat(updatedCat);
      setCategories((prev) => prev.map((c) => c.id === selectedCat.id ? updatedCat : c));
      setNewColName(''); setNewColDesc('');
    } catch { setColError('Network error'); }
    finally { setColLoading(false); }
  }

  async function deleteCollection(colId: string) {
    if (!confirm('Διαγραφή collection;')) return;
    const res = await fetch(`/api/admin/image-library/collections?id=${colId}`, { method: 'DELETE' });
    if (res.ok && selectedCat) {
      const updatedCat = { ...selectedCat, collections: selectedCat.collections.filter((c) => c.id !== colId) };
      setSelectedCat(updatedCat);
      setCategories((prev) => prev.map((c) => c.id === selectedCat.id ? updatedCat : c));
    }
  }

  // ─── Import action ────────────────────────────────────────────────────────────

  async function runImport() {
    if (!importCatId || !importQuery.trim()) return;
    setImporting(true); setImportResult(null);
    try {
      const res = await fetch('/api/admin/image-library/import-pexels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: importCatId, tagId: importTagId || undefined, query: importQuery.trim(), perPage: importCount }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.ok) {
        setCategories((prev) => prev.map((c) =>
          c.id === importCatId ? { ...c, _count: { assets: c._count.assets + (data.imported || 0) } } : c
        ));
      }
    } catch { setImportResult({ ok: false, error: 'Network error' }); }
    finally { setImporting(false); }
  }

  // ─── Assets actions ───────────────────────────────────────────────────────────

  const loadAssets = useCallback(async (page = 1, catId = '', theme = '', kwFilter = '') => {
    setAssetsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '40' });
      if (catId)    params.set('categoryId', catId);
      if (theme)    params.set('theme', theme);
      if (kwFilter) params.set('hasKeywords', kwFilter === 'nokw' ? 'false' : 'true');
      const res = await fetch(`/api/admin/image-library/assets?${params}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
      setAssetTotal(data.total ?? 0);
      setAssetPage(page);
      setAssetsLoaded(true);
    } finally { setAssetsLoading(false); }
  }, []);

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/image-library/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    });
    if (res.ok) setAssets((prev) => prev.map((a) => a.id === id ? { ...a, isActive: !current } : a));
  }

  async function deleteAsset(id: string) {
    if (!confirm('Οριστική διαγραφή εικόνας;')) return;
    const res = await fetch(`/api/admin/image-library/assets/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setAssetTotal((prev) => prev - 1);
      if (editingAsset?.id === id) setEditingAsset(null);
    }
  }

  function openEditor(asset: ImageAsset) {
    if (editingAsset?.id === asset.id) { setEditingAsset(null); return; }
    setEditingAsset(asset);
    setEditQuality(asset.qualityScore);
    setEditTagId(asset.tagId ?? '');
    setEditColId(asset.collectionId ?? '');
    setEditSeasonStart(asset.seasonStart ?? '');
    setEditSeasonEnd(asset.seasonEnd ?? '');
    setEditTheme(asset.theme);
    setEditDescription(asset.description ?? '');
    setEditIsActive(asset.isActive);
    setEditKeywords(asset.keywords);
    setMetaSaved(false);
  }

  async function saveAssetMeta() {
    if (!editingAsset) return;
    setMetaSaving(true);
    try {
      const res = await fetch(`/api/admin/image-library/assets/${editingAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: editIsActive,
          tagId: editTagId || null,
          collectionId: editColId || null,
          qualityScore: editQuality,
          seasonStart: editSeasonStart || null,
          seasonEnd: editSeasonEnd || null,
          theme: editTheme,
          description: editDescription || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json() as ImageAsset;
        setAssets((prev) => prev.map((a) => a.id === editingAsset.id ? { ...a, ...updated, keywords: editKeywords } : a));
        setEditingAsset((prev) => prev ? { ...prev, ...updated, keywords: editKeywords } : null);
        setMetaSaved(true);
        setTimeout(() => setMetaSaved(false), 2000);
      }
    } finally { setMetaSaving(false); }
  }

  async function addKeyword() {
    if (!newKwText.trim() || !editingAsset) return;
    setKwAdding(true);
    try {
      const aliases = newKwAliasText.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/admin/image-library/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageAssetId: editingAsset.id,
          keyword: newKwText.trim(),
          aliases,
          isPriority: newKwPriority,
          isOverride: newKwOverride,
        }),
      });
      if (res.ok) {
        const kw = await res.json() as ImageKeyword;
        const newList = [...editKeywords.filter((k) => k.keyword !== kw.keyword), kw];
        setEditKeywords(newList);
        setAssets((prev) => prev.map((a) => a.id === editingAsset.id ? { ...a, keywords: newList } : a));
        setNewKwText(''); setNewKwAliasText(''); setNewKwPriority(false); setNewKwOverride(false);
      }
    } finally { setKwAdding(false); }
  }

  async function toggleKwFlag(kwId: string, field: 'isPriority' | 'isOverride', current: boolean) {
    const res = await fetch(`/api/admin/image-library/keywords?id=${kwId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !current }),
    });
    if (res.ok) {
      const updated = await res.json() as ImageKeyword;
      setEditKeywords((prev) => prev.map((k) => k.id === kwId ? updated : k));
    }
  }

  async function deleteKeyword(kwId: string) {
    const res = await fetch(`/api/admin/image-library/keywords?id=${kwId}`, { method: 'DELETE' });
    if (res.ok) {
      const newList = editKeywords.filter((k) => k.id !== kwId);
      setEditKeywords(newList);
      if (editingAsset) setAssets((prev) => prev.map((a) => a.id === editingAsset.id ? { ...a, keywords: newList } : a));
    }
  }

  // ─── Multi-select ─────────────────────────────────────────────────────────────

  function toggleSelectMode() { setSelectMode((p) => !p); setSelectedIds(new Set()); }
  function toggleAssetSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === assets.length ? new Set() : new Set(assets.map((a) => a.id)));
  }
  async function bulkDeleteSelected() {
    if (!selectedIds.size || !confirm(`Διαγραφή ${selectedIds.size} εικόνων;`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => fetch(`/api/admin/image-library/assets/${id}`, { method: 'DELETE' })));
      const deleted = new Set(selectedIds);
      setAssets((prev) => prev.filter((a) => !deleted.has(a.id)));
      setAssetTotal((prev) => prev - deleted.size);
      setSelectedIds(new Set()); setSelectMode(false);
    } finally { setBulkDeleting(false); }
  }

  // ─── Settings ─────────────────────────────────────────────────────────────────

  async function loadSettings() {
    const res = await fetch('/api/admin/image-library/settings');
    const data = await res.json();
    setSettingsData(data ?? DEFAULT_SETTINGS);
    setSettingsLoaded(true);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      await fetch('/api/admin/image-library/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } finally { setSettingsSaving(false); }
  }

  // ─── Debug ────────────────────────────────────────────────────────────────────

  async function runDebug() {
    if (!debugCatSlug) return;
    setDebugRunning(true); setDebugResult(null);
    try {
      const kws = debugKeywords.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/admin/image-library/image-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorySlug: debugCatSlug, articleTitle: debugTitle, matchedKeywords: kws }),
      });
      const data = await res.json();
      setDebugResult(data);
    } finally { setDebugRunning(false); }
  }

  // ─── Tab switch ───────────────────────────────────────────────────────────────

  function switchTab(t: Tab) {
    setTab(t);
    if (t === 'assets' && !assetsLoaded) loadAssets(1);
    if (t === 'settings' && !settingsLoaded) loadSettings();
  }

  const importTagOptions = categories.find((c) => c.id === importCatId)?.tags ?? [];
  const editorCatTags = editingAsset ? (categories.find((c) => c.id === editingAsset.categoryId)?.tags ?? []) : [];
  const editorCatCols = editingAsset ? (categories.find((c) => c.id === editingAsset.categoryId)?.collections ?? []) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Images size={22} className="text-violet-500" />
            Image Library
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {totalAssets} εικόνες · {activeAssets} ενεργές
            {noKeywordsCount > 0 && (
              <span className="ml-2 text-amber-500 font-medium">· {noKeywordsCount} χωρίς keywords</span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {([
          { key: 'categories', label: 'Categories', icon: FolderOpen },
          { key: 'import',     label: 'Import Pexels', icon: Download },
          { key: 'assets',     label: 'Εικόνες', icon: Images },
          { key: 'settings',   label: 'Ρυθμίσεις', icon: Settings },
          { key: 'debug',      label: 'Debug', icon: Bug },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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

      {/* ── CATEGORIES TAB ─────────────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Column 1: Category list */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Κατηγορίες</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Νέα κατηγορία</p>
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                placeholder="π.χ. Artificial Intelligence"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <input value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Περιγραφή (προαιρετικό)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              {catError && <p className="text-xs text-red-500">{catError}</p>}
              <button onClick={addCategory} disabled={!newCatName.trim() || catLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                <Plus size={14} />{catLoading ? 'Αποθήκευση…' : 'Προσθήκη'}
              </button>
            </div>
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedCat?.id === cat.id
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-violet-300'
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen size={16} className="text-violet-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</p>
                      <p className="text-xs text-slate-400">
                        {cat.tags.length} tags · {cat.collections.length} collections · {cat._count.assets} εικόνες
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ChevronRight size={14} className={`text-slate-400 transition-transform ${selectedCat?.id === cat.id ? 'rotate-90' : ''}`} />
                    <button onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Δεν υπάρχουν κατηγορίες</p>}
            </div>
          </div>

          {/* Column 2: Tags */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {selectedCat ? `Tags — ${selectedCat.name}` : 'Tags'}
            </h2>
            {!selectedCat ? (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
                <Tag size={24} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Επέλεξε κατηγορία</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                <div className="flex gap-2">
                  <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="π.χ. Semiconductors"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  <button onClick={addTag} disabled={!newTagName.trim() || tagLoading}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                {tagError && <p className="text-xs text-red-500">{tagError}</p>}
                <div className="flex flex-wrap gap-2">
                  {selectedCat.tags.map((tag) => (
                    <span key={tag.id} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full">
                      <Tag size={10} />{tag.name}
                      {tag._count ? <span className="text-violet-400">({tag._count.assets})</span> : null}
                      <button onClick={() => deleteTag(tag.id)} className="ml-0.5 text-violet-400 hover:text-red-500">
                        <XCircle size={12} />
                      </button>
                    </span>
                  ))}
                  {selectedCat.tags.length === 0 && <p className="text-xs text-slate-400">Κανένα tag ακόμα</p>}
                </div>
              </div>
            )}
          </div>

          {/* Column 3: Collections */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {selectedCat ? `Collections — ${selectedCat.name}` : 'Collections'}
            </h2>
            {!selectedCat ? (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
                <Folder size={24} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Επέλεξε κατηγορία</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                <div className="space-y-2">
                  <input value={newColName} onChange={(e) => setNewColName(e.target.value)}
                    placeholder="π.χ. Nvidia GTC 2026"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  <input value={newColDesc} onChange={(e) => setNewColDesc(e.target.value)}
                    placeholder="Περιγραφή (προαιρετικό)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  {colError && <p className="text-xs text-red-500">{colError}</p>}
                  <button onClick={addCollection} disabled={!newColName.trim() || colLoading}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                    <Plus size={14} />{colLoading ? 'Αποθήκευση…' : 'Προσθήκη'}
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedCat.collections.map((col) => (
                    <div key={col.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{col.name}</p>
                        <p className="text-xs text-slate-400">{col._count.assets} εικόνες</p>
                      </div>
                      <button onClick={() => deleteCollection(col.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {selectedCat.collections.length === 0 && <p className="text-xs text-slate-400">Καμία collection ακόμα</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'import' && (
        <div className="max-w-xl space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Import από Pexels</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Κατηγορία *</label>
                <select value={importCatId} onChange={(e) => { setImportCatId(e.target.value); setImportTagId(''); }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">— Επέλεξε κατηγορία —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tag/Subcategory (προαιρετικό)</label>
                <select value={importTagId} onChange={(e) => setImportTagId(e.target.value)} disabled={!importCatId}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50">
                  <option value="">— Χωρίς tag —</option>
                  {importTagOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Search query *</label>
                <input value={importQuery} onChange={(e) => setImportQuery(e.target.value)}
                  placeholder="π.χ. artificial intelligence robot"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Αριθμός εικόνων (max 80)</label>
                <input type="number" min={1} max={80} value={importCount}
                  onChange={(e) => setImportCount(Math.min(80, Math.max(1, Number(e.target.value))))}
                  className="w-32 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
            <button onClick={runImport} disabled={!importCatId || !importQuery.trim() || importing}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              {importing ? 'Κατέβασμα…' : 'Εκκίνηση import'}
            </button>
            {importResult && (
              <div className={`p-4 rounded-lg border ${importResult.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                {importResult.ok ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-emerald-800 dark:text-emerald-300">
                      <p className="font-semibold">Import ολοκληρώθηκε!</p>
                      <p>{importResult.imported} εικόνες · {importResult.skipped} παραλείφθηκαν</p>
                      <p className="text-xs text-amber-600 mt-1">Άνοιξε την καρτέλα Εικόνες και πρόσθεσε keywords σε κάθε εικόνα.</p>
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
        </div>
      )}

      {/* ── ASSETS TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={assetCatFilter} onChange={(e) => { setAssetCatFilter(e.target.value); setAssetKwFilter(''); setSelectedIds(new Set()); loadAssets(1, e.target.value, assetThemeFilter, ''); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Όλες οι κατηγορίες</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count.assets})</option>)}
            </select>
            <select value={assetThemeFilter} onChange={(e) => { setAssetThemeFilter(e.target.value); setSelectedIds(new Set()); loadAssets(1, assetCatFilter, e.target.value, assetKwFilter); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Όλα τα themes</option>
              {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={assetKwFilter} onChange={(e) => { setAssetKwFilter(e.target.value); setSelectedIds(new Set()); loadAssets(1, assetCatFilter, assetThemeFilter, e.target.value); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Όλες</option>
              <option value="kw">Με keywords</option>
              <option value="nokw">Χωρίς keywords ⚠️</option>
            </select>
            <button onClick={() => loadAssets(assetPage, assetCatFilter, assetThemeFilter, assetKwFilter)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-violet-600 transition-colors">
              <RefreshCw size={14} className={assetsLoading ? 'animate-spin' : ''} /> Ανανέωση
            </button>
            <span className="text-sm text-slate-400">{assetTotal} εικόνες</span>
            {assetsLoaded && assets.length > 0 && (
              <button onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${selectMode ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400'}`}>
                <CheckSquare size={14} />{selectMode ? 'Ακύρωση' : 'Επιλογή'}
              </button>
            )}
          </div>

          {!assetsLoaded && (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">Κάνε κλικ σε &apos;Ανανέωση&apos; για να φορτωθούν οι εικόνες</p>
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
              {selectMode && (
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-sm text-violet-700 dark:text-violet-300 hover:underline">
                      {selectedIds.size === assets.length ? <><CheckSquare size={14} /> Αποεπιλογή</> : <><Square size={14} /> Επιλογή όλων</>}
                    </button>
                    <span className="text-sm text-slate-500">{selectedIds.size > 0 ? `${selectedIds.size} επιλεγμένες` : 'Καμία'}</span>
                  </div>
                  <button onClick={bulkDeleteSelected} disabled={selectedIds.size === 0 || bulkDeleting}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                    {bulkDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {bulkDeleting ? 'Διαγραφή…' : `Διαγραφή${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
                  </button>
                </div>
              )}

              {/* Image grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {assets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  const isEditing = editingAsset?.id === asset.id;
                  return (
                    <div key={asset.id}
                      onClick={selectMode ? () => toggleAssetSelect(asset.id) : () => openEditor(asset)}
                      className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all bg-slate-100 dark:bg-slate-800 ${
                        isEditing ? 'border-violet-500 ring-2 ring-violet-400' :
                        selectMode && isSelected ? 'border-violet-500 ring-2 ring-violet-400' :
                        !asset.isActive ? 'border-red-200 dark:border-red-900 opacity-60' :
                        'border-slate-200 dark:border-slate-700 hover:border-violet-400'
                      }`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.publicUrl} alt={asset.altText} className="w-full aspect-video object-cover" loading="lazy" />

                      {/* Keywords badge */}
                      {asset.keywords.length === 0 && (
                        <div className="absolute top-1 left-1">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">KW!</span>
                        </div>
                      )}

                      {selectMode && (
                        <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-violet-500/20' : 'bg-black/5'}`}>
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center shadow-sm transition-colors ${isSelected ? 'bg-violet-500 border-violet-500' : 'bg-white/90 border-slate-300'}`}>
                            {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </div>
                        </div>
                      )}

                      {!selectMode && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                          <div className="flex justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleActive(asset.id, asset.isActive); }}
                              className="p-1 rounded bg-white/20 hover:bg-white/40 text-white transition-colors">
                              {asset.isActive ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteAsset(asset.id); }}
                              className="p-1 rounded bg-red-500/80 hover:bg-red-600 text-white transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <p className="text-white text-[10px] leading-tight truncate">
                            {asset.keywords.length > 0 ? asset.keywords.slice(0, 2).map((k) => k.keyword).join(', ') : 'Χωρίς keywords'}
                          </p>
                        </div>
                      )}

                      <div className="px-1.5 py-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">
                          {asset.tag ? <span className="text-violet-500">#{asset.tag.name}</span> : asset.category.name}
                        </span>
                        <span className="shrink-0 ml-1">★{asset.qualityScore} · {asset.usedCount}×</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Asset Editor Panel */}
              {editingAsset && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-violet-200 dark:border-violet-800 shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800">
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-300 flex items-center gap-2">
                      <Key size={14} /> Επεξεργασία εικόνας
                    </p>
                    <button onClick={() => setEditingAsset(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-700">

                    {/* Left: Meta fields */}
                    <div className="p-5 space-y-4">
                      <div className="flex gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editingAsset.publicUrl} alt={editingAsset.altText}
                          className="w-32 h-24 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0" />
                        <div className="flex-1 min-w-0 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm truncate">{editingAsset.altText}</p>
                          <p>{editingAsset.width}×{editingAsset.height} · {editingAsset.uploadSource}</p>
                          <p>Χρησιμοποιήθηκε {editingAsset.usedCount}× · Τελευταία: {fmt(editingAsset.lastUsedAt)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Quality (1–10)</label>
                          <div className="flex items-center gap-2">
                            <input type="range" min={1} max={10} value={editQuality} onChange={(e) => setEditQuality(Number(e.target.value))}
                              className="flex-1 accent-violet-500" />
                            <span className="text-sm font-bold text-violet-600 w-4">{editQuality}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Theme</label>
                          <select value={editTheme} onChange={(e) => setEditTheme(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                            {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tag/Subcategory</label>
                          <select value={editTagId} onChange={(e) => setEditTagId(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                            <option value="">— Κανένα —</option>
                            {editorCatTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Collection</label>
                          <select value={editColId} onChange={(e) => setEditColId(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                            <option value="">— Καμία —</option>
                            {editorCatCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Season Start (MM-DD)</label>
                          <input value={editSeasonStart} onChange={(e) => setEditSeasonStart(e.target.value)}
                            placeholder="12-01"
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Season End (MM-DD)</label>
                          <input value={editSeasonEnd} onChange={(e) => setEditSeasonEnd(e.target.value)}
                            placeholder="12-31"
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Σημείωση (εσωτερική)</label>
                        <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="π.χ. Χρησιμοποιείται μόνο για Nvidia articles"
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="accent-violet-500" />
                          Ενεργή
                        </label>
                        <button onClick={saveAssetMeta} disabled={metaSaving}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                            metaSaved ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'
                          }`}>
                          {metaSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                          {metaSaved ? 'Αποθηκεύτηκε ✓' : metaSaving ? 'Αποθήκευση…' : 'Αποθήκευση'}
                        </button>
                      </div>
                    </div>

                    {/* Right: Keywords */}
                    <div className="p-5 space-y-4">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Key size={12} /> Keywords ({editKeywords.length})
                      </p>

                      {/* Existing keywords list */}
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {editKeywords.map((kw) => (
                          <div key={kw.id} className="flex items-start justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{kw.keyword}</span>
                                {kw.isPriority && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-bold">★ PRIORITY</span>}
                                {kw.isOverride && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-bold">⚡ OVERRIDE</span>}
                              </div>
                              {kw.aliases.length > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate">→ {kw.aliases.join(', ')}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => toggleKwFlag(kw.id, 'isPriority', kw.isPriority)}
                                title="Toggle Priority"
                                className={`p-1 rounded transition-colors ${kw.isPriority ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}>
                                <Star size={13} />
                              </button>
                              <button onClick={() => toggleKwFlag(kw.id, 'isOverride', kw.isOverride)}
                                title="Toggle Override"
                                className={`p-1 rounded transition-colors ${kw.isOverride ? 'text-red-500' : 'text-slate-300 hover:text-red-400'}`}>
                                <Zap size={13} />
                              </button>
                              <button onClick={() => deleteKeyword(kw.id)}
                                className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {editKeywords.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4">Δεν υπάρχουν keywords ακόμα</p>
                        )}
                      </div>

                      {/* Add keyword form */}
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase">Προσθήκη keyword</p>
                        <input value={newKwText} onChange={(e) => setNewKwText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                          placeholder="π.χ. nvidia (canonical form)"
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <input value={newKwAliasText} onChange={(e) => setNewKwAliasText(e.target.value)}
                          placeholder="Aliases: chatgpt, gpt-4, sam altman (comma-separated)"
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs">
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                              <input type="checkbox" checked={newKwPriority} onChange={(e) => setNewKwPriority(e.target.checked)} className="accent-amber-500" />
                              <Star size={11} className="text-amber-500" /> Priority
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                              <input type="checkbox" checked={newKwOverride} onChange={(e) => setNewKwOverride(e.target.checked)} className="accent-red-500" />
                              <Zap size={11} className="text-red-500" /> Override
                            </label>
                          </div>
                          <button onClick={addKeyword} disabled={!newKwText.trim() || kwAdding}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                            {kwAdding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                            Προσθήκη
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {assetTotal > 40 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button onClick={() => { setSelectedIds(new Set()); loadAssets(assetPage - 1, assetCatFilter, assetThemeFilter, assetKwFilter); }}
                    disabled={assetPage <= 1 || assetsLoading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    ← Προηγούμενο
                  </button>
                  <span className="text-sm text-slate-500">Σελίδα {assetPage} / {Math.ceil(assetTotal / 40)}</span>
                  <button onClick={() => { setSelectedIds(new Set()); loadAssets(assetPage + 1, assetCatFilter, assetThemeFilter, assetKwFilter); }}
                    disabled={assetPage >= Math.ceil(assetTotal / 40) || assetsLoading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    Επόμενο →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ────────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Scoring Weights</h2>
              <button onClick={() => setSettingsData(DEFAULT_SETTINGS)} className="text-xs text-slate-400 hover:text-violet-500 transition-colors">
                Reset to defaults
              </button>
            </div>

            {([
              { group: 'Βάσεις', fields: [
                { key: 'categoryWeight',        label: 'Category Match' },
                { key: 'subcategoryWeight',     label: 'Subcategory Match' },
                { key: 'exactPhraseWeight',     label: 'Exact Phrase Bonus' },
              ]},
              { group: 'Keywords', fields: [
                { key: 'priorityKeywordWeight', label: 'Priority Keyword Hit' },
                { key: 'keywordWeight',         label: 'Regular Keyword Hit' },
                { key: 'overrideBonus',         label: 'Override Bonus' },
              ]},
              { group: 'Bonuses', fields: [
                { key: 'multiKeyword2Bonus',    label: '2 Keywords Bonus' },
                { key: 'multiKeyword3Bonus',    label: '3+ Keywords Bonus' },
                { key: 'qualityScoreWeight',    label: 'Quality Score Weight (per point)' },
              ]},
              { group: 'Penalties', fields: [
                { key: 'recentUsage1dPenalty',  label: 'Used < 24h ago' },
                { key: 'recentUsage3dPenalty',  label: 'Used < 3 days ago' },
                { key: 'recentUsage7dPenalty',  label: 'Used < 7 days ago' },
                { key: 'usageCountPenalty',     label: 'Per use penalty' },
                { key: 'usageCountCap',         label: 'Usage penalty cap' },
              ]},
            ] as const).map(({ group, fields }) => (
              <div key={group} className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">{group}</p>
                {fields.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <label className="text-sm text-slate-700 dark:text-slate-300 flex-1">{label}</label>
                    <input type="number" value={settingsData[key as keyof SettingsData]} step={1}
                      onChange={(e) => setSettingsData((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                      className="w-24 px-2 py-1.5 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                ))}
              </div>
            ))}

            <button onClick={saveSettings} disabled={settingsSaving}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                settingsSaved ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'
              }`}>
              {settingsSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {settingsSaved ? 'Αποθηκεύτηκε ✓' : settingsSaving ? 'Αποθήκευση…' : 'Αποθήκευση Ρυθμίσεων'}
            </button>
          </div>
        </div>
      )}

      {/* ── DEBUG TAB ────────────────────────────────────────────────────────────── */}
      {tab === 'debug' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Bug size={16} className="text-violet-500" /> Test Image Selection
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category *</label>
                <select value={debugCatSlug} onChange={(e) => setDebugCatSlug(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">— Επέλεξε κατηγορία —</option>
                  {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Article Title</label>
                <input value={debugTitle} onChange={(e) => setDebugTitle(e.target.value)}
                  placeholder="π.χ. Η Nvidia ανακοίνωσε νέα GPU chip"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Matched Keywords (comma-separated, normalized)</label>
              <input value={debugKeywords} onChange={(e) => setDebugKeywords(e.target.value)}
                placeholder="π.χ. nvidia, gpu, chip, τεχνολογια"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <button onClick={runDebug} disabled={!debugCatSlug || debugRunning}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
              {debugRunning ? <RefreshCw size={14} className="animate-spin" /> : <Bug size={14} />}
              {debugRunning ? 'Εκτέλεση…' : 'Run Selection'}
            </button>
          </div>

          {debugResult && (
            <div className="space-y-4">
              {!debugResult.result ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Δεν βρέθηκε εικόνα (Level 4: null)</p>
                  <p className="text-xs text-red-500 mt-1">Δεν υπάρχουν εικόνες σε αυτή την κατηγορία ή δεν υπάρχει fallback.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={debugResult.result.publicUrl} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Winner — Fallback Level {debugResult.result.fallbackLevel}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{debugResult.result.altText}</p>
                      {debugResult.result.debug && (
                        <p className="text-xs text-slate-400 mt-1">
                          {debugResult.result.debug.candidateCount} candidates · {debugResult.result.debug.seasonallyExcluded} seasonal excluded
                        </p>
                      )}
                    </div>
                  </div>

                  {debugResult.result.debug?.top5 && debugResult.result.debug.top5.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Top {debugResult.result.debug.top5.length} Candidates</p>
                      {debugResult.result.debug.top5.map((item) => (
                        <div key={item.rank} className={`rounded-xl border p-4 ${item.rank === 1 ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
                          <div className="flex items-start gap-3">
                            <span className="text-lg font-black text-slate-400 w-6 shrink-0">#{item.rank}</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.publicUrl} alt="" className="w-16 h-11 object-cover rounded shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.altText}</p>
                                <span className={`text-sm font-black shrink-0 ${scoreColor(item.score)}`}>{Math.round(item.score)}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                {item.breakdown.categoryBase > 0 && <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">+{item.breakdown.categoryBase} category</span>}
                                {item.breakdown.subcategoryMatch > 0 && <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">+{item.breakdown.subcategoryMatch} subcategory</span>}
                                {item.breakdown.exactPhraseBonus > 0 && <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">+{item.breakdown.exactPhraseBonus} exact phrase</span>}
                                {item.breakdown.keywordHits.map((kh, i) => (
                                  <span key={i} className={`px-1.5 py-0.5 rounded ${kh.isOverride ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : kh.isPriority ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'}`}>
                                    +{kh.score} {kh.keyword}{kh.isOverride ? ' ⚡' : kh.isPriority ? ' ★' : ''}
                                  </span>
                                ))}
                                {item.breakdown.multiKeywordBonus > 0 && <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded">+{item.breakdown.multiKeywordBonus} multi-kw</span>}
                                {item.breakdown.qualityBonus !== 0 && <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">{item.breakdown.qualityBonus > 0 ? '+' : ''}{item.breakdown.qualityBonus.toFixed(1)} quality</span>}
                                {item.breakdown.recentUsagePenalty !== 0 && <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">{item.breakdown.recentUsagePenalty} recency</span>}
                                {item.breakdown.usageCountPenalty !== 0 && <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">{item.breakdown.usageCountPenalty.toFixed(0)} uses</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
