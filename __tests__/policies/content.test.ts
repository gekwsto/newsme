/**
 * Policy pages content guardrails.
 * Tests operate on source file content and config exports — no DB, no network, no React renderer.
 */

import fs from 'fs';
import path from 'path';
import { BRAND, BRAND_TRANSPARENCY } from '@/config/brand';

const ROOT = path.resolve(__dirname, '../../');

function readPage(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

const transparencySource = readPage('src/app/transparency/page.tsx');
const editorialSource = readPage('src/app/editorial-policy/page.tsx');
const nextConfig = readPage('next.config.ts');
const sitemap = readPage('src/app/sitemap-pages.xml/route.ts');

// ── Brand config ──────────────────────────────────────────────────────────────

describe('BRAND config', () => {
  test('name is NewsMe (not Newsme.gr)', () => {
    expect(BRAND.name).toBe('NewsMe');
  });

  test('correctionsEmail is defined', () => {
    expect(BRAND.correctionsEmail).toBeTruthy();
  });

  test('editorialEmail is defined', () => {
    expect(BRAND.editorialEmail).toBeTruthy();
  });

  test('editorialPolicyUrl points to /editorial-policy', () => {
    expect(BRAND.editorialPolicyUrl).toMatch(/\/editorial-policy$/);
  });

  test('BRAND_TRANSPARENCY has correctionsEmail', () => {
    expect(BRAND_TRANSPARENCY.correctionsEmail).toBeTruthy();
  });
});

// ── Redirect: /ai-policy → /editorial-policy ─────────────────────────────────

describe('next.config.ts redirects', () => {
  test('ai-policy redirect exists', () => {
    expect(nextConfig).toContain('/ai-policy');
    expect(nextConfig).toContain('/editorial-policy');
  });

  test('ai-policy redirect is permanent', () => {
    expect(nextConfig).toMatch(/ai-policy[\s\S]{0,200}permanent:\s*true/);
  });
});

// ── Sitemap ───────────────────────────────────────────────────────────────────

describe('sitemap-pages.xml', () => {
  test('does NOT include /ai-policy', () => {
    expect(sitemap).not.toContain('/ai-policy');
  });

  test('includes /editorial-policy', () => {
    expect(sitemap).toContain('/editorial-policy');
  });

  test('includes /transparency', () => {
    expect(sitemap).toContain('/transparency');
  });
});

// ── Transparency page ─────────────────────────────────────────────────────────

describe('/transparency page source', () => {
  test('does not mention AI tools by name (GPT-4, ChatGPT, Claude)', () => {
    const aiTools = /GPT-4|GPT4|ChatGPT|claude AI|gemini/i;
    expect(transparencySource).not.toMatch(aiTools);
  });

  test('does not use the phrase "Τεχνητή Νοημοσύνη" (AI section)', () => {
    expect(transparencySource).not.toContain('Τεχνητή Νοημοσύνη');
    expect(transparencySource).not.toContain('τεχνητή νοημοσύνη');
  });

  test('does not say "Η ιδιοκτησία είναι ιδιωτική"', () => {
    expect(transparencySource).not.toContain('ιδιοκτησία είναι ιδιωτική');
  });

  test('does not link to /ai-policy', () => {
    expect(transparencySource).not.toContain('/ai-policy');
  });

  test('links to /editorial-policy', () => {
    expect(transparencySource).toContain('/editorial-policy');
  });

  test('links to /contact', () => {
    expect(transparencySource).toContain('/contact');
  });

  test('uses BRAND.correctionsEmail for corrections contact', () => {
    expect(transparencySource).toContain('BRAND.correctionsEmail');
  });

  test('uses BRAND_TRANSPARENCY for identity section', () => {
    expect(transparencySource).toContain('BRAND_TRANSPARENCY');
  });
});

// ── Editorial policy page ─────────────────────────────────────────────────────

describe('/editorial-policy page source', () => {
  test('does not include "Χρήση Τεχνητής Νοημοσύνης" section heading', () => {
    expect(editorialSource).not.toContain('Χρήση Τεχνητής Νοημοσύνης');
  });

  test('does not include AI-generated references', () => {
    expect(editorialSource).not.toContain('AI-generated');
    expect(editorialSource).not.toContain('ai-generated');
  });

  test('does not contain false "δύο ανεξάρτητες πηγές" claim', () => {
    expect(editorialSource).not.toContain('δύο ανεξάρτητες πηγές');
  });

  test('does not link to /ai-policy', () => {
    expect(editorialSource).not.toContain('/ai-policy');
  });

  test('links to /transparency', () => {
    expect(editorialSource).toContain('/transparency');
  });

  test('links to /about', () => {
    expect(editorialSource).toContain('/about');
  });

  test('links to /contact', () => {
    expect(editorialSource).toContain('/contact');
  });

  test('does NOT link to non-existent /corrections-policy', () => {
    expect(editorialSource).not.toContain('/corrections-policy');
  });

  test('uses BRAND.editorialEmail for editorial contact', () => {
    expect(editorialSource).toContain('BRAND.editorialEmail');
  });

  test('uses BRAND.correctionsEmail for corrections contact', () => {
    expect(editorialSource).toContain('BRAND.correctionsEmail');
  });
});
