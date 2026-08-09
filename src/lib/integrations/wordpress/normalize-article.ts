import { resolveArticleImageUrl } from '@/lib/article-mapper';
import { stripSourceAttribution } from '@/lib/seo';
import { SITE_URL } from '@/lib/seo';
import type { NormalizedArticle } from '@/types/integrations/wordpress';

export interface ArticleForWordPress {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  coverImage: string | null;
  generatedImageUrl: string | null;
  imageAttribution: string | null;
  category: { slug: string; name: string };
  tags: { tag: { name: string } }[];
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Converts an internal Article record into the public, destination-safe
 * shape handed to WordPress. Never includes internal ids/scores/source URLs —
 * only what a reader (and therefore the destination CMS) is allowed to see.
 */
export function normalizeArticleForWordPress(article: ArticleForWordPress): NormalizedArticle {
  const rawImageUrl = resolveArticleImageUrl(article.generatedImageUrl, article.coverImage);

  return {
    externalId: article.id,
    title: article.title,
    slug: article.slug,
    content: stripSourceAttribution(article.content),
    excerpt: article.excerpt ?? '',
    category: {
      slug: article.category.slug,
      name: article.category.name,
    },
    tags: article.tags.map((t) => t.tag.name),
    featuredImage: rawImageUrl
      ? {
          url: toAbsoluteUrl(rawImageUrl),
          alt: article.title,
          caption: article.imageAttribution ?? '',
        }
      : null,
    seo: {
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt ?? '',
    },
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
  };
}
