import { SITE_URL } from '@/lib/seo';
import { prisma } from '@/lib/db';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export const revalidate = 3600;

export async function GET() {
  const categories = await prisma.category.findMany({
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
