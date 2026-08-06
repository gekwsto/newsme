import 'server-only';

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { prisma } from '@/lib/db';

// ── Private IPv4 CIDR ranges ───────────────────────────────────────────────────

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Precomputed [startUint32, endUint32] pairs — covers all RFC-reserved ranges.
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = (() => {
  function cidrRange(network: string, bits: number): readonly [number, number] {
    const start = ipv4ToUint32(network);
    const end = bits === 32 ? start : (start | ((1 << (32 - bits)) - 1)) >>> 0;
    return [start, end] as const;
  }
  return [
    cidrRange('0.0.0.0', 8),       // "this" network
    cidrRange('10.0.0.0', 8),      // RFC 1918 private class A
    cidrRange('100.64.0.0', 10),   // carrier-grade NAT (RFC 6598)
    cidrRange('127.0.0.0', 8),     // loopback
    cidrRange('169.254.0.0', 16),  // link-local / cloud metadata
    cidrRange('172.16.0.0', 12),   // RFC 1918 private class B
    cidrRange('192.0.0.0', 24),    // IETF protocol assignments
    cidrRange('192.0.2.0', 24),    // TEST-NET-1
    cidrRange('192.168.0.0', 16),  // RFC 1918 private class C
    cidrRange('198.18.0.0', 15),   // benchmark testing
    cidrRange('198.51.100.0', 24), // TEST-NET-2
    cidrRange('203.0.113.0', 24),  // TEST-NET-3
    cidrRange('224.0.0.0', 4),     // multicast
    cidrRange('240.0.0.0', 4),     // reserved / future use (includes 255.255.255.255)
  ] as const;
})();

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  // ipv4ToUint32 of an invalid address produces NaN-derived results; guard with parts check
  if (ip.split('.').some(p => isNaN(Number(p)) || Number(p) > 255 || Number(p) < 0)) return true;
  return BLOCKED_IPV4_RANGES.some(([start, end]) => n >= start && n <= end);
}

// ── Private IPv6 ranges ────────────────────────────────────────────────────────

function expandIPv6ToBytes(addr: string): number[] | null {
  try {
    let h = addr.toLowerCase().trim();

    // Strip surrounding brackets (URL literal form)
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);

    // Strip zone ID
    const zoneIdx = h.indexOf('%');
    if (zoneIdx !== -1) h = h.slice(0, zoneIdx);

    // Handle mixed IPv4 notation: e.g. ::ffff:192.168.1.1 or 2001:db8::1.2.3.4
    const dotted = h.match(/^(.+:)(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
      const ipv4Parts = dotted[2].split('.').map(Number);
      if (ipv4Parts.length !== 4 || ipv4Parts.some(p => p < 0 || p > 255)) return null;
      const lo16a = ((ipv4Parts[0] << 8) | ipv4Parts[1]).toString(16).padStart(4, '0');
      const lo16b = ((ipv4Parts[2] << 8) | ipv4Parts[3]).toString(16).padStart(4, '0');
      h = dotted[1] + lo16a + ':' + lo16b;
    }

    const halves = h.split('::');
    if (halves.length > 2) return null;

    const left = halves[0] ? halves[0].split(':') : [];
    const right = (halves.length === 2 && halves[1]) ? halves[1].split(':') : [];
    if (halves.length === 1 && left.length !== 8) return null;

    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const middle = halves.length === 2 ? Array(missing).fill('0') : [];
    const groups = [...left, ...middle, ...right];
    if (groups.length !== 8) return null;

    const bytes: number[] = [];
    for (const g of groups) {
      const val = parseInt(g || '0', 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      bytes.push((val >> 8) & 0xff, val & 0xff);
    }
    return bytes.length === 16 ? bytes : null;
  } catch {
    return null;
  }
}

export function isPrivateIPv6(ip: string): boolean {
  const bytes = expandIPv6ToBytes(ip);
  if (!bytes) return true; // unparseable → block

  const b = bytes;

  // :: (unspecified)
  if (b.every(x => x === 0)) return true;

  // ::1 (loopback)
  if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return true;

  // fc00::/7 (unique local: fc00-fdff)
  if ((b[0] & 0xfe) === 0xfc) return true;

  // fe80::/10 (link-local: fe80-febf)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;

  // ff00::/8 (multicast)
  if (b[0] === 0xff) return true;

  // ::ffff:0:0/96 (IPv4-mapped) — check embedded IPv4
  if (b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return isPrivateIPv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }

  // 64:ff9b::/96 (NAT64)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b &&
      b.slice(4, 12).every(x => x === 0)) return true;

  return false;
}

export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unrecognised format — block
}

// ── Synchronous URL checks (fast-path before DNS) ─────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'host.docker.internal',
]);

function validateUrlSync(
  raw: string,
): { valid: true; url: URL } | { valid: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: `Blocked protocol: ${url.protocol}` };
  }

  if (url.username || url.password) {
    return { valid: false, reason: 'URL credentials are not allowed' };
  }

  // Strip trailing dot (DNS normalisation, e.g. "example.com." is valid)
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }

  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Literal IPv4 address in URL (WHATWG parser already normalises hex/octal/decimal forms)
  if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
    return { valid: false, reason: `SSRF blocked (literal private IPv4): ${hostname}` };
  }

  // Literal IPv6 in URL: [::1] → hostname = '::1'
  if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
    return { valid: false, reason: `SSRF blocked (literal private IPv6): ${hostname}` };
  }

  return { valid: true, url };
}

// ── DNS-based SSRF validation ──────────────────────────────────────────────────
//
// NOTE — TOCTOU gap: this DNS check and the fetch() call below each do their own
// DNS resolution.  A sophisticated DNS-rebinding attack could return a public IP
// here and a private IP for the actual connection.  This layer is defence-in-depth;
// production deployments should also enforce egress filtering at the network layer
// (firewall rule, SSRF-aware proxy, or cloud VPC network policy).

async function validateUrlWithDns(
  raw: string,
): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
  const syncResult = validateUrlSync(raw);
  if (!syncResult.valid) return syncResult;

  const { url } = syncResult;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  // Literal IP addresses were already checked synchronously above — skip DNS.
  if (net.isIP(hostname)) return { valid: true, url };

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { valid: false, reason: `DNS resolution failed: ${hostname}` };
  }

  if (addresses.length === 0) {
    return { valid: false, reason: `DNS returned no addresses: ${hostname}` };
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      return {
        valid: false,
        reason: `SSRF: ${hostname} resolves to private/reserved IP ${address}`,
      };
    }
  }

  return { valid: true, url };
}

// ── MIME / magic bytes ─────────────────────────────────────────────────────────

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

function isHtmlResponse(buf: Buffer): boolean {
  const preview = buf.slice(0, 200).toString('ascii').toLowerCase();
  return preview.includes('<!doctype') || preview.includes('<html');
}

// ── Storage constants ──────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_WIDTH = 2000;
/** Minimum accepted image dimensions (rejects tracking pixels, icons, tiny thumbnails) */
export const MIN_IMAGE_WIDTH = 200;
export const MIN_IMAGE_HEIGHT = 200;
const WEBP_QUALITY = 82;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const UPLOADS_ARTICLES_ROOT = path.join(process.cwd(), 'public', 'uploads', 'articles');

// ── Path helpers ───────────────────────────────────────────────────────────────

/**
 * Builds a deterministic, checksum-based storage path.
 * Using the stored checksum as the filename makes concurrent writes idempotent:
 * two workers downloading the same image produce the same final path, and the
 * last atomic rename wins without corruption.
 */
function buildStorePath(
  storedChecksum: string,
  ext: string,
): { absDir: string; absPath: string; publicUrl: string } {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  const filename = `${storedChecksum.slice(0, 24)}${ext}`;
  const relDir = path.posix.join('uploads', 'articles', yyyy, mm);
  const absDir = path.join(process.cwd(), 'public', relDir);
  const absPath = path.join(absDir, filename);
  const publicUrl = `/${relDir}/${filename}`;

  return { absDir, absPath, publicUrl };
}

function isPathWithinUploads(absPath: string): boolean {
  const resolved = path.resolve(absPath);
  return resolved.startsWith(UPLOADS_ARTICLES_ROOT + path.sep) || resolved === UPLOADS_ARTICLES_ROOT;
}

// ── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Looks up an existing local file by the stored checksum.
 * Performs integrity checks: must be a regular non-symlink file within the
 * uploads directory with non-zero size.
 */
async function findByStoredChecksum(checksum: string): Promise<string | null> {
  const hit = await prisma.article.findFirst({
    where: { imageChecksum: checksum, localImagePath: { not: null } },
    select: { localImagePath: true },
  });
  if (!hit?.localImagePath) return null;
  return integrityCheck(hit.localImagePath);
}

/** Returns the public URL if the file passes all integrity checks, null otherwise. */
async function integrityCheck(absPath: string): Promise<string | null> {
  try {
    if (!isPathWithinUploads(absPath)) return null;

    // lstat: does NOT follow symlinks — rejects symlinks
    const stat = await fs.lstat(absPath);
    if (!stat.isFile() || stat.size === 0) return null;

    const pubDir = path.join(process.cwd(), 'public');
    const rel = path.relative(pubDir, absPath).replace(/\\/g, '/');
    return `/${rel}`;
  } catch {
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DownloadImageParams {
  sourceUrl: string;
  articleSlug?: string;
  articleId?: string;
  sourceName?: string;
}

export interface DownloadImageResult {
  success: boolean;
  originalUrl: string;
  localPath?: string;
  publicUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  /** SHA-256 of the stored (processed) file bytes. Used for deduplication and integrity. */
  checksum?: string;
  error?: string;
  deduplicated?: boolean;
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function downloadAndStoreImage(
  params: DownloadImageParams,
): Promise<DownloadImageResult> {
  const { sourceUrl, articleId, sourceName = 'unknown' } = params;

  // 1. Fast synchronous URL checks (protocol, credentials, literal private IPs)
  const syncCheck = validateUrlSync(sourceUrl);
  if (!syncCheck.valid) {
    console.warn(
      `[image-dl] rejected url="${sourceUrl}" reason="${syncCheck.reason}" article=${articleId ?? '-'}`,
    );
    return { success: false, originalUrl: sourceUrl, error: syncCheck.reason };
  }

  // 2. DNS-based SSRF check
  const dnsCheck = await validateUrlWithDns(sourceUrl);
  if (!dnsCheck.valid) {
    console.warn(
      `[image-dl] DNS SSRF rejected url="${sourceUrl}" reason="${dnsCheck.reason}" article=${articleId ?? '-'}`,
    );
    return { success: false, originalUrl: sourceUrl, error: dnsCheck.reason };
  }

  console.log(
    `[image-dl] start source=${sourceName} article=${articleId ?? '-'} url="${sourceUrl}"`,
  );

  // 3. Fetch with redirect handling + timeout
  let buffer: Buffer;
  let contentType: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let currentUrl = sourceUrl;
    let redirectCount = 0;
    let response!: Response;

    while (true) {
      // Re-validate every redirect target (including DNS check)
      const urlCheck = await validateUrlWithDns(currentUrl);
      if (!urlCheck.valid) {
        clearTimeout(timer);
        return {
          success: false,
          originalUrl: sourceUrl,
          error: `Redirect to blocked URL: ${urlCheck.reason}`,
        };
      }

      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'NewsMe/1.0 (+https://newsme.gr)',
          Accept: 'image/webp,image/jpeg,image/png,image/*',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount >= MAX_REDIRECTS) {
          clearTimeout(timer);
          return {
            success: false,
            originalUrl: sourceUrl,
            error: `Too many redirects (>${MAX_REDIRECTS})`,
          };
        }
        const location = response.headers.get('location');
        if (!location) {
          clearTimeout(timer);
          return {
            success: false,
            originalUrl: sourceUrl,
            error: 'Redirect with no Location header',
          };
        }
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;
        continue;
      }
      break;
    }

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(
        `[image-dl] HTTP ${response.status} url="${sourceUrl}" article=${articleId ?? '-'}`,
      );
      return { success: false, originalUrl: sourceUrl, error: `HTTP ${response.status}` };
    }

    // 4. Early MIME check from Content-Type header
    contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null;
    if (contentType && !contentType.startsWith('image/')) {
      console.warn(`[image-dl] rejected content-type="${contentType}" url="${sourceUrl}"`);
      return {
        success: false,
        originalUrl: sourceUrl,
        error: `Rejected Content-Type: ${contentType}`,
      };
    }

    // 5. Read body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, originalUrl: sourceUrl, error: 'No response body' };
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_FILE_SIZE) {
        reader.cancel().catch(() => {});
        return {
          success: false,
          originalUrl: sourceUrl,
          error: `File too large (>${MAX_FILE_SIZE / 1024 / 1024} MB)`,
        };
      }
      chunks.push(Buffer.from(value));
    }

    buffer = Buffer.concat(chunks);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const msg = isAbort ? 'Download timeout' : (err instanceof Error ? err.message : String(err));
    console.warn(`[image-dl] fetch error url="${sourceUrl}" error="${msg}"`);
    return { success: false, originalUrl: sourceUrl, error: msg };
  }

  // 6. Reject HTML responses disguised as images
  if (isHtmlResponse(buffer)) {
    return { success: false, originalUrl: sourceUrl, error: 'Response is HTML, not an image' };
  }

  // 7. Validate magic bytes (authoritative MIME detection)
  const detectedMime = detectMimeFromBuffer(buffer);
  if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
    console.warn(
      `[image-dl] unknown magic bytes url="${sourceUrl}" detected="${detectedMime}"`,
    );
    return {
      success: false,
      originalUrl: sourceUrl,
      error: `Unsupported or unrecognized image format (detected: ${detectedMime ?? 'none'})`,
    };
  }

  // 8. Process image — compute processed buffer and extract dimensions
  let processedBuffer: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  let ext: string;

  if (detectedMime === 'image/gif') {
    processedBuffer = buffer;
    ext = '.gif';

    // Extract GIF dimensions via sharp without re-encoding (preserves animation)
    try {
      const sharpModule = await import('sharp');
      const gifMeta = await sharpModule.default(buffer).metadata();
      width = gifMeta.width;
      height = gifMeta.height;
    } catch {
      // Non-critical: GIF stored without dimension metadata
    }
  } else {
    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default;

      const meta = await sharp(buffer).metadata();
      width = meta.width;
      height = meta.height;

      if (!width || !height) {
        return { success: false, originalUrl: sourceUrl, error: 'Could not read image dimensions' };
      }

      // 9. Reject images that are too small (tracking pixels, icons, etc.)
      if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
        console.warn(
          `[image-dl] IMAGE_TOO_SMALL ${width}×${height}px url="${sourceUrl}"`,
        );
        return {
          success: false,
          originalUrl: sourceUrl,
          error: `IMAGE_TOO_SMALL: ${width}×${height}px (min ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT})`,
        };
      }

      let pipeline = sharp(buffer, { failOn: 'error' }).rotate();
      if (width > MAX_WIDTH) {
        pipeline = pipeline.resize(MAX_WIDTH, undefined, {
          withoutEnlargement: true,
          kernel: 'lanczos3',
        });
      }

      processedBuffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();

      // Re-read dimensions from output (resize may have changed them)
      const outMeta = await sharp(processedBuffer).metadata();
      width = outMeta.width ?? width;
      height = outMeta.height ?? height;
      ext = '.webp';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[image-dl] sharp error url="${sourceUrl}" error="${msg}"`);
      return { success: false, originalUrl: sourceUrl, error: `Image processing failed: ${msg}` };
    }
  }

  // 10. Also reject small GIFs
  if (width && height && (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT)) {
    return {
      success: false,
      originalUrl: sourceUrl,
      error: `IMAGE_TOO_SMALL (GIF): ${width}×${height}px`,
    };
  }

  // 11. Compute stored checksum (SHA-256 of the actual bytes that will be written to disk)
  const storedChecksum = crypto.createHash('sha256').update(processedBuffer).digest('hex');

  // 12. Build deterministic, checksum-based file path
  const { absDir, absPath, publicUrl } = buildStorePath(storedChecksum, ext);

  // 13. DB dedup: any existing article already has this stored file?
  const existingUrl = await findByStoredChecksum(storedChecksum);
  if (existingUrl) {
    console.log(
      `[image-dl] dedup hit checksum=${storedChecksum.slice(0, 8)} existing="${existingUrl}" article=${articleId ?? '-'}`,
    );
    return {
      success: true,
      originalUrl: sourceUrl,
      publicUrl: existingUrl,
      mimeType: ext === '.gif' ? 'image/gif' : 'image/webp',
      width,
      height,
      fileSize: processedBuffer.length,
      checksum: storedChecksum,
      deduplicated: true,
    };
  }

  // 14. Filesystem dedup: another concurrent worker may have already written this exact file.
  //     Because filenames are deterministic (checksum-based), the file content would be identical.
  const concurrentUrl = await integrityCheck(absPath);
  if (concurrentUrl) {
    console.log(
      `[image-dl] concurrent dedup hit path="${absPath}" article=${articleId ?? '-'}`,
    );
    return {
      success: true,
      originalUrl: sourceUrl,
      localPath: absPath,
      publicUrl: concurrentUrl,
      mimeType: ext === '.gif' ? 'image/gif' : 'image/webp',
      width,
      height,
      fileSize: processedBuffer.length,
      checksum: storedChecksum,
      deduplicated: true,
    };
  }

  // 15. Atomic write
  const tmpPath = absPath + '.tmp';
  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(tmpPath, processedBuffer);
    await fs.rename(tmpPath, absPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[image-dl] write error path="${absPath}" error="${msg}"`);
    return {
      success: false,
      originalUrl: sourceUrl,
      error: `Filesystem write failed: ${msg}`,
    };
  }

  const fileSize = processedBuffer.length;
  const mimeType = ext === '.gif' ? 'image/gif' : 'image/webp';

  console.log(
    `[image-dl] success article=${articleId ?? '-'} path="${publicUrl}" size=${fileSize} mime=${mimeType} checksum=${storedChecksum.slice(0, 8)}`,
  );

  return {
    success: true,
    originalUrl: sourceUrl,
    localPath: absPath,
    publicUrl,
    mimeType,
    width,
    height,
    fileSize,
    checksum: storedChecksum,
    deduplicated: false,
  };
}
