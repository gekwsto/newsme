'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType, SourceType } from '@/generated/prisma/enums';
import { markTrainingPublished, markTrainingRejected, markTrainingEdited } from '@/lib/training-capture';

async function uniqueSlug(base: string): Promise<string> {
  const safe = base.toLowerCase().replace(/[^a-z0-9Ͱ-Ͽἀ-῿]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'article';
  let slug = safe;
  let i = 0;
  while (await prisma.article.findUnique({ where: { slug } })) {
    slug = `${safe}-${++i}`;
  }
  return slug;
}

export type CreateArticleResult = { ok: true; id: string } | { ok: false; error: string };

export async function createArticle(data: {
  title: string;
  categoryId: string;
  articleType: ArticleType;
  excerpt: string;
}): Promise<CreateArticleResult> {
  try {
    const user = await requireAuth();
    const slug = await uniqueSlug(data.title);
    const article = await prisma.article.create({
      data: {
        title: data.title,
        slug,
        excerpt: data.excerpt,
        content: '',
        status: ArticleStatus.DRAFT,
        articleType: data.articleType,
        sourceType: SourceType.MANUAL,
        categoryId: data.categoryId,
        authorId: user.id,
        readTime: 1,
      },
    });
    revalidatePath('/admin/articles');
    return { ok: true, id: article.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα δημιουργίας άρθρου' };
  }
}

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

  void markTrainingRejected(articleId);

  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}

export async function publishArticle(articleId: string) {
  await requireAuth();

  const article = await prisma.article.update({
    where: { id: articleId },
    data: { status: ArticleStatus.PUBLISHED, publishedAt: new Date() },
    select: { slug: true, title: true, content: true, articleType: true, category: { select: { slug: true } } },
  });

  void markTrainingPublished(articleId, article.title, article.content);

  revalidatePath('/');
  revalidatePath('/articles');
  revalidatePath(`/article/${article.slug}`);
  revalidatePath(`/category/${article.category.slug}`);
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');

  revalidatePath('/sitemap.xml');
  if (article.articleType === ArticleType.EVERGREEN) {
    revalidatePath('/sitemap-evergreen.xml');
  } else {
    revalidatePath('/sitemap-articles.xml');
    revalidatePath('/news-sitemap.xml');
  }
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

  if (data.title !== undefined || data.content !== undefined) {
    void markTrainingEdited(id);
  }

  revalidatePath(`/admin/articles/${id}/edit`);
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}
