import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (!_client) _client = new OpenAI({ apiKey: key });
  return _client;
}

export interface ArticleInput {
  id: string;
  title: string;
  excerpt: string | null;
}

export interface ArticleScore {
  id: string;
  // Weighted sub-scores — max points shown in name
  greekInterestScore: number;   // 0-40
  searchPotentialScore: number; // 0-30
  facebookClickScore: number;   // 0-20
  evergreenScore: number;       // 0-10
  // Total (sum of above, 0-100)
  overallScore: number;
  // Auto-rejection
  rejected: boolean;
  rejectReason: string;
  // Editorial
  reasoning: string;
}

const BATCH_SIZE = 15;
const SCORING_MODEL = 'gpt-4o';

function slog(step: string, data?: unknown) {
  console.log(`[scoring] ${step}`, data ?? '');
}

function clamp(n: number, max = 100): number {
  return Math.min(max, Math.max(0, Math.round(n)));
}

// ── Score extraction — handles legacy + new field names ───────────────────
function extractTotalScore(item: Record<string, unknown>): number {
  // New format: explicit totalScore or overallScore
  for (const key of ['totalScore', 'total_score', 'overallScore', 'overall_score',
                      'importanceScore', 'importance_score', 'score', 'finalScore']) {
    const n = Number(item[key]);
    if (!isNaN(n) && n > 0) return n;
  }
  // Compute from new sub-scores
  const g = Number(item.greekInterestScore ?? item.greek_interest_score ?? 0);
  const s = Number(item.searchPotentialScore ?? item.search_potential_score ?? 0);
  const f = Number(item.facebookClickScore ?? item.facebook_click_score ?? 0);
  const e = Number(item.evergreenScore ?? item.evergreen_score ?? 0);
  if (g + s + f + e > 0) return g + s + f + e;
  // Legacy: compute from old sub-scores
  const viral = Number(item.viralScore ?? 0);
  const disc = Number(item.discussionScore ?? 0);
  const biz = Number(item.businessValueScore ?? 0);
  const seo = Number(item.searchPotential ?? 0);
  if (viral + disc + biz + seo > 0) {
    return Math.round(viral * 0.30 + disc * 0.25 + biz * 0.25 + seo * 0.20);
  }
  return 0;
}

function normalizeToHundred(raw: number): number {
  if (raw <= 0) return 0;
  if (raw <= 1) return clamp(raw * 100);
  if (raw <= 10) return clamp(raw * 10);
  return clamp(raw);
}

// ── Response array extractor — all known wrapper shapes ──────────────────
function extractArray(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['scores', 'results', 'articles', 'items', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [];
}

// ── Map AI array → ArticleScore[] with 3-strategy ID matching ────────────
function mapResultsToArticles(
  rawArr: Record<string, unknown>[],
  articles: ArticleInput[],
  formatTag: string
): { scores: ArticleScore[]; fallbackUsed: string | null } {
  if (rawArr.length === 0) return { scores: [], fallbackUsed: null };

  const scores: ArticleScore[] = [];
  let fallbackUsed: string | null = null;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const idxStr = String(i + 1);

    // Strategy 1: numeric index
    let match = rawArr.find((r) => {
      const rid = String(r.id ?? r.idx ?? r.index ?? '');
      return rid === idxStr || rid === String(i);
    });

    // Strategy 2: title match
    if (!match) {
      const titleLower = article.title.toLowerCase().slice(0, 40);
      match = rawArr.find((r) => {
        const t = String(r.title ?? r.headline ?? '').toLowerCase();
        return t.includes(titleLower) || titleLower.includes(t.slice(0, 30));
      });
      if (match) fallbackUsed = `title-match (${formatTag})`;
    }

    // Strategy 3: positional
    if (!match && i < rawArr.length) {
      match = rawArr[i];
      fallbackUsed = `positional (${formatTag})`;
    }

    if (!match) continue;

    const isRejected = Boolean(match.rejected) || match.rejected === 'true';
    const rawTotal = isRejected ? 0 : extractTotalScore(match);
    const total = normalizeToHundred(rawTotal);

    // Sub-scores: normalize each to its max
    const rawG = Number(match.greekInterestScore ?? match.greek_interest_score ?? 0);
    const rawS = Number(match.searchPotentialScore ?? match.search_potential_score ?? 0);
    const rawF = Number(match.facebookClickScore ?? match.facebook_click_score ?? 0);
    const rawE = Number(match.evergreenScore ?? match.evergreen_score ?? 0);

    scores.push({
      id: article.id,
      greekInterestScore: clamp(rawG, 40),
      searchPotentialScore: clamp(rawS, 30),
      facebookClickScore: clamp(rawF, 20),
      evergreenScore: clamp(rawE, 10),
      overallScore: total,
      rejected: isRejected,
      rejectReason: String(match.rejectReason ?? match.reject_reason ?? match.reason ?? ''),
      reasoning: String(match.reasoning ?? match.reason ?? match.explanation ?? ''),
    });
  }

  return { scores, fallbackUsed };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function scoreArticles(articles: ArticleInput[]): Promise<ArticleScore[]> {
  if (articles.length === 0) return [];
  const client = getClient();
  const results: ArticleScore[] = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchResults = await scoreBatch(client, batch);
    results.push(...batchResults);
  }
  return results;
}

async function scoreBatch(client: OpenAI, articles: ArticleInput[]): Promise<ArticleScore[]> {
  const list = articles
    .map(
      (a, i) =>
        `${i + 1}. ID:${i + 1}\nΤίτλος: ${a.title}\nΠερίληψη: ${(a.excerpt ?? '').slice(0, 200) || '(κενή)'}`
    )
    .join('\n\n');

  const systemPrompt = `Είσαι editorial AI για το ελληνικό news portal NewsMe. Αξιολογείς ειδήσεις για ελληνικό κοινό στο Facebook.

═══════════════════════════════════════
ΑΥΤΟΜΑΤΗ ΑΠΟΡΡΙΨΗ — βάλε rejected:true, totalScore:0
═══════════════════════════════════════
• Τοπικά αμερικανικά/βρετανικά/αυστραλιανά περιστατικά (τροχαία, εγκλήματα, τοπικές εκλογές)
• Θάνατοι ή σκάνδαλα εντελώς άγνωστων celebrities στην Ελλάδα
• Funding rounds <$50M άγνωστων startups
• Niche B2B tech/enterprise ειδήσεις χωρίς ευρύ ενδιαφέρον (π.χ. "Company X updates its SaaS dashboard")
• Αθλητικά εκτός Ελλάδας εκτός αν παγκόσμιο γεγονός (World Cup, Olympics)
• Press releases εταιρειών για routine ανακοινώσεις
• Τοπικά δελτία τύπου δήμων, υπουργείων (εκτός αν σημαντική πολιτική απόφαση)

═══════════════════════════════════════
ΕΝΙΣΧΥΜΕΝΑ ΘΕΜΑΤΑ — δώσε υψηλούς βαθμούς
═══════════════════════════════════════
• Ελλάδα, Κύπρος, ΕΕ, Βαλκάνια, Τουρκία-Ελλάδα σχέσεις
• Ελληνική πολιτική: Μητσοτάκης, Τσίπρας, Ανδρουλάκης, κυβέρνηση, βουλή
• Ελληνική οικονομία: ΑΕΠ, ανεργία, φόροι, ακίνητα, αγορά εργασίας
• AI & Tech giants: OpenAI, ChatGPT, Claude, Gemini, Grok, Apple, Google, Meta, Microsoft, Tesla, Nvidia, Amazon
• Γεωπολιτική: πόλεμος Ουκρανίας, Μέση Ανατολή, Κίνα-ΗΠΑ, Τραμπ, ΝΑΤΟ
• Ενέργεια: πετρέλαιο, φυσικό αέριο, ΑΠΕ, τιμές ρεύματος
• Αγορές & επενδύσεις: χρηματιστήριο, κρυπτονομίσματα, Bitcoin, real estate
• Κλιματική αλλαγή, φυσικές καταστροφές

═══════════════════════════════════════
ΒΑΘΜΟΛΟΓΙΑ (0-100 συνολικά)
═══════════════════════════════════════

1. greekInterestScore — MAX 40 πόντοι
   Πόσο ενδιαφέρει ελληνικό κοινό;
   35-40: άμεσα αφορά Ελλάδα (πολιτική, οικονομία, κοινωνία)
   25-34: Ευρώπη ή διεθνές με άμεσο ελληνικό αντίκτυπο
   15-24: παγκόσμιο θέμα που ενδιαφέρει Έλληνες (AI, tech giants, γεωπολιτική)
   5-14: περιορισμένο ελληνικό ενδιαφέρον
   0-4: καθαρά τοπικό/ξένο χωρίς σχέση με Ελλάδα

2. searchPotentialScore — MAX 30 πόντοι
   Πιθανότητα αναζήτησης στο Google από Έλληνες;
   25-30: trending keywords + γνωστά πρόσωπα (Μητσοτάκης, Μασκ, Τραμπ)
   18-24: γνωστές εταιρείες (Apple, Google, OpenAI, Tesla)
   10-17: θέματα με SEO αξία (AI, crypto, ενέργεια)
   3-9: γενικό ενδιαφέρον χωρίς ισχυρό SEO
   0-2: άγνωστα πρόσωπα, niche

3. facebookClickScore — MAX 20 πόντοι
   Θα κάνει κλικ ο μέσος Έλληνας χρήστης;
   17-20: high-click (scandal, surprising fact, controversy, fear/anger trigger)
   12-16: broad ενδιαφέρον, θα κάνει scroll-stop
   6-11: κάποιο ενδιαφέρον
   0-5: institutional/ρουτίνα, θα το προσπεράσει

4. evergreenScore — MAX 10 πόντοι
   Θα φέρνει traffic εβδομάδες αργότερα;
   8-10: evergreen (explainer, how-to, analysis)
   4-7: κάποια αντοχή
   0-3: breaking news, εφήμερο

totalScore = greekInterestScore + searchPotentialScore + facebookClickScore + evergreenScore

═══════════════════════════════════════
ΜΟΡΦΗ JSON ΑΠΟΚΡΙΣΗ (χωρίς markdown):
═══════════════════════════════════════
{"scores":[{"id":"1","rejected":false,"rejectReason":"","greekInterestScore":25,"searchPotentialScore":20,"facebookClickScore":14,"evergreenScore":6,"totalScore":65,"reasoning":"..."}]}

Για απορριπτόμενα: {"id":"2","rejected":true,"rejectReason":"τοπικό αμερικανικό περιστατικό","greekInterestScore":0,"searchPotentialScore":0,"facebookClickScore":0,"evergreenScore":0,"totalScore":0,"reasoning":""}

ΚΡΙΤΙΚΟ: Το "id" πρέπει να είναι ακριβώς ο αριθμός που δίνεται (1, 2, 3...).`;

  slog('scoring_api_called', {
    model: SCORING_MODEL,
    items: articles.length,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });

  let rawContent: string | null = null;

  try {
    const response = await client.chat.completions.create({
      model: SCORING_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Αξιολόγησε τα παρακάτω ${articles.length} άρθρα:\n\n${list}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3500,
    });

    void logOpenAIUsage({
      service: 'scoring',
      model: SCORING_MODEL,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      operation: `Greek Scoring (${articles.length} articles)`,
    });

    rawContent = response.choices[0]?.message?.content ?? null;

    slog('scoring_response_received', {
      finishReason: response.choices[0]?.finish_reason,
      hasContent: Boolean(rawContent),
      contentLength: rawContent?.length ?? 0,
      preview: rawContent?.slice(0, 300),
    });

    if (!rawContent) {
      slog('scoring_parse_error', { reason: 'empty_content' });
      return [];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog('scoring_api_error', { error: msg, model: SCORING_MODEL });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    slog('scoring_parse_error', {
      reason: 'json_parse_failed',
      error: err instanceof Error ? err.message : String(err),
      rawPreview: rawContent.slice(0, 300),
    });
    return [];
  }

  const rawArr = extractArray(parsed);
  slog('scoring_array_extracted', {
    arrayLength: rawArr.length,
    firstItemKeys: rawArr[0] ? Object.keys(rawArr[0]) : [],
    firstItemId: rawArr[0]?.id,
  });

  if (rawArr.length === 0) {
    slog('scoring_parse_error', {
      reason: 'no_array_found',
      parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : typeof parsed,
      rawPreview: rawContent.slice(0, 300),
    });
    return [];
  }

  const { scores, fallbackUsed } = mapResultsToArticles(rawArr, articles, 'main');

  if (fallbackUsed) slog('fallback_used', { strategy: fallbackUsed });

  slog('scoring_parse_success', {
    parsedCount: rawArr.length,
    mappedCount: scores.length,
    fallbackUsed,
    rejected: scores.filter((s) => s.rejected).length,
    passed: scores.filter((s) => !s.rejected).length,
    scores: scores.map((s) => ({
      overall: s.overallScore,
      greek: s.greekInterestScore,
      search: s.searchPotentialScore,
      fb: s.facebookClickScore,
      evergreen: s.evergreenScore,
      rejected: s.rejected,
      rejectReason: s.rejectReason || undefined,
    })),
  });

  slog('parsed_scores_count', { count: scores.length, ofRequested: articles.length });

  return scores;
}
