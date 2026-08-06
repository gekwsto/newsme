/**
 * Tests for src/lib/images/download-and-store.ts
 *
 * All network, filesystem, sharp, DB, and DNS calls are mocked.
 * No live connections, no files written to disk.
 */

import path from 'path';
import crypto from 'crypto';

// ── Module mocks (must be before any import that uses them) ───────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    article: {
      findFirst: jest.fn(),
    },
  },
}));

const mockSharpInstance = {
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(),
  metadata: jest.fn(),
};
const mockSharp = jest.fn().mockReturnValue(mockSharpInstance);
jest.mock('sharp', () => mockSharp);

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockRename = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);
const mockLstat = jest.fn();

jest.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  lstat: (...args: unknown[]) => mockLstat(...args),
}));

// DNS mock — by default resolves to a public IP; individual tests override as needed.
const mockDnsLookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
jest.mock('dns', () => ({
  promises: {
    lookup: (...args: unknown[]) => mockDnsLookup(...args),
  },
}));

// ── Import under test (after mocks) ───────────────────────────────────────────

import { downloadAndStoreImage } from '@/lib/images/download-and-store';
import { prisma } from '@/lib/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid JPEG bytes */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
/** Minimal valid PNG bytes */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
/** Minimal valid WebP bytes */
const WEBP_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
/** Minimal valid GIF bytes */
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
/** HTML content */
const HTML_BODY = Buffer.from('<!DOCTYPE html><html><body>Not an image</body></html>');
/** Large buffer over 10 MB */
const LARGE_BUFFER = Buffer.alloc(11 * 1024 * 1024);

function mockOkResponse(buf: Buffer, contentType = 'image/jpeg') {
  const chunks: Buffer[] = [buf];
  let index = 0;
  const reader = {
    read: jest.fn().mockImplementation(() => {
      if (index < chunks.length) {
        return Promise.resolve({ done: false, value: new Uint8Array(chunks[index++]) });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: jest.fn().mockReturnValue(contentType) },
    body: { getReader: () => reader },
  });
}

function mockRedirect(to: string, status = 301) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    headers: { get: jest.fn().mockReturnValue(to) },
    body: null,
  });
}

function mockErrorResponse(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    headers: { get: jest.fn().mockReturnValue(null) },
    body: null,
  });
}

function mockSharpSuccess(width = 800, height = 600, outBuf = Buffer.from('fake-webp')) {
  mockSharpInstance.metadata.mockResolvedValue({ width, height });
  mockSharpInstance.toBuffer.mockResolvedValue(outBuf);
}

function resetSharp() {
  mockSharp.mockClear();
  mockSharpInstance.rotate.mockClear().mockReturnThis();
  mockSharpInstance.resize.mockClear().mockReturnThis();
  mockSharpInstance.webp.mockClear().mockReturnThis();
  mockSharpInstance.toBuffer.mockClear();
  mockSharpInstance.metadata.mockClear();
}

// lstat mock: by default reports "ENOENT" (file not found, so no dedup hit)
function mockLstatNotFound() {
  mockLstat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
}

function mockLstatFile(size = 1000) {
  mockLstat.mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size,
  });
}

const BASE_PARAMS = {
  sourceUrl: 'https://example.com/photo.jpg',
  articleSlug: 'test-article',
  articleId: 'cltest00001',
  sourceName: 'TEST',
};

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.article.findFirst as jest.Mock).mockResolvedValue(null); // no dedup hit by default
  mockDnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mockLstatNotFound(); // default: no existing files
  resetSharp();
  mockSharpSuccess();
});

// 1. Successful JPEG download
test('1. downloads JPEG, converts to WebP, writes file atomically', async () => {
  const outBuf = Buffer.from('processed-webp-bytes');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(1200, 800, outBuf);

  const result = await downloadAndStoreImage(BASE_PARAMS);

  expect(result.success).toBe(true);
  expect(result.mimeType).toBe('image/webp');
  expect(result.publicUrl).toMatch(/^\/uploads\/articles\/\d{4}\/\d{2}\/[a-f0-9]{24}\.webp$/);
  expect(result.width).toBe(1200);
  expect(result.height).toBe(800);
  expect(result.fileSize).toBe(outBuf.length);
  expect(result.checksum).toHaveLength(64); // SHA-256 hex

  // Atomic write: writeFile(.tmp) then rename
  expect(mockWriteFile).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), outBuf);
  expect(mockRename).toHaveBeenCalledWith(
    expect.stringMatching(/\.tmp$/),
    expect.not.stringMatching(/\.tmp$/),
  );
});

// 2. Successful PNG download
test('2. downloads PNG and converts to WebP', async () => {
  mockOkResponse(PNG_MAGIC, 'image/png');
  mockSharpSuccess(640, 480, Buffer.from('png-converted-webp'));

  const result = await downloadAndStoreImage(BASE_PARAMS);

  expect(result.success).toBe(true);
  expect(result.mimeType).toBe('image/webp');
  expect(result.publicUrl).toMatch(/\.webp$/);
});

// 3. WebP download
test('3. downloads WebP and keeps as WebP', async () => {
  mockOkResponse(WEBP_MAGIC, 'image/webp');
  mockSharpSuccess(800, 600, Buffer.from('reprocessed-webp'));

  const result = await downloadAndStoreImage({ ...BASE_PARAMS, sourceUrl: 'https://example.com/img.webp' });

  expect(result.success).toBe(true);
  expect(result.mimeType).toBe('image/webp');
});

// 4. Redirect handling
test('4. follows up to 3 redirects', async () => {
  const outBuf = Buffer.from('webp-out');
  mockRedirect('https://cdn.example.com/photo.jpg', 301);
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(400, 300, outBuf);

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

// 5. Timeout
test('5. returns error on timeout', async () => {
  mockFetch.mockImplementationOnce(() =>
    new Promise((_, reject) => {
      const err = new Error('The operation was aborted');
      (err as NodeJS.ErrnoException).name = 'AbortError';
      setTimeout(() => reject(err), 0);
    }),
  );

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/timeout/i);
});

// 6. HTTP 404
test('6. returns error on HTTP 404', async () => {
  mockErrorResponse(404);

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toBe('HTTP 404');
});

// 7. HTML response instead of image
test('7. rejects HTML response masquerading as image', async () => {
  mockOkResponse(HTML_BODY, 'text/html');

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/HTML/i);
});

// 8. Wrong Content-Type
test('8. rejects text/plain content-type early', async () => {
  mockOkResponse(JPEG_MAGIC, 'text/plain');

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/content-type/i);
});

// 9. File over size limit
test('9. rejects file over 10 MB', async () => {
  const reader = {
    read: jest.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(LARGE_BUFFER) })
      .mockResolvedValue({ done: true, value: undefined }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: jest.fn().mockReturnValue('image/jpeg') },
    body: { getReader: () => reader },
  });

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/too large/i);
  expect(reader.cancel).toHaveBeenCalled();
});

// 10. Corrupt image (invalid magic bytes)
test('10. rejects corrupted or unsupported image format', async () => {
  const corruptBuf = Buffer.alloc(20, 0x00);
  mockOkResponse(corruptBuf, 'image/jpeg');

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/unsupported|unrecognized/i);
});

// 11. SSRF — localhost (blocked by hostname blocklist, no DNS call)
test('11. blocks SSRF to localhost (no DNS call)', async () => {
  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'http://localhost/secret',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF|Blocked/i);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockDnsLookup).not.toHaveBeenCalled();
});

// 12. SSRF — literal private IP (blocked by sync check, no DNS call)
test('12. blocks SSRF to literal 192.168.x.x without DNS', async () => {
  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'http://192.168.1.1/image.jpg',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF/i);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockDnsLookup).not.toHaveBeenCalled();
});

// 13. Deduplication — stored checksum match, no file write
test('13. deduplicates by stored checksum, sharp IS called but no file is written', async () => {
  const outBuf = Buffer.from('processed-webp-content');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(800, 600, outBuf);

  const existingPath = path.join(process.cwd(), 'public', 'uploads', 'articles', '2025', '01', 'existing.webp');
  (prisma.article.findFirst as jest.Mock).mockResolvedValueOnce({ localImagePath: existingPath });
  // Integrity check for the dedup hit: valid file
  mockLstat.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 1234 });

  const result = await downloadAndStoreImage(BASE_PARAMS);

  expect(result.success).toBe(true);
  expect(result.deduplicated).toBe(true);
  expect(result.publicUrl).toContain('/uploads/articles/');
  // Sharp IS called to compute stored checksum before dedup check
  expect(mockSharp).toHaveBeenCalled();
  // But no file is written
  expect(mockWriteFile).not.toHaveBeenCalled();
});

// 14. Checksum-based filename
test('14. filename is deterministic hex checksum, not article slug', async () => {
  const outBuf = Buffer.from('output-webp');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(800, 600, outBuf);

  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    articleSlug: 'νέα-φορολογία-2026', // Greek slug — irrelevant to filename
  });

  expect(result.success).toBe(true);
  const filename = result.publicUrl!.split('/').pop()!;
  // Filename must be 24 hex chars + extension (no slug)
  expect(filename).toMatch(/^[a-f0-9]{24}\.webp$/);
});

// 15. Atomic file write — tmp cleaned up on failure
test('15. cleans up .tmp file on write failure', async () => {
  const outBuf = Buffer.from('webp-out');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(800, 600, outBuf);
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockRejectedValueOnce(new Error('EXDEV: cross-device link not permitted'));

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
});

// 16. Failed download returns success=false so callers know not to update article
test('16. download failure returns success=false and no publicUrl', async () => {
  mockErrorResponse(404);

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.publicUrl).toBeUndefined();
});

// 17. GIF kept as-is; dimensions extracted via sharp.metadata() without WebP conversion
test('17. keeps GIF format, extracts dimensions without converting', async () => {
  mockOkResponse(GIF_MAGIC, 'image/gif');
  // GIF path only calls .metadata(), not .webp() or .toBuffer()
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: 400, height: 300 });

  const result = await downloadAndStoreImage(BASE_PARAMS);

  expect(result.success).toBe(true);
  expect(result.mimeType).toBe('image/gif');
  expect(result.publicUrl).toMatch(/\.gif$/);
  expect(result.width).toBe(400);
  expect(result.height).toBe(300);
  expect(mockSharpInstance.webp).not.toHaveBeenCalled();
});

// 18. Checksum-based public URL format
test('18. public URL matches checksum-based path pattern', async () => {
  const outBuf = Buffer.from('deterministic-webp');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(800, 600, outBuf);

  const result = await downloadAndStoreImage(BASE_PARAMS);

  expect(result.success).toBe(true);
  expect(result.publicUrl).toMatch(/^\/uploads\/articles\/\d{4}\/\d{2}\/[a-f0-9]{24}\.webp$/);
});

// 19. Image wider than 2000px gets resized
test('19. resizes image when width exceeds 2000px', async () => {
  const outBuf = Buffer.from('resized-webp');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpInstance.metadata
    .mockResolvedValueOnce({ width: 3000, height: 2000 })
    .mockResolvedValueOnce({ width: 2000, height: 1333 });
  mockSharpInstance.toBuffer.mockResolvedValueOnce(outBuf);

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(true);
  expect(mockSharpInstance.resize).toHaveBeenCalledWith(2000, undefined, expect.any(Object));
});

// 20. SSRF — AWS metadata endpoint (literal IP, blocked without DNS)
test('20. blocks AWS metadata endpoint 169.254.169.254', async () => {
  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'http://169.254.169.254/latest/meta-data/',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

// 21. Too many redirects
test('21. returns error after exceeding redirect limit', async () => {
  mockRedirect('https://a.example.com/img.jpg');
  mockRedirect('https://b.example.com/img.jpg');
  mockRedirect('https://c.example.com/img.jpg');
  mockRedirect('https://d.example.com/img.jpg');

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/redirect/i);
});

// 22. Invalid URL format
test('22. rejects invalid URL', async () => {
  const result = await downloadAndStoreImage({ ...BASE_PARAMS, sourceUrl: 'not-a-url' });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/Invalid URL/i);
});

// 23. data: URL blocked
test('23. blocks data: protocol', async () => {
  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'data:image/png;base64,iVBORw0KGgo=',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/protocol/i);
});

// 24. Checksum is SHA-256 of STORED (processed) buffer, not source
test('24. checksum is SHA-256 of the stored processed buffer', async () => {
  const processedBuf = Buffer.from('this-is-the-stored-webp-bytes');
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  mockSharpSuccess(800, 600, processedBuf);

  const result = await downloadAndStoreImage(BASE_PARAMS);

  const expectedStoredChecksum = crypto.createHash('sha256').update(processedBuf).digest('hex');
  expect(result.checksum).toBe(expectedStoredChecksum);

  // The public URL filename must be the first 24 hex chars of the stored checksum
  const expectedFilenamePrefix = expectedStoredChecksum.slice(0, 24);
  expect(result.publicUrl).toContain(expectedFilenamePrefix);
});

// 25. URL credentials are blocked
test('25. blocks URL with embedded credentials', async () => {
  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'https://user:pass@example.com/img.jpg',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/credentials/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

// 26. Small image (below min dimensions) is rejected
test('26. rejects image below minimum dimensions (200x200)', async () => {
  mockOkResponse(JPEG_MAGIC, 'image/jpeg');
  // First metadata call returns tiny image; no resize needed
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: 100, height: 80 });
  mockSharpInstance.toBuffer.mockResolvedValueOnce(Buffer.from('tiny-webp'));

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/IMAGE_TOO_SMALL/);
  expect(mockWriteFile).not.toHaveBeenCalled();
});

// 27. 1×1 tracking pixel is rejected
test('27. rejects 1x1 tracking pixel', async () => {
  mockOkResponse(PNG_MAGIC, 'image/png');
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: 1, height: 1 });
  mockSharpInstance.toBuffer.mockResolvedValueOnce(Buffer.from('pixel'));

  const result = await downloadAndStoreImage(BASE_PARAMS);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/IMAGE_TOO_SMALL/);
});

// 28. DNS hostname resolves to 127.0.0.1 → blocked
test('28. blocks when DNS resolves hostname to 127.0.0.1 (loopback)', async () => {
  mockDnsLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'https://evil-internal.com/image.jpg',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

// 29. DNS hostname resolves to 10.x.x.x → blocked
test('29. blocks when DNS resolves hostname to 10.0.0.1 (private class A)', async () => {
  mockDnsLookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);

  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'https://internal-host.corp/image.jpg',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF/i);
});

// 30. DNS returns mixed public + private IPs → blocked (any private = reject all)
test('30. blocks when DNS returns mixed public + private IPs', async () => {
  mockDnsLookup.mockResolvedValueOnce([
    { address: '93.184.216.34', family: 4 },  // public
    { address: '192.168.100.1', family: 4 },   // private → triggers block
  ]);

  const result = await downloadAndStoreImage({
    ...BASE_PARAMS,
    sourceUrl: 'https://mixed-host.example.com/image.jpg',
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/SSRF/i);
});
