import { SITE_URL } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { xmlEscape, xmlResponse } from '@/lib/xml';
import { DISPLAY_CATEGORIES } from '@/config/categories';

export const revalidate = 3600;

export async function GET() {
  const displaySlugs = DISPLAY_CATEGORIES.map((c) => c.slug);
  const categories = await prisma.category.findMany({
    where: { slug: { in: displaySlugs } },
    select: { slug: true },
    orderBy: { name: 'asc' },
  });

  const entries = categories.map(
    (c) =>
      `  <url>\n    <loc>${xmlEscape(`${SITE_URL}/category/${c.slug}`)}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
