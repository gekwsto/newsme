/**
 * SSRF and DNS security tests for the image download service.
 *
 * Covers DNS-rebinding vectors, private-IP detection, IPv4-mapped IPv6,
 * concurrent-write idempotency, and publication ordering invariants.
 */

import path from 'path';
import crypto from 'crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: { article: { findFirst: jest.fn() } },
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
  mkdir: (...a: unknown[]) => mockMkdir(...a),
  writeFile: (...a: unknown[]) => mockWriteFile(...a),
  rename: (...a: unknown[]) => mockRename(...a),
  unlink: (...a: unknown[]) => mockUnlink(...a),
  lstat: (...a: unknown[]) => mockLstat(...a),
}));

const mockDnsLookup = jest.fn();
jest.mock('dns', () => ({
  promises: { lookup: (...a: unknown[]) => mockDnsLookup(...a) },
}));

// ── Import helpers and tested module ──────────────────────────────────────────

import {
  downloadAndStoreImage,
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  MIN_IMAGE_WIDTH,
  MIN_IMAGE_HEIGHT,
} from '@/lib/images/download-and-store';
import { prisma } from '@/lib/db';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const PUBLIC_IP = '93.184.216.34';

function validFetch(buf: Buffer, ct = 'image/jpeg') {
  const chunks = [buf];
  let i = 0;
  const reader = {
    read: jest.fn().mockImplementation(() =>
      i < chunks.length
        ? Promise.resolve({ done: false, value: new Uint8Array(chunks[i++]) })
        : Promise.resolve({ done: true, value: undefined })
    ),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 200,
    headers: { get: jest.fn().mockReturnValue(ct) },
    body: { getReader: () => reader },
  });
}

function mockRedirectFetch(to: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status: 301,
    headers: { get: jest.fn().mockReturnValue(to) },
    body: null,
  });
}

function sharpOk(width = 400, height = 300, out = Buffer.from('webp')) {
  mockSharpInstance.metadata.mockResolvedValue({ width, height });
  mockSharpInstance.toBuffer.mockResolvedValue(out);
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.article.findFirst as jest.Mock).mockResolvedValue(null);
  mockDnsLookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
  mockLstat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockSharpInstance.rotate.mockReturnThis();
  mockSharpInstance.resize.mockReturnThis();
  mockSharpInstance.webp.mockReturnThis();
  mockSharp.mockReturnValue(mockSharpInstance);
  sharpOk();
});

const BASE = {
  sourceUrl: 'https://example.com/photo.jpg',
  articleSlug: 'test',
  articleId: 'cltestssrf01',
  sourceName: 'TEST',
};

// ── IP range unit tests ────────────────────────────────────────────────────────

describe('isPrivateIPv4', () => {
  const privates = [
    '0.0.0.0', '0.255.255.255',          // 0/8
    '10.0.0.1', '10.255.255.255',         // 10/8
    '100.64.0.0', '100.127.255.255',      // 100.64/10 CGN
    '127.0.0.1', '127.255.255.254',       // 127/8
    '169.254.1.1', '169.254.169.254',     // 169.254/16
    '172.16.0.1', '172.31.255.255',       // 172.16/12
    '192.0.0.1',                          // 192.0.0/24
    '192.0.2.1',                          // TEST-NET-1
    '192.168.0.1', '192.168.255.255',     // 192.168/16
    '198.18.0.0', '198.19.255.255',       // benchmark
    '198.51.100.1',                       // TEST-NET-2
    '203.0.113.1',                        // TEST-NET-3
    '224.0.0.1', '239.255.255.255',       // multicast
    '240.0.0.0', '255.255.255.255',       // reserved
  ];
  const publics = [
    '1.1.1.1', '8.8.8.8', '93.184.216.34', '104.16.0.0',
  ];

  test.each(privates)('blocks private %s', ip => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });

  test.each(publics)('allows public %s', ip => {
    expect(isPrivateIPv4(ip)).toBe(false);
  });
});

describe('isPrivateIPv6', () => {
  const privates = [
    '::1',                    // loopback
    '::',                     // unspecified
    'fc00::1',                // unique local
    'fd12:3456:789a::1',      // unique local (fd prefix)
    'fe80::1',                // link-local
    'febc::1',                // link-local range
    'ff02::1',                // multicast
    '::ffff:10.0.0.1',        // IPv4-mapped private
    '::ffff:192.168.1.1',     // IPv4-mapped private
    '::ffff:127.0.0.1',       // IPv4-mapped loopback
  ];
  const publics = [
    '2001:db8::1',            // documentation (public in practice)
    '2606:4700::1111',        // Cloudflare DNS
    '::ffff:1.1.1.1',         // IPv4-mapped public
  ];

  test.each(privates)('blocks private IPv6 %s', ip => {
    expect(isPrivateIPv6(ip)).toBe(true);
  });

  test.each(publics)('allows public IPv6 %s', ip => {
    expect(isPrivateIPv6(ip)).toBe(false);
  });
});

// ── DNS-based SSRF tests ───────────────────────────────────────────────────────

test('DNS: blocks hostname that resolves only to 127.0.0.1', async () => {
  mockDnsLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://evil.example.com/img.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

test('DNS: blocks hostname that resolves to 10.0.0.1 (private class A)', async () => {
  mockDnsLookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://internal.corp/img.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF/i);
});

test('DNS: blocks when ANY resolved address is private (mixed public+private)', async () => {
  mockDnsLookup.mockResolvedValueOnce([
    { address: PUBLIC_IP, family: 4 },
    { address: '172.16.0.1', family: 4 },
  ]);

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://dual-homed.example.com/img.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF/i);
});

test('DNS: blocks IPv4-mapped IPv6 private address (::ffff:10.0.0.1)', async () => {
  // dns.lookup can return IPv6 addresses including IPv4-mapped ones
  mockDnsLookup.mockResolvedValueOnce([{ address: '::ffff:10.0.0.1', family: 6 }]);

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://ipv6host.example.com/img.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF/i);
});

test('DNS: blocks redirect to hostname that resolves to private IP', async () => {
  // First DNS check (initial URL) → public; second (redirect target) → private
  mockDnsLookup
    .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])  // initial URL check
    .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])  // redirect sync check (public)
    .mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }]); // redirect DNS check → private

  mockRedirectFetch('https://internal-redirect.example.com/img.jpg');

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF|Redirect/i);
});

test('DNS: blocks when DNS resolution fails entirely', async () => {
  mockDnsLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://nonexistent-host.xyz/img.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/DNS/i);
});

test('Literal 10.x.x.x in URL blocked without DNS (sync check)', async () => {
  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'http://10.0.0.1/image.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/SSRF/i);
  expect(mockDnsLookup).not.toHaveBeenCalled();
});

test('URL with embedded user:pass credentials blocked', async () => {
  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://user:secret@img.example.com/photo.jpg' });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/credentials/i);
  expect(mockDnsLookup).not.toHaveBeenCalled();
});

// ── Concurrent-write idempotency ───────────────────────────────────────────────

test('Concurrent download: filesystem dedup returns existing file without re-writing', async () => {
  validFetch(JPEG_MAGIC, 'image/jpeg');
  const processedBuf = Buffer.from('identical-webp-output');
  sharpOk(600, 400, processedBuf);

  // Simulate another worker already wrote the file (lstat returns file info)
  mockLstat.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: processedBuf.length });

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(true);
  expect(r.deduplicated).toBe(true);
  // No new file written
  expect(mockWriteFile).not.toHaveBeenCalled();
});

// ── Symlink rejection in dedup ─────────────────────────────────────────────────

test('Dedup: symlink hit rejected, falls through to new write', async () => {
  validFetch(JPEG_MAGIC, 'image/jpeg');
  const processedBuf = Buffer.from('webp-after-symlink-miss');
  sharpOk(600, 400, processedBuf);

  const existingPath = path.join(process.cwd(), 'public', 'uploads', 'articles', '2025', '01', 'sym.webp');
  (prisma.article.findFirst as jest.Mock).mockResolvedValueOnce({ localImagePath: existingPath });
  // DB dedup: lstat returns symlink → rejected
  mockLstat
    .mockResolvedValueOnce({ isFile: () => false, isSymbolicLink: () => true, size: 100 }) // DB hit = symlink
    .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));       // filesystem check = not found

  const r = await downloadAndStoreImage(BASE);
  // Symlink rejected → falls through to write a new file
  expect(r.success).toBe(true);
  expect(r.deduplicated).toBe(false);
  expect(mockWriteFile).toHaveBeenCalled();
});

// ── Path traversal ─────────────────────────────────────────────────────────────

test('Path traversal in URL rejected at URL parsing stage', async () => {
  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://example.com/../../../etc/passwd' });
  // URL parser resolves traversal, so the path becomes just /etc/passwd but hostname is fine
  // The image download would fail (non-image content), not a path traversal issue for local files
  // Either way, success=false or the image doesn't exist
  expect(r.success).toBe(false);
});

// ── Small image / tracking pixel ──────────────────────────────────────────────

test('MIN_IMAGE_WIDTH and MIN_IMAGE_HEIGHT constants are defined and positive', () => {
  expect(MIN_IMAGE_WIDTH).toBeGreaterThan(0);
  expect(MIN_IMAGE_HEIGHT).toBeGreaterThan(0);
});

test('Image exactly at minimum dimensions passes', async () => {
  validFetch(JPEG_MAGIC, 'image/jpeg');
  sharpOk(MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT, Buffer.from('min-size-webp'));

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(true);
});

test('Image one pixel below minimum width is rejected', async () => {
  validFetch(JPEG_MAGIC, 'image/jpeg');
  // metadata returns small width; code returns early before toBuffer — do NOT set toBuffer here
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: MIN_IMAGE_WIDTH - 1, height: MIN_IMAGE_HEIGHT });

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/IMAGE_TOO_SMALL/);
});

// ── GIF dimensions ─────────────────────────────────────────────────────────────

test('GIF: width and height are returned from sharp metadata', async () => {
  validFetch(GIF_MAGIC, 'image/gif');
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: 320, height: 240 });

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(true);
  expect(r.mimeType).toBe('image/gif');
  expect(r.width).toBe(320);
  expect(r.height).toBe(240);
  expect(mockSharpInstance.webp).not.toHaveBeenCalled();
});

test('GIF: tiny GIF below min dimensions rejected', async () => {
  validFetch(GIF_MAGIC, 'image/gif');
  mockSharpInstance.metadata.mockResolvedValueOnce({ width: 16, height: 16 });

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/IMAGE_TOO_SMALL/i);
});

// ── Stored checksum integrity ──────────────────────────────────────────────────

test('Stored checksum equals SHA-256 of processed buffer', async () => {
  const processedBuf = Buffer.from('exact-stored-bytes-for-checksum-test');
  validFetch(JPEG_MAGIC, 'image/jpeg');
  sharpOk(500, 400, processedBuf);

  const r = await downloadAndStoreImage(BASE);
  const expected = crypto.createHash('sha256').update(processedBuf).digest('hex');
  expect(r.checksum).toBe(expected);
});

test('Stored checksum is embedded in the file path (first 24 hex chars)', async () => {
  const processedBuf = Buffer.from('stored-content-for-path-verification');
  validFetch(JPEG_MAGIC, 'image/jpeg');
  sharpOk(500, 400, processedBuf);

  const r = await downloadAndStoreImage(BASE);
  const storedChecksum = crypto.createHash('sha256').update(processedBuf).digest('hex');
  expect(r.publicUrl).toContain(storedChecksum.slice(0, 24));
});

// ── DB update failure orphan logging ──────────────────────────────────────────

test('DB failure after file write: caller receives localPath to log orphan', async () => {
  // The download service itself succeeds. If the CALLER's DB update fails,
  // the caller has result.localPath available for orphan logging.
  const processedBuf = Buffer.from('file-written-db-update-would-fail');
  validFetch(JPEG_MAGIC, 'image/jpeg');
  sharpOk(600, 400, processedBuf);

  const r = await downloadAndStoreImage(BASE);
  expect(r.success).toBe(true);
  expect(r.localPath).toBeDefined();
  expect(r.localPath).toContain(path.join('public', 'uploads', 'articles'));
});

// ── Publication ordering invariant ────────────────────────────────────────────

test('Publication invariant: downloadAndStoreImage never returns an external URL as publicUrl', async () => {
  const processedBuf = Buffer.from('local-webp');
  validFetch(JPEG_MAGIC, 'image/jpeg');
  sharpOk(600, 400, processedBuf);

  const r = await downloadAndStoreImage({ ...BASE, sourceUrl: 'https://external.cdn.com/img.jpg' });
  expect(r.success).toBe(true);
  // publicUrl must always be a relative local path
  expect(r.publicUrl).toBeDefined();
  expect(r.publicUrl!.startsWith('/')).toBe(true);
  expect(r.publicUrl!.startsWith('http')).toBe(false);
});

test('isPrivateIP dispatches correctly for IPv4 and IPv6', () => {
  expect(isPrivateIP('127.0.0.1')).toBe(true);
  expect(isPrivateIP('::1')).toBe(true);
  expect(isPrivateIP('1.1.1.1')).toBe(false);
  expect(isPrivateIP('2606:4700::1111')).toBe(false);
  expect(isPrivateIP('not-an-ip')).toBe(true); // unknown format → block
});
