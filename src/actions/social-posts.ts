'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SocialPostStatus } from '@/generated/prisma/enums';
import { publishToFacebook } from '@/lib/facebook/publisher';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Δεν είσαι συνδεδεμένος');
  return session.user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') throw new Error('Απαιτούνται δικαιώματα admin');
  return user;
}

function invalidate() {
  revalidatePath('/admin/social-posts');
  revalidatePath('/admin');
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// ─── Update content / status / scheduledAt ────────────────────────────────────

export async function updateSocialPost(
  id: string,
  data: { content: string; status: string; scheduledAt: string | null }
): Promise<ActionResult> {
  try {
    await requireAuth();

    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;

    await prisma.socialPost.update({
      where: { id },
      data: {
        content: data.content.trim(),
        status: data.status as SocialPostStatus,
        scheduledAt,
      },
    });

    revalidatePath(`/admin/social-posts/${id}/edit`);
    revalidatePath(`/admin/social-posts/${id}/preview`);
    invalidate();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Submit for approval (DRAFT / REJECTED → PENDING_APPROVAL) ───────────────

export async function submitSocialPost(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.socialPost.update({
      where: { id },
      data: { status: SocialPostStatus.PENDING_APPROVAL },
    });
    invalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Approve (PENDING_APPROVAL → APPROVED) ───────────────────────────────────

export async function approveSocialPost(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.socialPost.update({
      where: { id },
      data: { status: SocialPostStatus.APPROVED },
    });
    invalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Reject (PENDING_APPROVAL → REJECTED) ────────────────────────────────────

export async function rejectSocialPost(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.socialPost.update({
      where: { id },
      data: { status: SocialPostStatus.REJECTED },
    });
    invalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Mark as Published (APPROVED → PUBLISHED) ────────────────────────────────

export async function markSocialPostPublished(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    invalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// ─── Publish to Facebook via Graph API (APPROVED → PUBLISHED) ─────────────────

export async function publishSocialPostToFacebook(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    const post = await prisma.socialPost.findUnique({
      where: { id },
      include: {
        article: { select: { slug: true } },
      },
    });

    if (!post) return { ok: false, error: 'Post δεν βρέθηκε' };

    if (post.status !== SocialPostStatus.APPROVED) {
      return { ok: false, error: 'Μόνο εγκεκριμένα posts μπορούν να δημοσιευτούν' };
    }

    const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');
    const link = siteUrl ? `${siteUrl}/articles/${post.article.slug}` : undefined;

    let externalPostId: string | undefined;

    try {
      const result = await publishToFacebook({ message: post.content, link });
      externalPostId = result.id;
    } catch (apiErr) {
      const errorMessage = apiErr instanceof Error ? apiErr.message : 'Άγνωστο σφάλμα Facebook API';
      await prisma.socialPost.update({
        where: { id },
        data: { status: SocialPostStatus.FAILED, errorMessage },
      });
      invalidate();
      revalidatePath(`/admin/social-posts/${id}/preview`);
      return { ok: false, error: errorMessage };
    }

    await prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        publishedAt: new Date(),
        externalPostId,
        errorMessage: null,
      },
    });

    invalidate();
    revalidatePath(`/admin/social-posts/${id}/preview`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}
