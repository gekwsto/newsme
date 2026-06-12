'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { ImageIcon, Sparkles, Upload, Trash2, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useRssImage, generateAiImage, setManualImage, removeArticleImage } from '@/actions/images';

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

const STATUS_LABELS: Record<string, string> = {
  NONE: 'Χωρίς εικόνα',
  RSS_AVAILABLE: 'RSS εικόνα διαθέσιμη',
  RSS_SELECTED: 'RSS εικόνα επιλεγμένη',
  AI_PENDING: 'Παραγωγή…',
  AI_GENERATED: 'AI εικόνα',
  AI_FAILED: 'Αποτυχία AI',
  MANUAL_UPLOADED: 'Manual εικόνα',
  PENDING: 'Εκκρεμεί',
  GENERATED: 'Παραγμένη',
  FAILED: 'Αποτυχία',
};

const canGenerateAi = (status: string) => ['APPROVED', 'PUBLISHED'].includes(status);

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
  const [manualUrl, setManualUrl] = useState('');
  const [manualAttribution, setManualAttribution] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localImageUrl, setLocalImageUrl] = useState(currentImageUrl);
  const [localStatus, setLocalStatus] = useState(imageStatus);
  const [localCost, setLocalCost] = useState(imageCostEstimate);

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
      setLocalCost(0);
    });

  const handleGenerateAi = () =>
    handle(async () => {
      setLocalStatus('AI_PENDING');
      const res = await generateAiImage(articleId);
      if (!res.ok) { setError(res.error); setLocalStatus('AI_FAILED'); return; }
      setLocalImageUrl(res.url);
      setLocalStatus('AI_GENERATED');
      setLocalCost(res.cost);
    });

  const handleManualSubmit = () =>
    handle(async () => {
      if (!manualUrl.trim()) { setError('Βάλε URL εικόνας'); return; }
      const res = await setManualImage(articleId, manualUrl.trim(), manualAttribution.trim() || undefined);
      if (!res.ok) { setError(res.error); return; }
      setLocalImageUrl(manualUrl.trim());
      setLocalStatus('MANUAL_UPLOADED');
      setLocalCost(0);
      setShowManualForm(false);
      setManualUrl('');
      setManualAttribution('');
    });

  const handleRemove = () =>
    handle(async () => {
      const res = await removeArticleImage(articleId);
      if (!res.ok) { setError(res.error); return; }
      setLocalImageUrl(null);
      setLocalStatus(suggestedImageUrl ? 'RSS_AVAILABLE' : 'NONE');
      setLocalCost(null);
    });

  const inputClass =
    'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';

  const statusBadge = (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: localStatus === 'AI_GENERATED' || localStatus === 'RSS_SELECTED' || localStatus === 'MANUAL_UPLOADED'
          ? '#dcfce7'
          : localStatus === 'AI_FAILED'
          ? '#fee2e2'
          : localStatus === 'AI_PENDING'
          ? '#fef9c3'
          : '#f1f5f9',
        color: localStatus === 'AI_GENERATED' || localStatus === 'RSS_SELECTED' || localStatus === 'MANUAL_UPLOADED'
          ? '#166534'
          : localStatus === 'AI_FAILED'
          ? '#991b1b'
          : localStatus === 'AI_PENDING'
          ? '#854d0e'
          : '#475569',
      }}
    >
      {STATUS_LABELS[localStatus] ?? localStatus}
    </span>
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <ImageIcon size={13} />
          Εικόνα Άρθρου
        </h3>
        {statusBadge}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {localImageUrl && (
        <div className="space-y-2">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
            <Image src={localImageUrl} alt="Article image" fill className="object-cover" unoptimized />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-3">
              {imageSource && (
                <span className="font-medium">
                  {imageSource === 'RSS' ? '📡 RSS' : imageSource === 'AI' ? '✦ AI' : '📎 Manual'}
                  {imageProvider && imageProvider !== 'rss' && imageProvider !== 'manual' && ` (${imageProvider})`}
                </span>
              )}
              {imageAttribution && <span className="truncate max-w-48">© {imageAttribution}</span>}
            </div>
            {localCost != null && localCost > 0 && (
              <span className="font-medium text-emerald-600">${localCost.toFixed(3)}</span>
            )}
          </div>
          {localStatus === 'AI_GENERATED' && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              Οι εικόνες DALL-E λήγουν σε ~1 ώρα. Αποθήκευσε την τοπικά αν τη χρειαστείς αργότερα.
            </div>
          )}
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 size={11} />
            Αφαίρεση εικόνας
          </button>
        </div>
      )}

      {!localImageUrl && (
        <div className="w-full aspect-video rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
          <ImageIcon size={32} className="text-slate-400" />
        </div>
      )}

      <div className="space-y-2 pt-1">
        {suggestedImageUrl && localStatus !== 'RSS_SELECTED' && (
          <div className="space-y-2">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 opacity-80">
              <Image src={suggestedImageUrl} alt="RSS suggested image" fill className="object-cover" unoptimized />
              <div className="absolute inset-0 flex items-end p-2">
                <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded">RSS Preview</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Βεβαιώσου ότι έχεις δικαίωμα χρήσης αυτής της εικόνας από την πηγή RSS.
            </div>
            <button
              onClick={handleUseRss}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Χρήση RSS Εικόνας
            </button>
          </div>
        )}

        {canGenerateAi(articleStatus) && (
          <button
            onClick={handleGenerateAi}
            disabled={isPending || localStatus === 'AI_PENDING'}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            {localStatus === 'AI_PENDING' ? (
              <><Loader2 size={13} className="animate-spin" />Παραγωγή…</>
            ) : (
              <><Sparkles size={13} />Generate Low Cost AI Image (~$0.04)</>
            )}
          </button>
        )}

        {!canGenerateAi(articleStatus) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded px-3 py-2">
            <Info size={11} />
            AI παραγωγή διαθέσιμη μόνο μετά την Έγκριση ή Δημοσίευση
          </div>
        )}

        {!showManualForm ? (
          <button
            onClick={() => setShowManualForm(true)}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            <Upload size={13} />
            Upload Manual Image (URL)
          </button>
        ) : (
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
            <input
              type="text"
              value={manualAttribution}
              onChange={(e) => setManualAttribution(e.target.value)}
              placeholder="Πηγή / Attribution (προαιρετικό)"
              className={inputClass}
            />
            <div className="flex gap-2">
              <button
                onClick={handleManualSubmit}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
              >
                {isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Αποθήκευση
              </button>
              <button
                onClick={() => setShowManualForm(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2"
              >
                Ακύρωση
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
