/**
 * normalizeArticleForWordPress: the boundary that decides exactly what an
 * external WordPress site is allowed to see. Must never leak source
 * attribution or internal-only fields.
 */

import { normalizeArticleForWordPress, type ArticleForWordPress } from '@/lib/integrations/wordpress/normalize-article';

function baseArticle(overrides: Partial<ArticleForWordPress> = {}): ArticleForWordPress {
  return {
    id: 'article-123',
    title: 'Τίτλος άρθρου',
    slug: 'titlos-arthrou',
    content: '<p>Κείμενο άρθρου</p>',
    excerpt: 'Περίληψη άρθρου',
    seoTitle: null,
    seoDescription: null,
    publishedAt: new Date('2026-08-07T10:00:00.000Z'),
    coverImage: null,
    generatedImageUrl: null,
    imageAttribution: null,
    category: { slug: 'politiki', name: 'Πολιτική' },
    tags: [{ tag: { name: 'Κυβέρνηση' } }, { tag: { name: 'Βουλή' } }],
    ...overrides,
  };
}

describe('normalizeArticleForWordPress', () => {
  test('maps to the full normalized contract shape', () => {
    const result = normalizeArticleForWordPress(baseArticle());
    expect(result).toEqual({
      externalId: 'article-123',
      title: 'Τίτλος άρθρου',
      slug: 'titlos-arthrou',
      content: '<p>Κείμενο άρθρου</p>',
      excerpt: 'Περίληψη άρθρου',
      category: { slug: 'politiki', name: 'Πολιτική' },
      tags: ['Κυβέρνηση', 'Βουλή'],
      featuredImage: null,
      seo: { title: 'Τίτλος άρθρου', description: 'Περίληψη άρθρου' },
      publishedAt: '2026-08-07T10:00:00.000Z',
    });
  });

  test('article without an image → featuredImage is null, no crash', () => {
    const result = normalizeArticleForWordPress(baseArticle({ coverImage: null, generatedImageUrl: null }));
    expect(result.featuredImage).toBeNull();
  });

  test('resolves relative coverImage to an absolute URL', () => {
    const result = normalizeArticleForWordPress(
      baseArticle({ coverImage: '/uploads/articles/2026/08/photo-abc.webp' }),
    );
    expect(result.featuredImage).toEqual({
      url: 'https://newsme.gr/uploads/articles/2026/08/photo-abc.webp',
      alt: 'Τίτλος άρθρου',
      caption: '',
    });
  });

  test('leaves an already-absolute generatedImageUrl untouched', () => {
    const result = normalizeArticleForWordPress(
      baseArticle({ coverImage: null, generatedImageUrl: 'https://images.example.com/photo.jpg' }),
    );
    expect(result.featuredImage?.url).toBe('https://images.example.com/photo.jpg');
  });

  test('coverImage takes priority over generatedImageUrl', () => {
    const result = normalizeArticleForWordPress(
      baseArticle({ coverImage: '/uploads/a.webp', generatedImageUrl: 'https://images.example.com/b.jpg' }),
    );
    expect(result.featuredImage?.url).toBe('https://newsme.gr/uploads/a.webp');
  });

  test('falls back to title/excerpt when seoTitle/seoDescription are missing', () => {
    const result = normalizeArticleForWordPress(baseArticle({ seoTitle: null, seoDescription: null }));
    expect(result.seo).toEqual({ title: 'Τίτλος άρθρου', description: 'Περίληψη άρθρου' });
  });

  test('uses seoTitle/seoDescription when present', () => {
    const result = normalizeArticleForWordPress(
      baseArticle({ seoTitle: 'SEO τίτλος', seoDescription: 'SEO περιγραφή' }),
    );
    expect(result.seo).toEqual({ title: 'SEO τίτλος', description: 'SEO περιγραφή' });
  });

  test('strips a source-attribution block from content if present', () => {
    const dirty =
      '<p>Κείμενο</p>\n<div class="article-source-attribution"><p><strong>Πηγή:</strong> enikos | Αρχικό άρθρο</p></div>';
    const result = normalizeArticleForWordPress(baseArticle({ content: dirty }));
    expect(result.content).not.toContain('Πηγή:');
    expect(result.content).not.toContain('Αρχικό άρθρο');
    expect(result.content).not.toContain('article-source-attribution');
    expect(result.content).toContain('Κείμενο');
  });

  test('never exposes internal-only fields (no id/status/score/source-url keys)', () => {
    const result = normalizeArticleForWordPress(baseArticle());
    const keys = Object.keys(result);
    expect(keys).toEqual(['externalId', 'title', 'slug', 'content', 'excerpt', 'category', 'tags', 'featuredImage', 'seo', 'publishedAt']);
    expect(result).not.toHaveProperty('sourceUrl');
    expect(result).not.toHaveProperty('sourceName');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('compoundScore');
  });

  test('publishedAt is null when the article has no publish date', () => {
    const result = normalizeArticleForWordPress(baseArticle({ publishedAt: null }));
    expect(result.publishedAt).toBeNull();
  });
});
