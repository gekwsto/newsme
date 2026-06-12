'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  submitSocialPost,
  approveSocialPost,
  rejectSocialPost,
  markSocialPostPublished,
  publishSocialPostToFacebook,
} from '@/actions/social-posts';

interface Props {
  postId: string;
  status: string;
  platform: string;
}

export default function SocialPostActions({ postId, status, platform }: Props) {
  const [isSubmitting, startSubmitT] = useTransition();
  const [isApproving, startApproveT] = useTransition();
  const [isRejecting, startRejectT] = useTransition();
  const [isPublishing, startPublishT] = useTransition();
  const [isFbPublishing, startFbPublishT] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const busy = isSubmitting || isApproving || isRejecting || isPublishing || isFbPublishing;

  async function wrap(fn: () => Promise<{ ok: boolean; error?: string }>, label: string) {
    setFeedback(null);
    const r = await fn();
    if (!r.ok) setFeedback({ type: 'err', msg: r.error ?? 'Σφάλμα' });
    else setFeedback({ type: 'ok', msg: label });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Always: Preview + Edit */}
        <Link
          href={`/admin/social-posts/${postId}/preview`}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Preview
        </Link>
        <Link
          href={`/admin/social-posts/${postId}/edit`}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Επεξεργασία
        </Link>

        {/* DRAFT / REJECTED → submit for approval */}
        {(status === 'DRAFT' || status === 'REJECTED') && (
          <button
            disabled={busy}
            onClick={() => startSubmitT(() => wrap(() => submitSocialPost(postId), '↑ Υποβλήθηκε'))}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? '…' : 'Υποβολή'}
          </button>
        )}

        {/* PENDING_APPROVAL → approve / reject */}
        {status === 'PENDING_APPROVAL' && (
          <>
            <button
              disabled={busy}
              onClick={() => startApproveT(() => wrap(() => approveSocialPost(postId), '✓ Εγκρίθηκε'))}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isApproving ? '…' : 'Έγκριση'}
            </button>
            <button
              disabled={busy}
              onClick={() => startRejectT(() => wrap(() => rejectSocialPost(postId), '✗ Απορρίφθηκε'))}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRejecting ? '…' : 'Απόρριψη'}
            </button>
          </>
        )}

        {/* APPROVED + FACEBOOK → publish to Facebook */}
        {status === 'APPROVED' && platform === 'FACEBOOK' && (
          <button
            disabled={busy}
            onClick={() =>
              startFbPublishT(() =>
                wrap(() => publishSocialPostToFacebook(postId), '✓ Δημοσιεύτηκε στο Facebook')
              )
            }
            className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[#1877F2] text-white hover:bg-[#1560cc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isFbPublishing ? '…' : 'Publish to Facebook'}
          </button>
        )}

        {/* APPROVED + other platforms → manual mark published */}
        {status === 'APPROVED' && platform !== 'FACEBOOK' && (
          <button
            disabled={busy}
            onClick={() => startPublishT(() => wrap(() => markSocialPostPublished(postId), '✓ Δημοσιεύτηκε'))}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPublishing ? '…' : 'Μαρκάρισμα ως Δημοσιευμένο'}
          </button>
        )}
      </div>

      {feedback && (
        <p className={`text-[10px] font-medium ${feedback.type === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
