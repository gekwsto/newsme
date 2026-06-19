import { SITE_URL } from '@/lib/seo';
import { CLUSTERS } from '@/services/evergreen-clusters';
import { xmlEscape, xmlResponse } from '@/lib/xml';

export function GET() {
  const all = [
    { url: `${SITE_URL}/topics` },
    ...CLUSTERS.map((c) => ({ url: `${SITE_URL}/topics/${c.slug}` })),
  ];

  const entries = all.map(
    (p) =>
      `  <url>\n    <loc>${xmlEscape(p.url)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return xmlResponse(xml);
}
