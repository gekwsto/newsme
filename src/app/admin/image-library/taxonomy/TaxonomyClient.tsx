'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderOpen, Tag, Plus, Trash2, Loader2, ChevronRight,
  Star, X, Check, ArrowLeft, AlertTriangle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TagKeyword {
  keyword: string;
  aliases: string[];
  isPriority: boolean;
}

interface ImageTag {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  keywords: TagKeyword[];
  _count: { assets: number };
}

interface ImageCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tags: ImageTag[];
  _count: { assets: number; tags: number };
}

interface Props {
  initialCategories: ImageCategory[];
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function btnBase(color: string) {
  return `flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${color}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaxonomyClient({ initialCategories }: Props) {
  const [categories, setCategories] = useState<ImageCategory[]>(initialCategories);
  const [selectedCat, setSelectedCat] = useState<ImageCategory | null>(initialCategories[0] ?? null);

  // ── Category form ─────────────────────────────────────────────────────────
  const [newCatName, setNewCatName] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catErr, setCatErr] = useState('');

  // ── Tag form ──────────────────────────────────────────────────────────────
  const [newTagName, setNewTagName] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [tagErr, setTagErr] = useState('');

  // ── Keyword editor ────────────────────────────────────────────────────────
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [kwBusy, setKwBusy] = useState(false);
  // new keyword form state
  const [newKw, setNewKw] = useState('');
  const [newKwAliases, setNewKwAliases] = useState('');
  const [newKwPriority, setNewKwPriority] = useState(false);

  // ─── Category actions ──────────────────────────────────────────────────────

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true); setCatErr('');
    try {
      const res = await fetch('/api/admin/image-library/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { setCatErr(data.error ?? 'Error'); return; }
      const cat: ImageCategory = { ...data, tags: [], _count: { assets: 0, tags: 0 } };
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name, 'el')));
      setNewCatName('');
    } catch { setCatErr('Network error'); }
    finally { setCatBusy(false); }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Διαγραφή κατηγορίας; Θα διαγραφούν και όλα τα tags / assets.')) return;
    const res = await fetch(`/api/admin/image-library/categories?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      if (selectedCat?.id === id) setSelectedCat(categories.find((c) => c.id !== id) ?? null);
    }
  }

  // ─── Tag actions ───────────────────────────────────────────────────────────

  async function addTag() {
    const name = newTagName.trim();
    if (!name || !selectedCat) return;
    setTagBusy(true); setTagErr('');
    try {
      const res = await fetch('/api/admin/image-library/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, categoryId: selectedCat.id }),
      });
      const data = await res.json();
      if (!res.ok) { setTagErr(data.error ?? 'Error'); return; }
      const tag: ImageTag = { ...data, keywords: [], _count: { assets: 0 } };
      updateCatTags(selectedCat.id, [...selectedCat.tags, tag]);
      setNewTagName('');
    } catch { setTagErr('Network error'); }
    finally { setTagBusy(false); }
  }

  async function deleteTag(tagId: string) {
    if (!confirm('Διαγραφή tag; Οι εικόνες δεν διαγράφονται, μένουν χωρίς tag.')) return;
    const res = await fetch(`/api/admin/image-library/tags?id=${tagId}`, { method: 'DELETE' });
    if (res.ok && selectedCat) {
      updateCatTags(selectedCat.id, selectedCat.tags.filter((t) => t.id !== tagId));
      if (editingTagId === tagId) setEditingTagId(null);
    }
  }

  // ─── Keyword actions ───────────────────────────────────────────────────────

  function getTag(tagId: string) {
    return selectedCat?.tags.find((t) => t.id === tagId) ?? null;
  }

  async function saveKeywords(tagId: string, keywords: TagKeyword[]) {
    setKwBusy(true);
    try {
      const res = await fetch(`/api/admin/image-library/tags?id=${tagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      if (!res.ok) return;
      if (selectedCat) {
        updateCatTags(selectedCat.id, selectedCat.tags.map((t) =>
          t.id === tagId ? { ...t, keywords } : t,
        ));
      }
    } finally { setKwBusy(false); }
  }

  async function addKeyword(tagId: string) {
    const kw = newKw.trim().toLowerCase();
    if (!kw) return;
    const tag = getTag(tagId);
    if (!tag) return;
    const aliases = newKwAliases.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const updated = [
      ...tag.keywords.filter((k) => k.keyword !== kw),
      { keyword: kw, aliases, isPriority: newKwPriority },
    ];
    await saveKeywords(tagId, updated);
    setNewKw(''); setNewKwAliases(''); setNewKwPriority(false);
  }

  async function removeKeyword(tagId: string, keyword: string) {
    const tag = getTag(tagId);
    if (!tag) return;
    await saveKeywords(tagId, tag.keywords.filter((k) => k.keyword !== keyword));
  }

  async function togglePriority(tagId: string, keyword: string) {
    const tag = getTag(tagId);
    if (!tag) return;
    const updated = tag.keywords.map((k) =>
      k.keyword === keyword ? { ...k, isPriority: !k.isPriority } : k,
    );
    await saveKeywords(tagId, updated);
  }

  // ─── Local state helper ────────────────────────────────────────────────────

  function updateCatTags(catId: string, tags: ImageTag[]) {
    const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, 'el'));
    setCategories((prev) => prev.map((c) =>
      c.id === catId ? { ...c, tags: sorted, _count: { ...c._count, tags: sorted.length } } : c,
    ));
    setSelectedCat((prev) => prev?.id === catId ? { ...prev, tags: sorted } : prev);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputCls = 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-red-500 transition-colors';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/image-library"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
          <ArrowLeft size={13} /> Image Library
        </Link>
        <ChevronRight size={13} className="text-slate-300" />
        <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">Image Taxonomy</h1>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
        Ορίζεις categories, tags και keyword templates ανά tag.
        Όταν το pipeline επιλέγει εικόνα για άρθρο, χρησιμοποιεί αυτά τα keywords για να βρει
        την πιο σχετική εικόνα — χωρίς LLM.
      </p>

      <div className="grid grid-cols-[280px_1fr] gap-6">

        {/* ── LEFT: Categories ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
              <FolderOpen size={14} className="text-slate-500" />
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                Categories
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
              {categories.map((cat) => (
                <button key={cat.id}
                  onClick={() => { setSelectedCat(cat); setEditingTagId(null); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedCat?.id === cat.id ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                >
                  <div>
                    <p className={`text-sm font-semibold ${selectedCat?.id === cat.id ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {cat.name}
                    </p>
                    <p className="text-[10px] text-slate-400">{cat._count.tags} tags · {cat._count.assets} εικόνες</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedCat?.id === cat.id && <ChevronRight size={12} className="text-red-500" />}
                    <button onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </button>
              ))}
              {categories.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-400 italic">Δεν υπάρχουν categories.</p>
              )}
            </div>

            {/* Add category */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              {catErr && <p className="text-xs text-red-500">{catErr}</p>}
              <div className="flex gap-2">
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="Νέα category…" className={`${inputCls} flex-1 text-xs py-1`} />
                <button onClick={addCategory} disabled={catBusy || !newCatName.trim()}
                  className={btnBase('bg-slate-700 text-white hover:bg-slate-800')}>
                  {catBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Tags + Keywords ───────────────────────────────────────── */}
        <div className="space-y-3">
          {!selectedCat ? (
            <div className="flex items-center justify-center h-40 text-sm text-slate-400 italic">
              Επίλεξε category αριστερά
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {/* Tag list header */}
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-slate-500" />
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                    Tags — {selectedCat.name}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{selectedCat.tags.length} tags</span>
              </div>

              {/* Tags */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {selectedCat.tags.length === 0 && (
                  <p className="px-5 py-6 text-xs text-slate-400 italic text-center">Δεν υπάρχουν tags. Πρόσθεσε ένα παρακάτω.</p>
                )}

                {selectedCat.tags.map((tag) => (
                  <div key={tag.id} className="px-5 py-4 space-y-3">

                    {/* Tag row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{tag.name}</span>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">{tag.slug}</span>
                        <span className="text-[10px] text-slate-400">{tag._count.assets} εικόνες</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingTagId(editingTagId === tag.id ? null : tag.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors border ${
                            editingTagId === tag.id
                              ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                              : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 hover:border-blue-300'
                          }`}>
                          {editingTagId === tag.id ? 'Κλείσιμο' : `Keywords (${tag.keywords.length})`}
                        </button>
                        <button onClick={() => deleteTag(tag.id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Keyword chips (collapsed preview) */}
                    {editingTagId !== tag.id && tag.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tag.keywords.map((kw) => (
                          <span key={kw.keyword}
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                              kw.isPriority
                                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                            }`}>
                            {kw.isPriority && <Star size={8} />}
                            {kw.keyword}
                            {kw.aliases.length > 0 && (
                              <span className="opacity-60">+{kw.aliases.length}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Keyword editor (expanded) */}
                    {editingTagId === tag.id && (
                      <div className="ml-2 space-y-3 pt-1">

                        {/* Existing keywords */}
                        <div className="space-y-1.5">
                          {tag.keywords.length === 0 && (
                            <p className="text-xs text-slate-400 italic">Δεν υπάρχουν keywords ακόμα.</p>
                          )}
                          {tag.keywords.map((kw) => (
                            <div key={kw.keyword}
                              className="flex items-start gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{kw.keyword}</span>
                                  {kw.aliases.map((a) => (
                                    <span key={a} className="text-[10px] bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => togglePriority(tag.id, kw.keyword)} disabled={kwBusy}
                                  title={kw.isPriority ? 'Priority ενεργό — κάνε κλικ για απενεργοποίηση' : 'Κάνε κλικ για priority'}
                                  className={`p-1 rounded transition-colors ${kw.isPriority ? 'text-amber-500 hover:text-amber-700' : 'text-slate-300 hover:text-amber-400'}`}>
                                  <Star size={12} />
                                </button>
                                <button onClick={() => removeKeyword(tag.id, kw.keyword)} disabled={kwBusy}
                                  className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add keyword form */}
                        <div className="space-y-2 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Προσθήκη keyword</p>
                          <div className="flex gap-2">
                            <input value={newKw} onChange={(e) => setNewKw(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addKeyword(tag.id)}
                              placeholder="keyword (π.χ. πυρκαγια)"
                              className={`${inputCls} flex-1 text-xs py-1`} />
                          </div>
                          <input value={newKwAliases} onChange={(e) => setNewKwAliases(e.target.value)}
                            placeholder="aliases: φωτια, φωτιες, φλογες (κόμμα-separated)"
                            className={`${inputCls} w-full text-xs py-1`} />
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <button onClick={() => setNewKwPriority((v) => !v)}
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                  newKwPriority
                                    ? 'bg-amber-500 border-amber-500 text-white'
                                    : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500'
                                }`}>
                                {newKwPriority && <Check size={10} />}
                              </button>
                              <span className="text-xs text-slate-600 dark:text-slate-300">Priority <span className="text-[10px] text-slate-400">(+25pts)</span></span>
                            </label>
                            <button onClick={() => addKeyword(tag.id)}
                              disabled={kwBusy || !newKw.trim()}
                              className={btnBase('bg-blue-600 text-white hover:bg-blue-500')}>
                              {kwBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                              Προσθήκη
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add tag */}
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                {tagErr && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                    <AlertTriangle size={11} /> {tagErr}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder={`Νέο tag στην κατηγορία ${selectedCat.name}…`}
                    className={`${inputCls} flex-1 text-xs py-1`} />
                  <button onClick={addTag} disabled={tagBusy || !newTagName.trim()}
                    className={btnBase('bg-red-600 text-white hover:bg-red-500')}>
                    {tagBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    Add Tag
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scoring reference */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Πώς χρησιμοποιούνται τα keywords στο matching</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>Category match (εικόνα ίδιας κατηγορίας)</span><span className="font-mono">+40 pts</span>
          <span>Tag slug βρέθηκε στον τίτλο άρθρου</span><span className="font-mono">+30 pts</span>
          <span>Ακριβής φράση στον τίτλο</span><span className="font-mono">+15 pts</span>
          <span>Priority keyword match</span><span className="font-mono">+25 pts</span>
          <span>Regular keyword match</span><span className="font-mono">+10 pts</span>
          <span>Multi-keyword bonus (≥3 matches)</span><span className="font-mono">+20 pts</span>
          <span className="text-amber-600 dark:text-amber-400 col-span-2">★ = Priority keyword — χρησιμοποίησε για τις πιο σημαντικές λέξεις κάθε tag</span>
        </div>
      </div>
    </div>
  );
}
