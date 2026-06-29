import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';
import { z } from 'zod';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const OpportunitySchema = z.object({
  topic: z.string().min(1),
  primaryKeyword: z.string().min(1),
  articleType: z.enum(['what-is', 'guide', 'comparison', 'tutorial', 'explainer', 'best-of', 'analysis', 'faq']),
  category: z.string().min(1),
  seoScore: z.number().int().min(0).max(100),
  businessValue: z.number().int().min(0).max(100),
  difficulty: z.number().int().min(1).max(100),
  evergreenValue: z.number().int().min(0).max(100),
  fbReusability: z.number().int().min(0).max(100),
  overallScore: z.number().int().min(0).max(100),
  clusterTopics: z.array(z.string()).max(5),
  reasoning: z.string(),
});

const OpportunitiesResponseSchema = z.object({
  opportunities: z.array(OpportunitySchema),
});

export type GeneratedOpportunity = z.infer<typeof OpportunitySchema>;

// ─── Context for the engine ───────────────────────────────────────────────────

export interface OpportunityContext {
  categories: string[];
  topPerformingTopics: Array<{ topic: string; performanceScore: number }>;
  existingEvergreenKeywords: string[];
  recentTrendingTopics: string[];
  categoryStats: Array<{ name: string; articleCount: number }>;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateEvergreenOpportunities(
  context: OpportunityContext,
  count = 10,
): Promise<GeneratedOpportunity[]> {
  const client = getClient();

  const systemPrompt = `Είσαι SEO content strategist και editorial AI για το ελληνικό portal NewsMe.

Η αποστολή σου: να εντοπίζεις ΑΝΑΞΙΟΠΟΙΗΤΕΣ ευκαιρίες για evergreen περιεχόμενο που θα φέρει organic traffic για χρόνια.

━━━ ΔΕΔΟΜΕΝΑ ΑΠΟΔΟΣΗΣ ΘΕΜΑΤΩΝ ━━━

Θέματα με ΥΨΗΛΗ απόδοση στο κοινό μας:
${context.topPerformingTopics.length > 0
  ? context.topPerformingTopics.slice(0, 10).map((t) => `• ${t.topic} (score: ${t.performanceScore})`).join('\n')
  : '• Δεν υπάρχουν δεδομένα ακόμα'}

━━━ ΥΠΑΡΧΟΝ EVERGREEN ΠΕΡΙΕΧΟΜΕΝΟ (ΑΠΟΦΥΓΕ ΕΠΑΝΑΛΗΨΗ) ━━━

${context.existingEvergreenKeywords.length > 0
  ? context.existingEvergreenKeywords.map((k) => `• ${k}`).join('\n')
  : '• Δεν υπάρχουν ακόμα'}

━━━ ΤΡΕΧΟΥΣΕΣ ΤΑΣΕΙΣ ━━━

${context.recentTrendingTopics.length > 0
  ? context.recentTrendingTopics.slice(0, 8).map((t) => `• ${t}`).join('\n')
  : '• Κανένα δεδομένο'}

━━━ ΚΑΤΗΓΟΡΙΕΣ ━━━

${context.categories.join(', ')}

━━━ ΚΡΙΤΗΡΙΑ ΕΠΙΛΟΓΗΣ ━━━

Καλό evergreen άρθρο για ελληνικό κοινό:
✓ Ερωτήσεις που αναζητά ο κόσμος ("τι είναι", "πώς λειτουργεί", "ποιο είναι καλύτερο")
✓ Θέματα που ΔΕΝ γερνούν — valid για 2-5 χρόνια
✓ Σχετικό με AI, τεχνολογία, επενδύσεις, οικονομία (οι κατηγορίες μας)
✓ Keyword που υπάρχει αναζήτηση στα Ελληνικά
✓ Ανταγωνισμός χαμηλός/μέτριος (difficulty < 60 ιδανικά)
✓ Facebook reusable: μπορεί να γίνει engaging post

━━━ ΒΑΘΜΟΛΟΓΙΑ ━━━

seoScore: 0-100 — Εκτιμώμενο SEO potential (traffic από Google)
businessValue: 0-100 — Αξία για B2B/επαγγελματικό κοινό
difficulty: 1-100 — SEO difficulty (1=εύκολο, 100=πολύ ανταγωνιστικό)
evergreenValue: 0-100 — Πόσο "άχρονο" είναι (θα ισχύει σε 3 χρόνια;)
fbReusability: 0-100 — Δυνατότητα Facebook post engagement
overallScore: round(seoScore*0.30 + evergreenValue*0.30 + businessValue*0.20 + fbReusability*0.10 + (100-difficulty)*0.10)

━━━ OUTPUT FORMAT ━━━

{
  "opportunities": [
    {
      "topic": "Τίτλος του άρθρου (ελληνικά)",
      "primaryKeyword": "κύριο keyword (ελληνικά)",
      "articleType": "what-is|guide|comparison|tutorial|explainer|best-of|analysis|faq",
      "category": "Κατηγορία από τη λίστα",
      "seoScore": 75,
      "businessValue": 80,
      "difficulty": 35,
      "evergreenValue": 90,
      "fbReusability": 65,
      "overallScore": 77,
      "clusterTopics": ["5 σχετικά θέματα για content cluster"],
      "reasoning": "Γιατί αξίζει να γραφτεί — 1-2 προτάσεις"
    }
  ]
}`;

  const userPrompt = `Πρότεινε ${count} evergreen ευκαιρίες περιεχομένου για NewsMe.

Προτεραίωσε:
1. Θέματα που δεν έχουμε γράψει ακόμα
2. Θέματα που ταιριάζουν με τα high-performing topics μας
3. Keywords με υψηλό SEO potential και χαμηλό/μέτριο competition
4. Θέματα σχετικά με AI, τεχνολογία, επενδύσεις — τα core μας

ΣΗΜΑΝΤΙΚΟ: ΜΗΝ ξαναπροτείνεις keywords που υπάρχουν ήδη στο "ΥΠΑΡΧΟΝ EVERGREEN ΠΕΡΙΕΧΟΜΕΝΟ".`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 4000,
  });

  void logOpenAIUsage({
    service: 'evergreen',
    model: 'gpt-4o',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: 'Opportunity Discovery',
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const validated = OpportunitiesResponseSchema.safeParse(parsed);
    if (!validated.success) return [];
    return validated.data.opportunities;
  } catch {
    return [];
  }
}
