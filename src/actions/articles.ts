'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ArticleStatus } from '@/generated/prisma/enums';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

export async function approveArticle(articleId: string) {
  const user = await requireAuth();

  await prisma.$transaction([
    prisma.article.update({
      where: { id: articleId },
      data: { status: ArticleStatus.APPROVED },
    }),
    prisma.approval.create({
      data: { articleId, reviewerId: user.id, action: 'APPROVED' },
    }),
  ]);

  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}

export async function rejectArticle(articleId: string, note?: string) {
  const user = await requireAuth();

  await prisma.$transaction([
    prisma.article.update({
      where: { id: articleId },
      data: { status: ArticleStatus.REJECTED },
    }),
    prisma.approval.create({
      data: { articleId, reviewerId: user.id, action: 'REJECTED', note },
    }),
  ]);

  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}

export async function publishArticle(articleId: string) {
  await requireAuth();

  const article = await prisma.article.update({
    where: { id: articleId },
    data: { status: ArticleStatus.PUBLISHED, publishedAt: new Date() },
    select: { slug: true, category: { select: { slug: true } } },
  });

  revalidatePath('/');
  revalidatePath('/articles');
  revalidatePath(`/article/${article.slug}`);
  revalidatePath(`/category/${article.category.slug}`);
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}

export async function updateArticle(
  id: string,
  data: {
    title?: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    coverImage?: string;
    categoryId?: string;
    seoTitle?: string;
    seoDescription?: string;
    status?: ArticleStatus;
    aiCommentary?: string;
  }
) {
  await requireAuth();

  await prisma.article.update({ where: { id }, data });

  revalidatePath(`/admin/articles/${id}/edit`);
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}
