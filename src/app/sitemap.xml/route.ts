import { SITE_URL } from '@/lib/seo';
import { xmlResponse } from '@/lib/xml';

export const revalidate = 3600;

const SITEMAPS = [
  'sitemap-pages.xml',
  'sitemap-categories.xml',
  'sitemap-topics.xml',
  'sitemap-articles.xml',
  'sitemap-evergreen.xml',
];

export function GET() {
  const newsLastmod = new Date().toISOString();

  const staticEntries = SITEMAPS.map(
    (s) => `  <sitemap>\n    <loc>${SITE_URL}/${s}</loc>\n  </sitemap>`,
  );

  const newsEntry = `  <sitemap>\n    <loc>${SITE_URL}/news-sitemap.xml</loc>\n    <lastmod>${newsLastmod}</lastmod>\n  </sitemap>`;

  const entries = [...staticEntries, newsEntry].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return xmlResponse(xml);
}
