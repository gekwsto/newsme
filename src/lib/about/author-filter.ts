const SYSTEM_NAMES = new Set([
  'admin',
  'newsme',
  'newsme team',
  'editorial team',
  'ai writer',
  'automatic writer',
  'system',
  'newsme editorial team',
  'bot',
  'robot',
]);

export function isSystemName(name: string): boolean {
  return SYSTEM_NAMES.has(name.toLowerCase().trim());
}

export type AboutAuthor = {
  name: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  title: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  _count: { articles: number };
};

/**
 * Filters authors suitable for public display on the About page.
 * Mirrors the DB-level filters (isActive, isDefault) plus in-memory
 * system-name exclusion and count check, then sorts by article count desc.
 */
export function filterAndSortAuthors<T extends AboutAuthor>(authors: T[]): T[] {
  return authors
    .filter((a) => {
      if (!a.isActive) return false;
      if (a.isDefault) return false;
      if (isSystemName(a.name)) return false;
      if (a._count.articles <= 0) return false;
      return true;
    })
    .sort((a, b) => b._count.articles - a._count.articles);
}
