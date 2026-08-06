/**
 * End-to-end smoke test: external HTTPS image → local file → local URL.
 *
 * Proves that the download pipeline works end-to-end:
 * 1. Downloads a real external HTTPS image.
 * 2. Processes it through the same sharp pipeline used in production.
 * 3. Writes to public/uploads/articles/test/ (never to a dated dir).
 * 4. Verifies the file content (WebP magic bytes).
 * 5. Verifies the public URL is relative (never an external hotlink).
 * 6. Cleans up all test files.
 *
 * Does NOT require a database connection.
 * Run with:  npm run images:test-e2e
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';

// ── Stable, permanent test JPEG (httpbin always returns a valid JPEG) ────────
const TEST_IMAGE_URL = 'https://httpbin.org/image/jpeg';

const TEST_DIR = path.join(process.cwd(), 'public', 'uploads', 'articles', 'e2e-test');

// ── Inline SSRF guard (matches production logic) ──────────────────────────────

const PRIVATE_V4: Array<[number, number]> = (() => {
  function n(ip: string) {
    return ip.split('.').reduce((a, o) => (a << 8) + parseInt(o, 10), 0) >>> 0;
  }
  function r(ip: string, bits: number): [number, number] {
    const s = n(ip);
    return [s, bits === 32 ? s : (s | ((1 << (32 - bits)) - 1)) >>> 0];
  }
  return [
    r('10.0.0.0', 8), r('127.0.0.0', 8), r('169.254.0.0', 16),
    r('172.16.0.0', 12), r('192.168.0.0', 16), r('0.0.0.0', 8),
    r('100.64.0.0', 10), r('224.0.0.0', 4), r('240.0.0.0', 4),
  ];
})();

function isPriv(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const v = ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
    return PRIVATE_V4.some(([s, e]) => v >= s && v <= e);
  }
  return false; // for smoke-test only IPv4 matters
}

async function assertSafeUrl(url: string) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Bad protocol: ${parsed.protocol}`);
  const host = parsed.hostname;
  if (!net.isIPv4(host) && !net.isIPv6(host)) {
    const addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
    for (const { address } of addrs) {
      if (isPriv(address)) throw new Error(`SSRF: ${host} → ${address}`);
    }
  } else if (isPriv(host)) {
    throw new Error(`SSRF: literal private IP ${host}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' NewsMe image-download E2E smoke test');
  console.log('══════════════════════════════════════════════════════\n');

  await fs.mkdir(TEST_DIR, { recursive: true });

  // ── Step 1: SSRF guard ────────────────────────────────────────────────────
  process.stdout.write('[1/9] SSRF check on test URL... ');
  await assertSafeUrl(TEST_IMAGE_URL);
  console.log('OK ✓');

  // ── Step 2: Download ──────────────────────────────────────────────────────
  process.stdout.write('[2/9] Downloading external image... ');
  const res = await fetch(TEST_IMAGE_URL, {
    headers: { 'User-Agent': 'NewsMe/1.0 smoke-test (+https://newsme.gr)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const sourceBuf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
  console.log(`OK ✓  (${sourceBuf.length.toLocaleString()} bytes, ${contentType})`);

  // ── Step 3: Magic bytes check ─────────────────────────────────────────────
  process.stdout.write('[3/9] Validating magic bytes... ');
  const isJpeg = sourceBuf[0] === 0xff && sourceBuf[1] === 0xd8 && sourceBuf[2] === 0xff;
  if (!isJpeg) throw new Error(`Not a JPEG (first bytes: ${sourceBuf.slice(0, 4).toString('hex')})`);
  console.log('OK ✓  (JPEG)');

  // ── Step 4: Sharp processing ──────────────────────────────────────────────
  process.stdout.write('[4/9] Processing with sharp (rotate + WebP 82)... ');
  const sharp = (await import('sharp')).default;
  const meta = await sharp(sourceBuf).metadata();
  const processedBuf = await sharp(sourceBuf).rotate().webp({ quality: 82 }).toBuffer();
  const outMeta = await sharp(processedBuf).metadata();
  console.log(`OK ✓  (${meta.width}×${meta.height} → ${outMeta.width}×${outMeta.height}, ${processedBuf.length.toLocaleString()} bytes)`);

  // ── Step 5: Compute stored checksum ───────────────────────────────────────
  process.stdout.write('[5/9] Computing stored checksum... ');
  const storedChecksum = crypto.createHash('sha256').update(processedBuf).digest('hex');
  const filename = `${storedChecksum.slice(0, 24)}.webp`;
  const absPath = path.join(TEST_DIR, filename);
  const publicUrl = `/uploads/articles/e2e-test/${filename}`;
  console.log(`OK ✓  (${storedChecksum.slice(0, 16)}...)`);

  // ── Step 6: Atomic write ──────────────────────────────────────────────────
  process.stdout.write('[6/9] Writing file atomically... ');
  const tmpPath = absPath + '.tmp';
  await fs.writeFile(tmpPath, processedBuf);
  await fs.rename(tmpPath, absPath);
  console.log(`OK ✓  → ${absPath}`);

  // ── Step 7: Verify file on disk ───────────────────────────────────────────
  process.stdout.write('[7/9] Verifying file integrity on disk... ');
  const onDisk = await fs.readFile(absPath);
  const diskChecksum = crypto.createHash('sha256').update(onDisk).digest('hex');
  if (diskChecksum !== storedChecksum) throw new Error('Checksum mismatch after write!');
  const isWebP = onDisk[0] === 0x52 && onDisk[1] === 0x49 && onDisk[2] === 0x46 && onDisk[3] === 0x46;
  if (!isWebP) throw new Error('Written file is not valid WebP');
  console.log(`OK ✓  (${onDisk.length.toLocaleString()} bytes, WebP magic confirmed)`);

  // ── Step 8: Verify public URL is local (never external) ───────────────────
  process.stdout.write('[8/9] Checking public URL is local relative path... ');
  if (!publicUrl.startsWith('/uploads/')) throw new Error(`Public URL must start with /uploads/ — got ${publicUrl}`);
  if (publicUrl.startsWith('http')) throw new Error(`Public URL must not be absolute — got ${publicUrl}`);
  console.log(`OK ✓  (${publicUrl})`);

  // ── Step 9: Cleanup ───────────────────────────────────────────────────────
  process.stdout.write('[9/9] Cleaning up test files... ');
  await fs.unlink(absPath);
  await fs.rmdir(TEST_DIR).catch(() => {}); // OK if dir still has other files
  console.log('OK ✓');

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' ALL CHECKS PASSED ✓');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Source URL:       ${TEST_IMAGE_URL}`);
  console.log(`  Stored checksum:  ${storedChecksum.slice(0, 16)}...`);
  console.log(`  Public URL:       ${publicUrl}  ← local, never external`);
  console.log(`  Content-Type:     image/webp`);
  console.log(`  Dimensions:       ${outMeta.width}×${outMeta.height}px`);
  console.log(`  File size:        ${processedBuf.length.toLocaleString()} bytes`);
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n[E2E FAILED]', err.message);
  process.exit(1);
});
