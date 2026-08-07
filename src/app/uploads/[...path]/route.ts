/**
 * Runtime filesystem handler for /uploads/* assets.
 *
 * Why this exists: Next.js production static-file serving is resolved at build
 * time. Files created at runtime (downloaded article images) are invisible to
 * the built-in static server. This route handler reads from the filesystem at
 * request time, making runtime-created uploads immediately available without a
 * rebuild or restart.
 *
 * Security:
 *  - Per-segment allowlist (rejects .., ., null bytes, backslashes, drive letters)
 *  - path.resolve + UPLOADS_ROOT boundary check (catches encoded traversal)
 *  - lstat (not stat) to detect and reject symlinks
 *  - Extension allowlist — only image types are served
 *  - No error detail exposed to the client
 */

import type { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Constants ──────────────────────────────────────────────────────────────────

// process.cwd() is correct for `next start` (cwd = /app).
// For `node .next/standalone/server.js`, that script does process.chdir(__dirname)
// which shifts cwd to .next/standalone/ — set UPLOADS_ROOT=/app/public/uploads in
// the environment in that case.
const UPLOADS_ROOT =
  process.env.UPLOADS_ROOT ?? path.join(process.cwd(), 'public', 'uploads');

const ALLOWED_MIME: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.avif': 'image/avif',
  '.svg':  'image/svg+xml',
};

// All uploads use content-hash filenames — immutable is safe.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

// ── Core handler ───────────────────────────────────────────────────────────────

async function handle(
  request: NextRequest,
  segments: string[],
  withBody: boolean,
): Promise<Response> {
  // 1. Per-segment validation — reject anything that looks like traversal.
  for (const seg of segments) {
    if (
      !seg ||
      seg === '.' ||
      seg === '..' ||
      seg.includes('\0') ||
      seg.includes('\\') ||
      /^[a-zA-Z]:/.test(seg) // Windows drive letters
    ) {
      return new Response(null, { status: 404 });
    }
  }

  // 2. Build the candidate path and resolve it to an absolute path.
  //    path.resolve handles any remaining encoded or residual traversal.
  const candidate = path.join(UPLOADS_ROOT, ...segments);
  const resolved  = path.resolve(candidate);
  const rootResolved = path.resolve(UPLOADS_ROOT);

  // 3. Boundary check — resolved path must be inside the uploads root.
  const within =
    resolved === rootResolved ||
    resolved.startsWith(rootResolved + path.sep);

  if (!within) {
    return new Response(null, { status: 404 });
  }

  // 4. Extension allowlist.
  const ext = path.extname(resolved).toLowerCase();
  const mimeType = ALLOWED_MIME[ext];
  if (!mimeType) {
    return new Response(null, { status: 404 });
  }

  // 5. lstat — does NOT follow symlinks.
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(resolved);
  } catch {
    return new Response(null, { status: 404 });
  }

  // Reject symlinks regardless of their target.
  if (stat.isSymbolicLink()) {
    return new Response(null, { status: 404 });
  }

  if (!stat.isFile() || stat.size === 0) {
    return new Response(null, { status: 404 });
  }

  // 6. Build response headers.
  //    ETag is size+mtime — cheap, no full-file hash needed.
  const etag         = `"${stat.size}-${stat.mtimeMs}"`;
  const lastModified = stat.mtime.toUTCString();

  const headers = new Headers({
    'Content-Type':   mimeType,
    'Content-Length': String(stat.size),
    'Cache-Control':  CACHE_CONTROL,
    'ETag':           etag,
    'Last-Modified':  lastModified,
  });

  // 7. Conditional request support.
  const ifNoneMatch    = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }
  if (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime) {
    return new Response(null, { status: 304, headers });
  }

  // 8. HEAD — headers only, no body.
  if (!withBody) {
    return new Response(null, { status: 200, headers });
  }

  // 9. GET — read and return file.
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), { status: 200, headers });
}

// ── Exported HTTP methods ──────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  return handle(request, segments, true);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  return handle(request, segments, false);
}
