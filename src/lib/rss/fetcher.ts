import Parser from 'rss-parser';

export interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: Date | null;
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AiSxoliasmos/1.0 RSS Reader (+https://aisxoliasmos.com)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [['media:description', 'mediaDescription']],
  },
});

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(url);

  return feed.items
    .slice(0, 30)
    .map((item) => {
      const excerpt =
        (item.contentSnippet?.trim()) ||
        (item.summary?.trim()) ||
        ((item as unknown as Record<string, unknown>)['mediaDescription'] as string | undefined)?.trim() ||
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
      };
    })
    .filter((item) => item.title.length > 0 && item.url.length > 0);
}
