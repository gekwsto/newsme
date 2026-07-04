import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export const dynamic = 'force-dynamic';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MAX_URLS = 1000;

function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${SITE_URL}${url}`;
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
      generatedImageUrl: true,
      coverImage: true,
      suggestedImageUrl: true,
      secondaryKeywords: true,
      category: { select: { slug: true, name: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { publishedAt: 'desc' },
    take: MAX_URLS,
  });

  const pubName = xmlEscape(SITE_NAME);

  const entries = articles.map((a) => {
    const pubDate = (a.publishedAt ?? new Date()).toISOString();
    const loc = xmlEscape(`${SITE_URL}/${a.category.slug}/${a.slug}`);

    // Priority: generated → cover → suggested → site OG fallback
    const rawImage = a.generatedImageUrl ?? a.coverImage ?? a.suggestedImageUrl ?? DEFAULT_OG_IMAGE;
    const imageLoc = xmlEscape(absoluteUrl(rawImage));

    const tagNames = a.tags.map((t) => t.tag.name);
    const keywordsRaw = [...tagNames, a.category.name, ...a.secondaryKeywords].filter(Boolean);
    const keywords = xmlEscape([...new Set(keywordsRaw)].join(', '));

    return `  <url>
    <loc>${loc}</loc>

    <image:image>
      <image:loc>${imageLoc}</image:loc>
    </image:image>

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
