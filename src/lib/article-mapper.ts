import type { Article, Category, Author } from '@/types';

type PrismaCategory = { name: string; slug: string; color: string };
type PrismaUser = { name: string };
type PrismaTag = { tag: { name: string } };

export interface PrismaArticleLike {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  aiCommentary: string | null;
  readTime: number;
  generatedImageUrl: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  category: PrismaCategory;
  author: PrismaUser;
  tags?: PrismaTag[];
}

/**
 * Single source of truth for article featured image resolution.
 * Returns null when no image exists — callers decide how to handle the absence.
 * Priority: generatedImageUrl → coverImage → null
 */
export function resolveArticleImageUrl(
  generatedImageUrl: string | null | undefined,
  coverImage: string | null | undefined,
): string | null {
  return generatedImageUrl ?? coverImage ?? null;
}

export function mapPrismaArticle(a: PrismaArticleLike): Article {
  const category: Category = {
    name: a.category.name,
    slug: a.category.slug,
    color: a.category.color,
  };

  const author: Author = {
    name: a.author.name,
  };

  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt ?? '',
    content: a.content,
    category,
    author,
    publishedAt: (a.publishedAt ?? a.createdAt).toISOString(),
    readTime: a.readTime,
    imageUrl: resolveArticleImageUrl(a.generatedImageUrl, a.coverImage) ?? undefined,
    tags: a.tags?.map((t) => t.tag.name) ?? [],
    aiCommentary: a.aiCommentary ?? undefined,
    views: 0,
    featured: false,
    breaking: false,
  };
}

// Prisma select shape to include in findMany queries
export const ARTICLE_PUBLIC_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  content: true,
  aiCommentary: true,
  readTime: true,
  generatedImageUrl: true,
  coverImage: true,
  publishedAt: true,
  createdAt: true,
  category: { select: { name: true, slug: true, color: true } },
  author: { select: { name: true } },
  tags: { include: { tag: { select: { name: true } } } },
} as const;
