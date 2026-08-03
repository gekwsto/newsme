/**
 * Tests for the About page author filtering and sorting logic.
 * All tests operate on in-memory data — no DB or network involved.
 */

import { filterAndSortAuthors, isSystemName } from '@/lib/about/author-filter';
import type { AboutAuthor } from '@/lib/about/author-filter';

function makeAuthor(overrides: Partial<AboutAuthor> = {}): AboutAuthor {
  return {
    name: 'Γιώργος Κώστας',
    slug: 'giorgos-kostas',
    bio: null,
    avatarUrl: null,
    title: null,
    twitterUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    linkedinUrl: null,
    isActive: true,
    isDefault: false,
    _count: { articles: 5 },
    ...overrides,
  };
}

// ── 1. Visibility ────────────────────────────────────────────────────────────

describe('filterAndSortAuthors — visibility', () => {
  test('author with published articles appears', () => {
    const author = makeAuthor({ _count: { articles: 3 } });
    expect(filterAndSortAuthors([author])).toHaveLength(1);
  });

  test('author with 0 published articles is excluded', () => {
    const author = makeAuthor({ _count: { articles: 0 } });
    expect(filterAndSortAuthors([author])).toHaveLength(0);
  });

  test('inactive author (isActive: false) is excluded', () => {
    const author = makeAuthor({ isActive: false });
    expect(filterAndSortAuthors([author])).toHaveLength(0);
  });

  test('default/organizational author (isDefault: true) is excluded', () => {
    const author = makeAuthor({ isDefault: true });
    expect(filterAndSortAuthors([author])).toHaveLength(0);
  });
});

// ── 2. System name exclusion ─────────────────────────────────────────────────

describe('filterAndSortAuthors — system names', () => {
  const systemNames = [
    'Admin',
    'admin',
    'NewsMe',
    'newsme',
    'NewsMe Team',
    'Editorial Team',
    'AI Writer',
    'Automatic Writer',
    'System',
    'NewsMe Editorial Team',
    'Bot',
    'Robot',
  ];

  systemNames.forEach((name) => {
    test(`"${name}" is excluded as a system/organizational name`, () => {
      const author = makeAuthor({ name });
      expect(filterAndSortAuthors([author])).toHaveLength(0);
    });
  });

  test('real human names are not excluded', () => {
    const author = makeAuthor({ name: 'Αντώνης Παπαδόπουλος' });
    expect(filterAndSortAuthors([author])).toHaveLength(1);
  });

  test('name containing "admin" as substring is NOT excluded (only exact match)', () => {
    const author = makeAuthor({ name: 'Administrator Plus' });
    expect(filterAndSortAuthors([author])).toHaveLength(1);
  });
});

// ── 3. Sorting ───────────────────────────────────────────────────────────────

describe('filterAndSortAuthors — sorting', () => {
  test('authors sorted by published article count descending', () => {
    const a1 = makeAuthor({ slug: 'author-one', _count: { articles: 2 } });
    const a2 = makeAuthor({ slug: 'author-two', _count: { articles: 10 } });
    const a3 = makeAuthor({ slug: 'author-three', _count: { articles: 5 } });

    const result = filterAndSortAuthors([a1, a2, a3]);

    expect(result[0].slug).toBe('author-two');
    expect(result[1].slug).toBe('author-three');
    expect(result[2].slug).toBe('author-one');
  });

  test('excluded authors do not appear in sorted output', () => {
    const real = makeAuthor({ slug: 'real', _count: { articles: 7 } });
    const system = makeAuthor({ name: 'Admin', slug: 'admin', _count: { articles: 100 } });
    const inactive = makeAuthor({ slug: 'inactive', isActive: false, _count: { articles: 50 } });

    const result = filterAndSortAuthors([real, system, inactive]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('real');
  });
});

// ── 4. Published article count ───────────────────────────────────────────────

describe('filterAndSortAuthors — article count contract', () => {
  test('_count.articles reflects what the caller passes (expected: PUBLISHED-only count from DB)', () => {
    // The DB query filters articles by status=PUBLISHED before counting.
    // This test verifies that the filter function uses _count.articles as-is.
    const author = makeAuthor({ _count: { articles: 3 } });
    const [result] = filterAndSortAuthors([author]);
    expect(result._count.articles).toBe(3);
  });

  test('author with _count.articles === 0 is excluded regardless of other fields', () => {
    const author = makeAuthor({ isActive: true, isDefault: false, _count: { articles: 0 } });
    expect(filterAndSortAuthors([author])).toHaveLength(0);
  });
});

// ── 5. Author link and data integrity ────────────────────────────────────────

describe('filterAndSortAuthors — data pass-through', () => {
  test('author slug is preserved for link generation', () => {
    const author = makeAuthor({ slug: 'maria-konstantinou' });
    const [result] = filterAndSortAuthors([author]);
    expect(result.slug).toBe('maria-konstantinou');
  });

  test('optional fields (bio, title, avatar) are passed through unchanged', () => {
    const author = makeAuthor({
      bio: 'Δημοσιογράφος με 5 χρόνια εμπειρία.',
      title: 'Οικονομική Αρθρογράφος',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    const [result] = filterAndSortAuthors([author]);
    expect(result.bio).toBe('Δημοσιογράφος με 5 χρόνια εμπειρία.');
    expect(result.title).toBe('Οικονομική Αρθρογράφος');
    expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  test('null optional fields remain null and do not cause errors', () => {
    const author = makeAuthor({ bio: null, title: null, avatarUrl: null });
    const [result] = filterAndSortAuthors([author]);
    expect(result.bio).toBeNull();
    expect(result.title).toBeNull();
    expect(result.avatarUrl).toBeNull();
  });

  test('social link fields are passed through for JSON-LD generation', () => {
    const author = makeAuthor({
      twitterUrl: 'https://twitter.com/someauthor',
      linkedinUrl: 'https://linkedin.com/in/someauthor',
    });
    const [result] = filterAndSortAuthors([author]);
    expect(result.twitterUrl).toBe('https://twitter.com/someauthor');
    expect(result.linkedinUrl).toBe('https://linkedin.com/in/someauthor');
  });
});

// ── 6. isSystemName helper ───────────────────────────────────────────────────

describe('isSystemName', () => {
  test('returns true for exact system names (case-insensitive)', () => {
    expect(isSystemName('Admin')).toBe(true);
    expect(isSystemName('ADMIN')).toBe(true);
    expect(isSystemName('admin')).toBe(true);
    expect(isSystemName('NewsMe')).toBe(true);
    expect(isSystemName('newsme')).toBe(true);
  });

  test('returns false for real human names', () => {
    expect(isSystemName('Ελένη Παπαδοπούλου')).toBe(false);
    expect(isSystemName('Κώστας')).toBe(false);
  });

  test('returns false for names that contain system words as substrings', () => {
    expect(isSystemName('Ηρακλής Administration')).toBe(false);
  });

  test('trims whitespace before checking', () => {
    expect(isSystemName('  admin  ')).toBe(true);
    expect(isSystemName('  NewsMe  ')).toBe(true);
  });
});
