import { SITE_URL } from '@/lib/seo';
import { xmlEscape, xmlResponse } from '@/lib/xml';

const PAGES = [
  { url: SITE_URL,                               changefreq: 'daily',   priority: '1.0' },
  { url: `${SITE_URL}/articles`,                 changefreq: 'daily',   priority: '0.6' },
  { url: `${SITE_URL}/about`,                    changefreq: 'monthly', priority: '0.5' },
  { url: `${SITE_URL}/contact`,                  changefreq: 'monthly', priority: '0.4' },
  { url: `${SITE_URL}/editorial-policy`,         changefreq: 'yearly',  priority: '0.4' },
  { url: `${SITE_URL}/ai-policy`,                changefreq: 'yearly',  priority: '0.4' },
  { url: `${SITE_URL}/transparency`,             changefreq: 'monthly', priority: '0.4' },
  { url: `${SITE_URL}/privacy-policy`,           changefreq: 'yearly',  priority: '0.3' },
  { url: `${SITE_URL}/terms`,                    changefreq: 'yearly',  priority: '0.3' },
];

export function GET() {
  const entries = PAGES.map(
    (p) => `  <url>\n    <loc>${xmlEscape(p.url)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
