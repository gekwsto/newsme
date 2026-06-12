'use client';

import { useState, useTransition } from 'react';
import { publishSocialPostToFacebook } from '@/actions/social-posts';

interface Props {
  postId: string;
}

export default function PublishToFacebookButton({ postId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await publishSocialPostToFacebook(postId);
      if (r.ok) {
        setResult({ ok: true, msg: '✓ Δημοσιεύτηκε στο Facebook' });
      } else {
        setResult({ ok: false, msg: r.error ?? 'Άγνωστο σφάλμα' });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1560cc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Δημοσίευση…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
            </svg>
            Publish to Facebook
          </>
        )}
      </button>

      {result && (
        <p className={`text-xs font-medium ${result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
}
