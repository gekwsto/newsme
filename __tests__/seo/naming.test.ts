/**
 * SEO naming consistency tests.
 * All Google/crawler-facing outputs must use 'newsme.gr', not 'NewsMe', 'Newsme.gr', etc.
 */

import { BRAND } from '@/config/brand';
import {
  SITE_NAME,
  organizationJsonLd,
  websiteJsonLd,
  newsArticleJsonLd,
} from '@/lib/seo';
import fs from 'fs';
import path from 'path';

const SEO_NAME = 'newsme.gr';

// ── BRAND config ──────────────────────────────────────────────────────────────

test('BRAND has seoName field', () => {
  expect(BRAND.seoName).toBeDefined();
});

test('BRAND.seoName is newsme.gr', () => {
  expect(BRAND.seoName).toBe(SEO_NAME);
});

test('BRAND.name remains NewsMe (visual display name)', () => {
  expect(BRAND.name).toBe('NewsMe');
});

// ── seo.ts exports ────────────────────────────────────────────────────────────

test('SITE_NAME export equals newsme.gr', () => {
  expect(SITE_NAME).toBe(SEO_NAME);
});

test('organizationJsonLd name is newsme.gr', () => {
  const ld = organizationJsonLd();
  expect(ld.name).toBe(SEO_NAME);
});

test('websiteJsonLd name is newsme.gr', () => {
  const ld = websiteJsonLd();
  expect(ld.name).toBe(SEO_NAME);
});

test('newsArticleJsonLd publisher uses organization @id (not inline name)', () => {
  const ld = newsArticleJsonLd({
    title: 'Test',
    excerpt: 'Test excerpt',
    slug: 'test',
    categorySlug: 'tech',
    publishedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    author: 'Author Name',
    category: 'Tech',
    tags: [],
  });
  // Publisher must be a reference to the org @id, not an inline name
  expect(ld.publisher).toEqual({ '@id': `${BRAND.domain}/#organization` });
});

// ── Google News Sitemap ───────────────────────────────────────────────────────

test('news-sitemap route file uses SITE_NAME not hardcoded string', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/news-sitemap.xml/route.ts'),
    'utf8',
  );
  // Must not contain any hardcoded variant
  expect(src).not.toMatch(/xmlEscape\(\s*['"]Newsme\.gr['"]/);
  expect(src).not.toMatch(/xmlEscape\(\s*['"]NewsMe\.gr['"]/);
  // Must use the SITE_NAME constant
  expect(src).toMatch(/xmlEscape\(SITE_NAME\)/);
});

// ── Open Graph siteName ───────────────────────────────────────────────────────

test('layout.tsx og:siteName uses BRAND.seoName', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/layout.tsx'),
    'utf8',
  );
  expect(src).toMatch(/siteName:\s*BRAND\.seoName/);
  expect(src).not.toMatch(/siteName:\s*BRAND\.name/);
});

test('homepage page.tsx og:siteName uses BRAND.seoName', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/page.tsx'),
    'utf8',
  );
  expect(src).toMatch(/siteName:\s*BRAND\.seoName/);
});

// ── Service Worker ────────────────────────────────────────────────────────────

test('sw.js uses lowercase newsme.gr not Newsme.gr', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'public/sw.js'),
    'utf8',
  );
  expect(src).not.toMatch(/Newsme\.gr/);
  // Should have correct casing somewhere (at least one occurrence)
  expect(src).toMatch(/newsme\.gr/);
});

// ── Page title template ───────────────────────────────────────────────────────

test('layout.tsx title template suffix uses BRAND.seoName', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/layout.tsx'),
    'utf8',
  );
  expect(src).toMatch(/template:.*BRAND\.seoName/);
});
