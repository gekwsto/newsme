'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  ImageIcon, Sparkles, Upload, Trash2, Loader2,
  AlertTriangle, CheckCircle2, Info, Search, ExternalLink,
} from 'lucide-react';
import {
  useRssImage, generateAiImage, setManualImage, removeArticleImage,
  searchArticlePexels, selectPexelsImage, searchPexelsByCustomQuery,
} from '@/actions/images';
import type { PexelsPhoto } from '@/lib/images/pexels-provider';

interface ImageManagerProps {
  articleId: string;
  articleStatus: string;
  currentImageUrl: string | null;
  suggestedImageUrl: string | null;
  imageStatus: string;
  imageSource: string | null;
  imageProvider: string | null;
  imageAttribution: string | null;
  imageCostEstimate: number | null;
}

interface PexelsData {
  photos: PexelsPhoto[];
  primaryQuery: string;
  alternativeQueries: string[];
  reason: string;
  usedQuery: string;
}

const STATUS_LABELS: Record<string, string> = {
  NONE: 'Χωρίς εικόνα',
  RSS_AVAILABLE: 'RSS εικόνα διαθέσιμη',
  RSS_SELECTED: 'RSS εικόνα',
  AI_PENDING: 'Παραγωγή…',
  AI_GENERATED: 'AI εικόνα',
  AI_FAILED: 'Αποτυχία AI',
  MANUAL_UPLOADED: 'Επιλεγμένη',
  PENDING: 'Εκκρεμεί',
  GENERATED: 'Παραγμένη',
  FAILED: 'Αποτυχία',
};

const canGenerateAi = (status: string) => ['APPROVED', 'PUBLISHED'].includes(status);

function sourceLabel(src: string | null) {
  if (!src) return null;
  if (src === 'RSS') return '📡 RSS';
  if (src === 'PEXELS') return '📷 Pexels';
  if (src === 'AI') return '✦ AI';
  if (src === 'MANUAL') return '📎 Manual';
  return src;
}

export default function ImageManager({
  articleId,
  articleStatus,
  currentImageUrl,
  suggestedImageUrl,
  imageStatus,
  imageSource,
  imageProvider,
  imageAttribution,
  imageCostEstimate,
}: ImageManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [isSearching, startSearch] = useTransition();
  const [isCustomSearching, startCustomSearch] = useTransition();
  const [isSelecting, startSelect] = useTransition();

  const [manualUrl, setManualUrl] = useState('');
  const [manualAttribution, setManualAttribution] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localImageUrl, setLocalImageUrl] = useState(currentImageUrl);
  const [localStatus, setLocalStatus] = useState(imageStatus);
  const [localSource, setLocalSource] = useState(imageSource);
  const [localAttribution, setLocalAttribution] = useState(imageAttribution);
  const [localCost, setLocalCost] = useState(imageCostEstimate);

  const [pexelsData, setPexelsData] = useState<PexelsData | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [customQuery, setCustomQuery] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handle = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(fn);
  };

  const handleUseRss = () =>
    handle(async () => {
      const res = await useRssImage(articleId);
      if (!res.ok) { setError(res.error); return; }
      setLocalImageUrl(suggestedImageUrl);
      setLocalStatus('RSS_SELECTED');
      setLocalSource('RSS');
      setLocalAttribution(null);
      setLocalCost(0);
      setPexelsData(null);
    });

  const handleGenerateAi = () =>
    handle(async () => {
      setLocalStatus('AI_PENDING');
      const res = await generateAiImage(articleId);
      if (!res.ok) { setError(res.error); setLocalStatus('AI_FAILED'); return; }
      setLocalImageUrl(res.url);
      setLocalStatus('AI_GENERATED');
      setLocalSource('AI');
      setLocalAttribution(null);
      setLocalCost(res.cost);
      setPexelsData(null);
    });

  const handleManualSubmit = () =>
    handle(async () => {
      if (!manualUrl.trim()) { setError('Βάλε URL εικόνας'); return; }
      const res = await setManualImage(articleId, manualUrl.trim(), manualAttribution.trim() || undefined);
      if (!res.ok) { setError(res.error); return; }
      setLocalImageUrl(manualUrl.trim());
      setLocalStatus('MANUAL_UPLOADED');
      setLocalSource('MANUAL');
      setLocalAttribution(manualAttribution.trim() || null);
      setLocalCost(0);
      setShowManualForm(false);
      setManualUrl('');
      setManualAttribution('');
      setPexelsData(null);
    });

  const handleRemove = () =>
    handle(async () => {
      const res = await removeArticleImage(articleId);
      if (!res.ok) { setError(res.error); return; }
      setLocalImageUrl(null);
      setLocalStatus(suggestedImageUrl ? 'RSS_AVAILABLE' : 'NONE');
      setLocalSource(null);
      setLocalAttribution(null);
      setLocalCost(null);
    });

  const handlePexelsSearch = () => {
    setError(null);
    setPexelsData(null);
    setShowCustomInput(false);
    setCustomQuery('');
    startSearch(async () => {
      const res = await searchArticlePexels(articleId);
      if (!res.ok) { setError(res.error); return; }
      setPexelsData({
        photos: res.photos,
        primaryQuery: res.primaryQuery,
        alternativeQueries: res.alternativeQueries,
        reason: res.reason,
        usedQuery: res.usedQuery,
      });
    });
  };

  const handleAlternativeQuery = (query: string) => {
    setError(null);
    startCustomSearch(async () => {
      const res = await searchPexelsByCustomQuery(query);
      if (!res.ok) { setError(res.error); return; }
      setPexelsData((prev) =>
        prev ? { ...prev, photos: res.photos, usedQuery: res.usedQuery } : null
      );
    });
  };

  const handleCustomSearch = () => {
    const q = customQuery.trim();
    if (!q) return;
    setError(null);
    startCustomSearch(async () => {
      const res = await searchPexelsByCustomQuery(q);
      if (!res.ok) { setError(res.error); return; }
      setPexelsData((prev) =>
        prev
          ? { ...prev, photos: res.photos, usedQuery: res.usedQuery }
          : { photos: res.photos, primaryQuery: q, alternativeQueries: [], reason: 'Custom', usedQuery: res.usedQuery }
      );
    });
  };

  const handlePexelsSelect = (photo: PexelsPhoto) => {
    setError(null);
    setSelectingId(photo.id);
    startSelect(async () => {
      const res = await selectPexelsImage(articleId, photo);
      if (!res.ok) { setError(res.error); setSelectingId(null); return; }
      setLocalImageUrl(photo.imageUrl);
      setLocalStatus('MANUAL_UPLOADED');
      setLocalSource('PEXELS');
      setLocalAttribution(`${photo.photographer} via Pexels`);
      setLocalCost(0);
      setPexelsData(null);
      setSelectingId(null);
      setShowCustomInput(false);
      setCustomQuery('');
    });
  };

  const inputClass =
    'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';

  const statusBg =
    ['MANUAL_UPLOADED', 'RSS_SELECTED', 'AI_GENERATED'].includes(localStatus) ? '#dcfce7' :
    localStatus === 'AI_FAILED' ? '#fee2e2' :
    localStatus === 'AI_PENDING' ? '#fef9c3' : '#f1f5f9';

  const statusColor =
    ['MANUAL_UPLOADED', 'RSS_SELECTED', 'AI_GENERATED'].includes(localStatus) ? '#166534' :
    localStatus === 'AI_FAILED' ? '#991b1b' :
    localStatus === 'AI_PENDING' ? '#854d0e' : '#475569';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <ImageIcon size={13} />
          Εικόνα Άρθρου
        </h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: statusBg, color: statusColor }}>
          {STATUS_LABELS[localStatus] ?? localStatus}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Current image preview */}
      {localImageUrl ? (
        <div className="space-y-2">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
            <Image src={localImageUrl} alt="Article image" fill className="object-cover" unoptimized />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-3">
              {localSource && (
                <span className="font-medium">{sourceLabel(localSource)}</span>
              )}
              {localAttribution && (
                <span className="truncate max-w-48 italic">© {localAttribution}</span>
              )}
            </div>
            {localCost != null && localCost === 0 ? (
              <span className="font-medium text-emerald-600">$0.00</span>
            ) : localCost != null && localCost > 0 ? (
              <span className="font-medium text-amber-600">${localCost.toFixed(3)}</span>
            ) : null}
          </div>
          {localStatus === 'AI_GENERATED' && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              DALL-E URLs λήγουν σε ~1 ώρα. Αποθήκευσε τοπικά αν χρειαστεί.
            </div>
          )}
          <button onClick={handleRemove} disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50">
            <Trash2 size={11} /> Αφαίρεση εικόνας
          </button>
        </div>
      ) : (
        <div className="w-full aspect-video rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
          <ImageIcon size={32} className="text-slate-400" />
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">

        {/* RSS image */}
        {suggestedImageUrl && localStatus !== 'RSS_SELECTED' && (
          <div className="space-y-2">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 opacity-80">
              <Image src={suggestedImageUrl} alt="RSS suggested image" fill className="object-cover" unoptimized />
              <div className="absolute inset-0 flex items-end p-2">
                <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded">📡 RSS Preview</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Βεβαιώσου ότι έχεις δικαίωμα χρήσης αυτής της εικόνας από την πηγή.
            </div>
            <button onClick={handleUseRss} disabled={isPending}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Χρήση RSS Εικόνας
            </button>
          </div>
        )}

        {/* ── Pexels section ────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 space-y-3">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                📷 Pexels
                <span className="font-normal text-emerald-600 dark:text-emerald-500 text-[10px]">δωρεάν · νόμιμες</span>
              </p>
            </div>
            <button
              onClick={handlePexelsSearch}
              disabled={isSearching || isPending}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {isSearching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
              {pexelsData ? 'Ανανέωση' : 'Find Images'}
            </button>
          </div>

          {/* Query info panel */}
          {pexelsData && (
            <div className="space-y-2">
              {/* Used query + reason */}
              <div className="bg-emerald-100/60 dark:bg-emerald-900/30 rounded-lg px-2.5 py-2 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Query:</span>
                  <code className="text-[10px] bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono border border-emerald-200 dark:border-emerald-700">
                    &quot;{pexelsData.usedQuery}&quot;
                  </code>
                  {pexelsData.usedQuery !== pexelsData.primaryQuery && (
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 italic">
                      (fallback από &quot;{pexelsData.primaryQuery}&quot;)
                    </span>
                  )}
                </div>
                {pexelsData.reason && (
                  <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500 italic">{pexelsData.reason}</p>
                )}
              </div>

              {/* Alternative queries */}
              {pexelsData.alternativeQueries.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">Εναλλακτικά:</span>
                  {pexelsData.alternativeQueries.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleAlternativeQuery(q)}
                      disabled={isCustomSearching || isSearching}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 transition-colors disabled:opacity-50 font-mono"
                    >
                      {isCustomSearching ? <Loader2 size={8} className="inline animate-spin mr-0.5" /> : null}
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom query input */}
              {!showCustomInput ? (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
                >
                  <Search size={9} />
                  Custom query...
                </button>
              ) : (
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomSearch()}
                    placeholder="π.χ. rocket launch"
                    maxLength={40}
                    className="flex-1 text-[11px] bg-white dark:bg-slate-700 border border-emerald-300 dark:border-emerald-700 rounded px-2 py-1 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleCustomSearch}
                    disabled={isCustomSearching || !customQuery.trim()}
                    className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isCustomSearching ? <Loader2 size={10} className="animate-spin" /> : null}
                    Go
                  </button>
                  <button
                    onClick={() => { setShowCustomInput(false); setCustomQuery(''); }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Photos grid */}
          {pexelsData !== null && (
            pexelsData.photos.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-500 italic text-center py-2">
                Δεν βρέθηκαν εικόνες για &quot;{pexelsData.usedQuery}&quot;.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {pexelsData.photos.map((photo) => (
                  <div key={photo.id}
                    className="relative group rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 aspect-video cursor-pointer">
                    <Image
                      src={photo.thumbnailUrl}
                      alt={photo.alt || photo.photographer}
                      fill
                      className="object-cover transition-opacity group-hover:opacity-75"
                      unoptimized
                    />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 bg-black/50 p-1">
                      <button
                        onClick={() => handlePexelsSelect(photo)}
                        disabled={isSelecting}
                        className="flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded px-2 py-1 transition-colors disabled:opacity-50 w-full justify-center"
                      >
                        {isSelecting && selectingId === photo.id
                          ? <Loader2 size={9} className="animate-spin" />
                          : <CheckCircle2 size={9} />}
                        Select
                      </button>
                      <a
                        href={photo.pexelsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[9px] text-white/80 hover:text-white"
                      >
                        <ExternalLink size={8} />
                        {photo.photographer}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {pexelsData === null && !isSearching && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500/70 text-center italic py-1">
              Πάτα &quot;Find Images&quot; — το AI φτιάχνει αυτόματα το καλύτερο query.
            </p>
          )}

          <p className="text-[10px] text-emerald-600/60 dark:text-emerald-600">
            Pexels License · Δωρεάν εμπορική χρήση · Attribution αυτόματη
          </p>
        </div>

        {/* AI generation */}
        {canGenerateAi(articleStatus) ? (
          <button onClick={handleGenerateAi} disabled={isPending || localStatus === 'AI_PENDING'}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
            {localStatus === 'AI_PENDING'
              ? <><Loader2 size={13} className="animate-spin" />Παραγωγή…</>
              : <><Sparkles size={13} />Generate AI Image (~$0.04)</>}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded px-3 py-2">
            <Info size={11} />
            AI παραγωγή διαθέσιμη μετά την Έγκριση ή Δημοσίευση
          </div>
        )}

        {/* Manual URL */}
        {!showManualForm ? (
          <button onClick={() => setShowManualForm(true)} disabled={isPending}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
            <Upload size={13} /> Manual URL
          </button>
        ) : (
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
            <input type="url" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://..." className={inputClass} />
            <input type="text" value={manualAttribution} onChange={(e) => setManualAttribution(e.target.value)}
              placeholder="Attribution (προαιρετικό)" className={inputClass} />
            <div className="flex gap-2">
              <button onClick={handleManualSubmit} disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                {isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Αποθήκευση
              </button>
              <button onClick={() => setShowManualForm(false)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2">
                Ακύρωση
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
