import { SITE_URL } from '@/lib/seo';
import { xmlEscape, xmlResponse } from '@/lib/xml';

const PAGES = [
  `${SITE_URL}`,
  `${SITE_URL}/articles`,
  `${SITE_URL}/about`,
  `${SITE_URL}/contact`,
  `${SITE_URL}/editorial-policy`,
  `${SITE_URL}/ai-policy`,
  `${SITE_URL}/transparency`,
  `${SITE_URL}/privacy-policy`,
  `${SITE_URL}/terms`,
];

export function GET() {
  const entries = PAGES.map(
    (url) => `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
