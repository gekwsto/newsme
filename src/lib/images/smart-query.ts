import 'server-only';
import OpenAI from 'openai';

export interface SmartQueryResult {
  primaryQuery: string;
  alternativeQueries: string[];
  reason: string;
}

export interface ArticleForQuery {
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  categoryName: string;
  seoTitle?: string | null;
}

// ─── Entity → visual mapping ──────────────────────────────────────────────────

const ENTITY_VISUAL_MAP: Record<string, string> = {
  'elon musk':           'SpaceX rocket',
  'spacex':              'rocket launch space',
  'tesla':               'electric vehicle car',
  'openai':              'artificial intelligence neural',
  'chatgpt':             'AI chatbot interface',
  'google':              'data center technology',
  'alphabet':            'technology office campus',
  'nvidia':              'GPU chip processor',
  'microsoft':           'software technology office',
  'apple':               'smartphone technology',
  'amazon':              'warehouse logistics delivery',
  'meta':                'virtual reality social media',
  'facebook':            'social media smartphone',
  'bitcoin':             'Bitcoin cryptocurrency coin',
  'ethereum':            'blockchain cryptocurrency',
  'crypto':              'cryptocurrency trading chart',
  'inflation':           'supermarket prices grocery',
  'interest rates':      'central bank finance',
  'federal reserve':     'central bank economy',
  'stock market':        'stock exchange trading floor',
  'wall street':         'financial district New York',
  'recession':           'financial crisis economy',
  'startup':             'startup office team',
  'ipo':                 'stock exchange investors',
  'artificial intelligence': 'AI robot machine learning',
  'machine learning':    'neural network data',
  'climate change':      'renewable energy solar',
  'ukraine':             'war Europe conflict',
  'trump':               'politics Washington',
  'european union':      'EU flag Europe',
  'european central bank': 'central bank economy',
};

const CATEGORY_FALLBACKS: Record<string, string[]> = {
  // Internal categories (used by pipeline)
  'AI':                 ['artificial intelligence robot', 'machine learning neural network', 'AI technology future'],
  'Τεχνολογία':         ['technology innovation digital', 'computer software developer', 'tech startup office'],
  'Οικονομία':          ['financial markets trading', 'stock exchange economy', 'business finance money'],
  'Επιχειρηματικότητα': ['business meeting boardroom', 'startup entrepreneur team', 'company office'],
  'Ελλάδα':             ['Athens Greece cityscape', 'Greek Acropolis Mediterranean', 'Greece island sea'],
  'Κόσμος':             ['world globe diplomacy', 'international summit meeting', 'global news politics'],
  'Viral':              ['social media smartphone', 'trending internet content', 'viral video screen'],
  'Απόψεις':            ['newspaper editorial journalism', 'journalist writing media', 'opinion press'],
  'Αθλητικά':          ['sports stadium athlete', 'football game competition', 'sports training fitness'],
  'Καιρός':             ['weather storm clouds', 'rain nature sky', 'sun weather forecast'],
  // Display categories (frontend navigation)
  'Υγεία':              ['healthcare doctor hospital', 'medical research wellness', 'health medicine care'],
  'Media':              ['journalism broadcast media', 'news studio television', 'newspaper press journalism'],
  'Plus':               ['technology digital innovation', 'social media internet', 'tech lifestyle modern'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cap(q: string, max = 4): string {
  return q.trim().split(/\s+/).slice(0, max).join(' ');
}

function detectEntities(text: string): Array<{ key: string; visual: string }> {
  const lower = text.toLowerCase();
  const found: Array<{ key: string; visual: string }> = [];
  for (const [key, visual] of Object.entries(ENTITY_VISUAL_MAP)) {
    if (lower.includes(key)) found.push({ key, visual });
  }
  return found;
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function ruleBased(article: ArticleForQuery): SmartQueryResult {
  const allText = [
    article.title,
    article.excerpt ?? '',
    stripHtml(article.content).slice(0, 600),
    article.seoTitle ?? '',
    article.tags.join(' '),
  ].join(' ');

  const entities = detectEntities(allText);
  const catFallbacks = CATEGORY_FALLBACKS[article.categoryName]
    ?? ['news technology', 'business media', 'information society'];

  if (entities.length >= 1) {
    const primary = cap(entities[0].visual, 3);
    const alts: string[] = [];
    if (entities[1]) alts.push(cap(entities[1].visual, 3));
    alts.push(cap(catFallbacks[0], 3));
    if (catFallbacks[1]) alts.push(cap(catFallbacks[1], 3));

    return {
      primaryQuery: primary,
      alternativeQueries: [...new Set(alts)].filter((a) => a !== primary).slice(0, 3),
      reason: `Entity: ${entities.map((e) => e.key).slice(0, 2).join(', ')}`,
    };
  }

  return {
    primaryQuery: cap(catFallbacks[0], 3),
    alternativeQueries: catFallbacks.slice(1).map((q) => cap(q, 3)),
    reason: `Κατηγορία: ${article.categoryName}`,
  };
}

// ─── OpenAI-powered query builder ────────────────────────────────────────────

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function buildSmartImageQuery(article: ArticleForQuery): Promise<SmartQueryResult> {
  if (!process.env.OPENAI_API_KEY) return ruleBased(article);

  try {
    const summary = [
      `Title: ${article.title}`,
      article.excerpt ? `Excerpt: ${article.excerpt}` : '',
      `Category: ${article.categoryName}`,
      article.tags.length ? `Tags: ${article.tags.slice(0, 8).join(', ')}` : '',
      `Content: ${stripHtml(article.content).slice(0, 400)}`,
    ].filter(Boolean).join('\n');

    const response = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You generate Pexels stock photo search queries for news articles. ' +
            'Output valid JSON only. Each query must be 2-4 English words. ' +
            'Focus on visually concrete subjects, not abstract ideas. ' +
            'Replace person names with visual metaphors: ' +
            'Elon Musk → "SpaceX rocket", OpenAI → "artificial intelligence neural", ' +
            'Google → "data center technology", Nvidia → "GPU chip processor". ' +
            'Avoid names of people — stock photo sites rarely have them.',
        },
        {
          role: 'user',
          content:
            `Generate image search queries for this article:\n\n${summary}\n\n` +
            'Return JSON:\n' +
            '{"primaryQuery":"2-4 word English query","alternativeQueries":["q2","q3","q4"],"reason":"brief Greek explanation max 80 chars"}',
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as Partial<SmartQueryResult>;

    const primary = cap(parsed.primaryQuery ?? '', 4);
    if (!primary) return ruleBased(article);

    const alts = (parsed.alternativeQueries ?? [])
      .filter((q): q is string => typeof q === 'string' && q.length > 0)
      .map((q) => cap(q, 4))
      .filter((q) => q !== primary)
      .slice(0, 3);

    return {
      primaryQuery: primary,
      alternativeQueries: alts,
      reason: (typeof parsed.reason === 'string' ? parsed.reason : undefined) ?? 'AI query',
    };
  } catch {
    return ruleBased(article);
  }
}
