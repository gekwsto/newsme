'use client';

import { useState } from 'react';
import { Share2, Link2, Check } from 'lucide-react';
import { XIcon, FacebookIcon, LinkedinIcon } from '@/components/ui/SocialIcons';
import { BRAND } from '@/config/brand';

interface ShareButtonsProps {
  title: string;
  slug: string;
  categorySlug: string;
}

export default function ShareButtons({ title, slug, categorySlug }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${BRAND.domain}/${categorySlug}/${slug}`;

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-4">
        <Share2 size={15} />
        Κοινοποίησε το άρθρο
      </p>
      <div className="flex flex-wrap gap-2.5">
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-black dark:bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-85 transition-opacity"
        >
          <XIcon size={13} />
          X
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#1877F2] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-85 transition-opacity"
        >
          <FacebookIcon size={13} />
          Facebook
        </a>
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#0A66C2] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-85 transition-opacity"
        >
          <LinkedinIcon size={13} />
          LinkedIn
        </a>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold px-4 py-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Link2 size={13} />}
          {copied ? 'Αντιγράφηκε!' : 'Αντιγραφή'}
        </button>
      </div>
    </div>
  );
}
