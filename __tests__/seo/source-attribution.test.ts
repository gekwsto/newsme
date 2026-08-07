/**
 * Tests: source attribution must be absent from public article output.
 *
 * Invariants:
 * - stripSourceAttribution removes the baked-in source block from stored HTML
 * - content-generator no longer injects the block
 * - canonical, og:url, og:site_name, publisher all point to newsme.gr
 * - Internal Prisma fields (sourceUrl, sourceName, etc.) still exist on the schema
 */

import { stripSourceAttribution, stripHtmlToText, articleCanonical, newsArticleJsonLd } from '@/lib/seo';

// ── stripSourceAttribution ──────────────────────────────────────────────────

describe('stripSourceAttribution', () => {
  const source = `
<div class="article-source-attribution">
  <p><strong>Πηγή:</strong> enikos &nbsp;|&nbsp; <a href="https://www.enikos.gr/article/123" target="_blank" rel="noopener noreferrer">Αρχικό άρθρο</a> &nbsp;|&nbsp; 6 Αυγούστου 2026</p>
</div>`.trim();

  test('removes article-source-attribution div from HTML', () => {
    const html = `<p>Κείμενο άρθρου</p>\n${source}`;
    const result = stripSourceAttribution(html);
    expect(result).not.toContain('article-source-attribution');
    expect(result).not.toContain('Πηγή:');
    expect(result).not.toContain('Αρχικό άρθρο');
    expect(result).not.toContain('enikos');
    expect(result).not.toContain('enikos.gr');
    expect(result).toContain('Κείμενο άρθρου');
  });

  test('does not remove date from non-source text', () => {
    const html = `<p>Δημοσιεύτηκε στις 6 Αυγούστου 2026</p>\n${source}`;
    const result = stripSourceAttribution(html);
    expect(result).toContain('Δημοσιεύτηκε στις 6 Αυγούστου 2026');
    expect(result).not.toContain('enikos');
  });

  test('leaves HTML intact when no source block is present', () => {
    const html = '<p>Κανονικό άρθρο χωρίς source block</p>';
    expect(stripSourceAttribution(html)).toBe(html);
  });

  test('removes multiple source blocks if somehow present', () => {
    const html = `<p>Παράγραφος</p>\n${source}\n<p>Άλλη παράγραφος</p>\n${source}`;
    const result = stripSourceAttribution(html);
    expect(result).not.toContain('article-source-attribution');
    expect(result).not.toContain('Πηγή:');
    expect(result).toContain('Παράγραφος');
    expect(result).toContain('Άλλη παράγραφος');
  });

  test('source block is NOT present in plain-text strip of cleaned content', () => {
    const html = `<p>Σώμα άρθρου</p>\n${source}`;
    const cleaned = stripSourceAttribution(html);
    const plainText = stripHtmlToText(cleaned);
    expect(plainText).not.toMatch(/Πηγή:/);
    expect(plainText).not.toMatch(/Αρχικό άρθρο/);
    expect(plainText).not.toMatch(/enikos/i);
  });
});

// ── newsArticleJsonLd: publisher and canonical ──────────────────────────────

describe('newsArticleJsonLd', () => {
  const baseArticle = {
    title: 'Τίτλος τεστ',
    excerpt: 'Περιγραφή',
    slug: 'titlos-test',
    categorySlug: 'politiki',
    publishedAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-08-07T10:00:00.000Z',
    author: 'Γιώργος Παπαδόπουλος',
    category: 'Πολιτική',
    tags: ['ελλάδα', 'πολιτική'],
    articleType: 'NEWS',
  };

  test('publisher ID points to newsme.gr, not an external source', () => {
    const ld = newsArticleJsonLd(baseArticle);
    const publisherId = (ld.publisher as { '@id': string })['@id'];
    expect(publisherId).toContain('newsme.gr');
    expect(publisherId).not.toMatch(/enikos|iefimerida|protothema|skai/i);
  });

  test('@id and mainEntityOfPage point to newsme.gr canonical URL', () => {
    const ld = newsArticleJsonLd(baseArticle);
    expect(ld['@id']).toMatch(/^https:\/\/newsme\.gr\//);
    const mep = ld.mainEntityOfPage as { '@id': string };
    expect(mep['@id']).toMatch(/^https:\/\/newsme\.gr\//);
  });

  test('no isBasedOn, citation, or externalSource fields in schema', () => {
    const ld = newsArticleJsonLd(baseArticle);
    expect(ld).not.toHaveProperty('isBasedOn');
    expect(ld).not.toHaveProperty('citation');
    expect(ld).not.toHaveProperty('externalSource');
    expect(ld).not.toHaveProperty('sourceUrl');
    expect(ld).not.toHaveProperty('sourceName');
  });

  test('articleBody does not contain source attribution text', () => {
    const sourceBlock = '<div class="article-source-attribution"><p><strong>Πηγή:</strong> enikos</p></div>';
    const rawContent = `<p>Κείμενο</p>\n${sourceBlock}`;
    const cleanContent = stripSourceAttribution(rawContent);
    const articleBody = stripHtmlToText(cleanContent, 20_000);

    const ld = newsArticleJsonLd({ ...baseArticle, articleBody });
    const body = ld.articleBody as string;
    expect(body).not.toMatch(/Πηγή:/);
    expect(body).not.toMatch(/enikos/i);
    expect(body).toContain('Κείμενο');
  });
});

// ── articleCanonical: always points to newsme.gr ──────────────────────────

describe('articleCanonical', () => {
  test('canonical URL is on newsme.gr', () => {
    const url = articleCanonical('politiki', 'titlos-test');
    expect(url).toMatch(/^https:\/\/newsme\.gr\//);
    expect(url).toContain('/politiki/titlos-test');
  });

  test('canonical does not contain external source domain', () => {
    const url = articleCanonical('oikonomia', 'test-slug');
    expect(url).not.toMatch(/enikos|iefimerida|protothema|skai/i);
  });
});

// ── Prisma schema: source fields still exist (data minimization, not deletion) ─

describe('Prisma schema source fields', () => {
  test('PrismaArticleLike interface does not expose sourceUrl or sourceName', async () => {
    // The public select (ARTICLE_PUBLIC_SELECT) must not include source provenance fields.
    const { ARTICLE_PUBLIC_SELECT } = await import('@/lib/article-mapper');
    const select = ARTICLE_PUBLIC_SELECT as Record<string, unknown>;
    expect(select).not.toHaveProperty('sourceUrl');
    expect(select).not.toHaveProperty('sourceName');
    expect(select).not.toHaveProperty('originalArticleUrl');
    expect(select).not.toHaveProperty('rssUrl');
    expect(select).not.toHaveProperty('externalId');
  });

  test('Prisma schema file still declares source provenance fields', () => {
    // These fields must still exist in prisma/schema.prisma — we only hide them from public output.
    const fs = require('fs') as typeof import('fs');
    const schema = fs.readFileSync(
      require('path').join(process.cwd(), 'prisma', 'schema.prisma'),
      'utf8',
    );
    expect(schema).toMatch(/sourceUrl/);
    expect(schema).toMatch(/sourceName/);
    expect(schema).toMatch(/originalUrl/);
    expect(schema).toMatch(/rssUrl/);
  });
});
