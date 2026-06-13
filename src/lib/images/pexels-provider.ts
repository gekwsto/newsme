import 'server-only';

export interface PexelsPhoto {
  id: number;
  imageUrl: string;
  thumbnailUrl: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
  width: number;
  height: number;
  alt: string;
}

// ─── In-memory cache (30-minute TTL) ─────────────────────────────────────────

const cache = new Map<string, { photos: PexelsPhoto[]; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

// ─── Category → English search keyword map ───────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string> = {
  'AI':                     'artificial intelligence technology',
  'Τεχνολογία':             'technology digital innovation',
  'Οικονομία':              'economy finance markets',
  'Επιχειρηματικότητα':     'business startup office',
  'Ελλάδα':                 'Greece Mediterranean Athens',
  'Κόσμος':                 'world news global',
  'Viral':                  'social media trending',
  'Απόψεις':                'newspaper editorial media',
};

// ─── Smart query builder ──────────────────────────────────────────────────────

export function buildPexelsQuery(params: {
  categoryName: string;
  tags: string[];
  seoTitle?: string | null;
}): string {
  const { categoryName, tags, seoTitle } = params;

  // 1. Category keyword (English)
  const catKeyword = CATEGORY_KEYWORDS[categoryName] ?? categoryName;
  const catWords = catKeyword.split(' ').slice(0, 2);

  // 2. Take up to 2 tags — prefer short English-looking ones (no Greek chars)
  const isLatin = (s: string) => /^[\x00-\x7F\s]+$/.test(s);
  const usableTags = tags
    .filter((t) => t.length > 2 && t.length < 20)
    .sort((a, b) => (isLatin(a) ? -1 : 1) - (isLatin(b) ? -1 : 1))
    .slice(0, 2);

  // 3. Extract a keyword from seoTitle if it looks English
  let seoWord = '';
  if (seoTitle && isLatin(seoTitle)) {
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'how', 'why', 'what']);
    const words = seoTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !stopwords.has(w));
    seoWord = words[0] ?? '';
  }

  const parts = [...catWords, ...usableTags.slice(0, 1), seoWord].filter(Boolean);

  // Max 4 words, deduped
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
    if (unique.length >= 4) break;
  }

  return unique.join(' ');
}

// ─── Pexels API call ──────────────────────────────────────────────────────────

export async function searchPexelsImages(query: string, perPage = 12): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY environment variable is not set');

  const cacheKey = `${query}::${perPage}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.photos;

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pexels API error ${res.status}: ${body.slice(0, 120)}`);
  }

  const data = await res.json() as PexelsApiResponse;

  const photos: PexelsPhoto[] = (data.photos ?? []).map((p) => ({
    id: p.id,
    imageUrl: p.src.large2x || p.src.original,
    thumbnailUrl: p.src.medium,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pexelsUrl: p.url,
    width: p.width,
    height: p.height,
    alt: p.alt ?? '',
  }));

  cache.set(cacheKey, { photos, expiresAt: Date.now() + CACHE_TTL_MS });
  return photos;
}

// ─── Multi-query fallback search ─────────────────────────────────────────────

export async function searchPexelsWithFallback(
  queries: string[],
  perPage = 12
): Promise<{ photos: PexelsPhoto[]; usedQuery: string }> {
  const valid = queries.map((q) => q.trim()).filter(Boolean);
  if (valid.length === 0) return { photos: [], usedQuery: '' };

  for (const query of valid) {
    try {
      const photos = await searchPexelsImages(query, perPage);
      if (photos.length >= 3) return { photos, usedQuery: query };
    } catch {
      // try next
    }
  }

  const last = valid[valid.length - 1];
  try {
    return { photos: await searchPexelsImages(last, perPage), usedQuery: last };
  } catch {
    return { photos: [], usedQuery: last };
  }
}

// ─── Pexels API types (internal) ──────────────────────────────────────────────

interface PexelsApiResponse {
  photos: RawPhoto[];
  total_results: number;
  page: number;
  per_page: number;
}

interface RawPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}
