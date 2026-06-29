import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const FETCH_TIMEOUT_MS  = 12_000;
const MIN_WORD_COUNT    = 400;
const MAX_WORD_COUNT    = 6_000; // cap to avoid enormous prompts

const FETCH_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'Cache-Control':   'no-cache',
};

export type ArticleExtraction =
  | {
      success:   true;
      title:     string | undefined;
      body:      string;
      wordCount: number;
      method:    'readability';
    }
  | {
      success:   false;
      body:      '';
      wordCount: 0;
      method:    'failed';
      reason:    string;
    };

export async function extractArticleFromUrl(url: string): Promise<ArticleExtraction> {
  const fail = (reason: string): ArticleExtraction => ({
    success: false, body: '', wordCount: 0, method: 'failed', reason,
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let html: string;
    try {
      const res = await fetch(url, {
        signal:   controller.signal,
        headers:  FETCH_HEADERS,
        redirect: 'follow',
      });
      clearTimeout(timer);

      if (!res.ok) return fail(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('html')) return fail(`Non-HTML content-type: ${ct}`);

      html = await res.text();
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      return fail(msg.toLowerCase().includes('abort') ? 'Timeout' : msg);
    }

    // Parse with jsdom + Readability
    const dom  = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document, { charThreshold: 300 });
    const parsed = reader.parse();

    if (!parsed?.textContent) return fail('Readability returned null');

    // Normalise whitespace
    const text = parsed.textContent
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < MIN_WORD_COUNT) {
      return fail(`Too short after extraction: ${words.length} words (min ${MIN_WORD_COUNT})`);
    }

    // Cap length
    const body = words.length > MAX_WORD_COUNT
      ? words.slice(0, MAX_WORD_COUNT).join(' ') + '\n[...αποκοπή για συντομία]'
      : text;

    return {
      success:   true,
      title:     parsed.title || undefined,
      body,
      wordCount: Math.min(words.length, MAX_WORD_COUNT),
      method:    'readability',
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
