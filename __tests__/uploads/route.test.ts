/**
 * Tests for the /uploads/[...path] runtime filesystem route handler.
 *
 * All filesystem calls are mocked — no actual files required.
 * The handler is imported after mocks are set up at module level.
 */

import path from 'path';
import { NextRequest } from 'next/server';

// ── Filesystem mock ────────────────────────────────────────────────────────────

const mockLstat    = jest.fn();
const mockReadFile = jest.fn();

jest.mock('fs/promises', () => ({
  lstat:    (...a: unknown[]) => mockLstat(...a),
  readFile: (...a: unknown[]) => mockReadFile(...a),
}));

// ── Import handler (after mocks) ──────────────────────────────────────────────

import { GET, HEAD } from '@/app/uploads/[...path]/route';

// ── Helpers ────────────────────────────────────────────────────────────────────

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

function req(url = 'http://localhost/uploads/articles/test.webp'): NextRequest {
  return new NextRequest(url);
}

function params(segments: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path: segments }) };
}

const WEBP_BYTES  = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const JPEG_BYTES  = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(8).fill(0)]);
const PNG_BYTES   = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(8).fill(0)]);
const GIF_BYTES   = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...Array(6).fill(0)]);

function mockFile(buf: Buffer, mtime = new Date('2026-01-01')) {
  mockLstat.mockResolvedValue({
    isFile:          () => true,
    isSymbolicLink:  () => false,
    size:            buf.length,
    mtime,
    mtimeMs:         mtime.getTime(),
  });
  mockReadFile.mockResolvedValue(buf);
}

function mockMissing() {
  mockLstat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
}

function mockSymlink() {
  mockLstat.mockResolvedValue({
    isFile:          () => false,
    isSymbolicLink:  () => true,
    size:            0,
    mtime:           new Date(),
    mtimeMs:         0,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1. Existing WebP → 200 ────────────────────────────────────────────────────

test('1. existing WebP returns 200 with image/webp', async () => {
  mockFile(WEBP_BYTES);
  const res = await GET(req(), params(['articles', 'test.webp']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/webp');
});

// ── 2. JPEG → correct MIME ────────────────────────────────────────────────────

test('2. JPEG returns image/jpeg', async () => {
  mockFile(JPEG_BYTES);
  const res = await GET(req(), params(['articles', 'photo.jpg']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
});

test('2b. .jpeg extension returns image/jpeg', async () => {
  mockFile(JPEG_BYTES);
  const res = await GET(req(), params(['articles', 'photo.jpeg']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
});

// ── 3. PNG → correct MIME ─────────────────────────────────────────────────────

test('3. PNG returns image/png', async () => {
  mockFile(PNG_BYTES);
  const res = await GET(req(), params(['images', 'cover.png']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/png');
});

// ── 4. GIF → correct MIME ─────────────────────────────────────────────────────

test('4. GIF returns image/gif', async () => {
  mockFile(GIF_BYTES);
  const res = await GET(req(), params(['articles', 'anim.gif']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/gif');
});

// ── 5. HEAD → 200 and no body ─────────────────────────────────────────────────

test('5. HEAD returns 200 with headers and no body', async () => {
  mockFile(WEBP_BYTES);
  const res = await HEAD(req(), params(['articles', 'test.webp']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/webp');
  expect(res.headers.get('content-length')).toBe(String(WEBP_BYTES.length));
  // body is null for HEAD
  expect(res.body).toBeNull();
  // readFile must NOT be called for HEAD
  expect(mockReadFile).not.toHaveBeenCalled();
});

// ── 6. Missing file → 404 ─────────────────────────────────────────────────────

test('6. missing file returns 404', async () => {
  mockMissing();
  const res = await GET(req(), params(['articles', 'ghost.webp']));
  expect(res.status).toBe(404);
});

// ── 7. ../ traversal → blocked ────────────────────────────────────────────────

test('7. ../ traversal segment is blocked before lstat', async () => {
  const res = await GET(req(), params(['..', 'etc', 'passwd']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

test('7b. .. in the middle of path is blocked', async () => {
  const res = await GET(req(), params(['articles', '..', '.env']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

// ── 8. URL-encoded traversal → blocked ───────────────────────────────────────

test('8. URL-encoded %2F..%2F is decoded by Next.js — segments check blocks it', async () => {
  // Next.js decodes %2F → / before routing, so segment would be empty or split.
  // If it somehow passes as '..', segment validation blocks it.
  const res = await GET(req(), params(['..%2Fetc%2Fpasswd']));
  // %2F in a segment that arrives decoded contains '.' — blocked by non-extension check.
  // Or if not decoded, the segment still contains unsafe chars → 404 either way.
  expect(res.status).toBe(404);
});

// ── 9. Double-encoded traversal → blocked ────────────────────────────────────

test('9. double-encoded %252F traversal is blocked via boundary check', async () => {
  // Even if a crafted segment passes the per-segment check, path.resolve + boundary
  // catches any path escaping the uploads root.
  const evilSegment = '%252e%252e%252fetc%252fpasswd';
  const res = await GET(req(), params([evilSegment]));
  // This file doesn't exist, but boundary check or lstat miss returns 404.
  // If the segment looks like a filename, extension check will block it (no image ext).
  expect(res.status).toBe(404);
});

// ── 10. Symlink to file outside uploads → blocked ─────────────────────────────

test('10. symlink is rejected regardless of target', async () => {
  mockSymlink();
  const res = await GET(req(), params(['articles', 'symlink.webp']));
  expect(res.status).toBe(404);
  // readFile must NOT be called after symlink detection
  expect(mockReadFile).not.toHaveBeenCalled();
});

// ── 11. Unsupported extension → blocked ──────────────────────────────────────

test('11. .html extension is blocked before lstat', async () => {
  const res = await GET(req(), params(['articles', 'page.html']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

test('11b. .js is blocked', async () => {
  const res = await GET(req(), params(['articles', 'script.js']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

test('11c. .env is blocked', async () => {
  const res = await GET(req(), params(['.env']));
  // .env has no extension (or ext is ''), blocked by allowlist
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

test('11d. no extension is blocked', async () => {
  const res = await GET(req(), params(['articles', 'noextension']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

// ── 12. Content-Length is correct ─────────────────────────────────────────────

test('12. Content-Length matches file size', async () => {
  const buf = Buffer.alloc(86_000, 0x42);
  mockFile(buf);
  const res = await GET(req(), params(['articles', '221d2dd3326a4bf60bf1f7f5.webp']));
  expect(res.headers.get('content-length')).toBe('86000');
});

// ── 13. Cache-Control is immutable ────────────────────────────────────────────

test('13. Cache-Control is public immutable for article images', async () => {
  mockFile(WEBP_BYTES);
  const res = await GET(req(), params(['articles', '221d2dd3326a4bf60bf1f7f5.webp']));
  expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
});

test('13b. Cache-Control is also immutable for image library assets', async () => {
  mockFile(WEBP_BYTES);
  const res = await GET(req(), params(['images', 'viral', 'cover.webp']));
  expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
});

// ── 14. Runtime-created file is served without rebuild ───────────────────────

test('14. file created after module load is served on next request', async () => {
  // Simulate a file that did not exist at build time but exists now at runtime.
  // On first request: missing.
  mockMissing();
  const firstRes = await GET(req(), params(['articles', 'new-at-runtime.webp']));
  expect(firstRes.status).toBe(404);

  // Now the file "appears" (runtime download).
  mockFile(WEBP_BYTES);
  const secondRes = await GET(req(), params(['articles', 'new-at-runtime.webp']));
  expect(secondRes.status).toBe(200);
  expect(mockLstat).toHaveBeenCalledTimes(2); // both requests hit the filesystem
});

// ── 15. /uploads/images/... (Image Library) works ────────────────────────────

test('15. Image Library asset under /uploads/images/ is served correctly', async () => {
  const imageData = Buffer.alloc(12_000, 0xab);
  mockFile(imageData);
  const res = await GET(req(), params(['images', 'viral', 'cover.webp']));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/webp');
  expect(res.headers.get('content-length')).toBe('12000');
  // Verify lstat was called with a path inside public/uploads/images/
  const lstatPath = mockLstat.mock.calls[0][0] as string;
  expect(lstatPath).toContain(path.join('public', 'uploads', 'images', 'viral', 'cover.webp'));
});

// ── 16. /uploads/articles/... article asset works ─────────────────────────────

test('16. article asset path resolves correctly inside uploads root', async () => {
  mockFile(WEBP_BYTES);
  await GET(req(), params(['articles', '2026', '08', '221d2dd3326a4bf60bf1f7f5.webp']));
  const lstatPath = mockLstat.mock.calls[0][0] as string;
  const expectedPath = path.join(
    UPLOADS_ROOT, 'articles', '2026', '08', '221d2dd3326a4bf60bf1f7f5.webp'
  );
  expect(lstatPath).toBe(expectedPath);
});

// ── 17. Middleware does not block /uploads/* ──────────────────────────────────

test('17. middleware matcher in source only covers /admin/:path* — uploads are public', () => {
  // Read the middleware source as text to avoid importing next-auth (ESM).
  // Verify that the matcher config does NOT include /uploads/ paths.
  const fs = require('fs') as typeof import('fs');
  const middlewareSrc = fs.readFileSync(
    require('path').join(process.cwd(), 'middleware.ts'),
    'utf8',
  );
  // Must contain /admin/:path*
  expect(middlewareSrc).toContain("'/admin/:path*'");
  // Must NOT contain /uploads or catch-all matchers that would intercept uploads
  expect(middlewareSrc).not.toMatch(/['"]\/uploads/);
  expect(middlewareSrc).not.toContain("'/:path*'");
  expect(middlewareSrc).not.toContain("'/(.*)'");
});

// ── Additional: ETag and Last-Modified headers ─────────────────────────────────

test('ETag and Last-Modified are present in response', async () => {
  const mtime = new Date('2026-08-01T12:00:00Z');
  mockFile(WEBP_BYTES, mtime);
  const res = await GET(req(), params(['articles', 'test.webp']));
  expect(res.headers.get('etag')).toMatch(/^"[\d]+-[\d]+"$/);
  expect(res.headers.get('last-modified')).toBe(mtime.toUTCString());
});

// ── Additional: null byte is blocked ──────────────────────────────────────────

test('null byte in segment is blocked', async () => {
  const res = await GET(req(), params(['articles\0evil', 'test.webp']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

// ── Additional: backslash in segment is blocked ───────────────────────────────

test('backslash in segment is blocked', async () => {
  const res = await GET(req(), params(['articles\\..\\..\\etc', 'passwd']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});

// ── Additional: empty segments are blocked ────────────────────────────────────

test('empty segment is blocked', async () => {
  const res = await GET(req(), params(['articles', '', 'test.webp']));
  expect(res.status).toBe(404);
  expect(mockLstat).not.toHaveBeenCalled();
});
