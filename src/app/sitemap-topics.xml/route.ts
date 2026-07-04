import { SITE_URL } from '@/lib/seo';
import { CLUSTERS } from '@/services/evergreen-clusters';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export function GET() {
  const all = [
    `${SITE_URL}/topics`,
    ...CLUSTERS.map((c) => `${SITE_URL}/topics/${c.slug}`),
  ];

  const entries = all.map(
    (url) => `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
