import { SITE_URL } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType } from '@/generated/prisma/enums';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export const revalidate = 3600;

export async function GET() {
  const articles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      articleType: { not: ArticleType.EVERGREEN },
    },
    select: { slug: true, updatedAt: true, publishedAt: true, category: { select: { slug: true } } },
    orderBy: { publishedAt: 'desc' },
  });

  const now = Date.now();

  const entries = articles.map((a) => {
    const lastMod = a.updatedAt ?? a.publishedAt ?? new Date();
    const ageDays = (now - lastMod.getTime()) / 86_400_000;
    const changefreq = ageDays < 7 ? 'daily' : ageDays < 30 ? 'weekly' : 'monthly';
    const priority = ageDays < 7 ? '0.7' : '0.6';
    return `  <url>
    <loc>${xmlEscape(`${SITE_URL}/${a.category.slug}/${a.slug}`)}</loc>
    <lastmod>${lastMod.toISOString()}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
