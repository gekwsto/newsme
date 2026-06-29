import Parser from 'rss-parser';

export interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: Date | null;
  imageUrl: string | null;
}

type RawItem = {
  mediaDescription?: string;
  'media:content'?: { $?: { url?: string } };
  'media:thumbnail'?: { $?: { url?: string } };
};

const parser = new Parser<Record<string, unknown>, RawItem>({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsMe/1.0 RSS Reader (+https://newsme.gr)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:description', 'mediaDescription'],
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
    ],
  },
});

function extractImageUrl(item: Parser.Item & RawItem): string | null {
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url;
  }
  const mc = item['media:content'];
  if (mc?.$?.url) return mc.$.url;
  const mt = item['media:thumbnail'];
  if (mt?.$?.url) return mt.$.url;
  return null;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(url);

  return feed.items
    .slice(0, 30)
    .map((item) => {
      const raw = item as Parser.Item & RawItem;
      const excerpt =
        (item.contentSnippet?.trim()) ||
        (item.summary?.trim()) ||
        raw.mediaDescription?.trim() ||
        '';

      return {
        title: item.title?.trim() ?? '',
        url: (item.link ?? '').trim(),
        excerpt: excerpt.slice(0, 600),
        publishedAt: item.isoDate
          ? new Date(item.isoDate)
          : item.pubDate
          ? new Date(item.pubDate)
          : null,
        imageUrl: extractImageUrl(raw),
      };
    })
    .filter((item) => item.title.length > 0 && item.url.length > 0);
}
