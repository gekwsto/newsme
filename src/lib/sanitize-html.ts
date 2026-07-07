/**
 * Server-safe HTML sanitizer — strips dangerous elements without external dependencies.
 * Allowed: structural/text tags. Removed: script, style, iframe, event handlers, javascript: URIs.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<\/?(iframe|object|embed|applet|form|input|button|select|meta|link|base)\b[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/(href|src|action)\s*=\s*["']?\s*(javascript|data):[^"'>\s]*/gi, '$1="#"');
}
