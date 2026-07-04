import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';
import { xmlEscape, xmlResponse } from '@/lib/xml';
import { resolveArticleImageUrl } from '@/lib/article-mapper';

export const dynamic = 'force-dynamic';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MAX_URLS = 1000;

function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${SITE_URL}${url}`;
}

function buildKeywords(parts: (string | null | undefined)[]): string {
  const flat = parts.flatMap((p) => (p ? [p] : []));
  return [...new Set(flat)].join(', ');
}

export async function GET() {
  const since = new Date(Date.now() - FORTY_EIGHT_HOURS_MS);

  const articles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: ArticleType.NEWS,
      publishedAt: { gte: since },
    },
    select: {
      slug: true,
      title: true,
      publishedAt: true,
      // Same two image fields used by the article page and OG/Twitter/JSON-LD
      generatedImageUrl: true,
      coverImage: true,
      // Semantic keywords
      secondaryKeywords: true,
      evergreenKeyword: true,
      // Category
      category: { select: { id: true, slug: true, name: true } },
      // Tags
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { publishedAt: 'desc' },
    take: MAX_URLS,
  });

  const pubName = xmlEscape(SITE_NAME);

  const entries = articles.map((a) => {
    const pubDate = (a.publishedAt ?? new Date()).toISOString();
    const loc = xmlEscape(`${SITE_URL}/${a.category.slug}/${a.slug}`);

    // resolveArticleImageUrl is the single source of truth used by the article page,
    // OG tags, Twitter Card, and JSON-LD. No image block when article has no image.
    const rawImage = resolveArticleImageUrl(a.generatedImageUrl, a.coverImage);
    const imageBlock = rawImage
      ? `\n    <image:image>\n      <image:loc>${xmlEscape(absoluteUrl(rawImage))}</image:loc>\n    </image:image>`
      : '';

    const tagNames = a.tags.map((t) => t.tag.name);
    const keywords = xmlEscape(
      buildKeywords([...tagNames, a.category.name, ...a.secondaryKeywords, a.evergreenKeyword]),
    );

    return `  <url>
    <loc>${loc}</loc>${imageBlock}

    <news:news>
      <news:publication_date>${pubDate}</news:publication_date>

      <news:title>${xmlEscape(a.title)}</news:title>

      <news:publication>
        <news:name>${pubName}</news:name>
        <news:language>el</news:language>
      </news:publication>

      <news:keywords>${keywords}</news:keywords>
    </news:news>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
>
${entries}
</urlset>`;

  return xmlResponse(xml);
}
