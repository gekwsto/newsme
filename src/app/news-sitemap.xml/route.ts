import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export const dynamic = 'force-dynamic';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MAX_URLS = 1000;

export async function GET() {
  const since = new Date(Date.now() - FORTY_EIGHT_HOURS_MS);

  const articles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: ArticleType.NEWS,
      publishedAt: { gte: since },
    },
    select: { slug: true, title: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_URLS,
  });

  const pubName = xmlEscape(SITE_NAME);

  const entries = articles.map((a) => {
    const pubDate = (a.publishedAt ?? new Date()).toISOString();
    return `  <url>
    <loc>${xmlEscape(`${SITE_URL}/article/${a.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${pubName}</news:name>
        <news:language>el</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${xmlEscape(a.title)}</news:title>
    </news:news>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
