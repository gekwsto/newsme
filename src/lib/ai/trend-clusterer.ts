import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface ClusterInput {
  id: string;
  title: string;
  excerpt: string | null;
  sourceName: string;
  viralScore: number;
}

export interface ClusterOutput {
  topic: string;
  articleIds: string[];
  primaryArticleId: string;
}

export async function clusterArticles(articles: ClusterInput[]): Promise<ClusterOutput[]> {
  if (articles.length < 2) return [];
  const client = getClient();

  const list = articles
    .map((a) => `[${a.id}] "${a.title}" — ${a.sourceName}\n${(a.excerpt ?? '').slice(0, 120)}`)
    .join('\n\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Ομαδοποιείς ειδήσεις που αναφέρονται στο ΙΔΙΟ γεγονός/θέμα.

Κανόνες:
- Επιστρέφεις ΜΟΝΟ ομάδες με 2+ άρθρα (μεμονωμένα άρθρα αγνοούνται)
- "topic": σύντομο, περιγραφικό (2-5 λέξεις, ελληνικά ή αγγλικά αναλόγως του θέματος)
- "primaryArticleId": το πιο αξιόπιστο/πλήρες άρθρο της ομάδας (Reuters > BBC > άλλα)
- Αγνόησε διαφορετικές οπτικές του ίδιου θέματος — αν μιλάνε για το ίδιο γεγονός, ανήκουν στην ίδια ομάδα

Επιστρέφεις ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON:
{"clusters":[{"topic":"...","articleIds":["id1","id2"],"primaryArticleId":"id1"}]}`,
      },
      {
        role: 'user',
        content: `Ομαδοποίησε αυτά τα ${articles.length} άρθρα:\n\n${list}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 1500,
  });

  void logOpenAIUsage({
    service: 'clustering',
    model: 'gpt-4o-mini',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: `Trend Clustering (${articles.length} articles)`,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { clusters?: unknown[] };
    if (!Array.isArray(parsed.clusters)) return [];
    return parsed.clusters
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        topic: String(c.topic ?? '').trim(),
        articleIds: Array.isArray(c.articleIds) ? c.articleIds.map(String) : [],
        primaryArticleId: String(c.primaryArticleId ?? ''),
      }))
      .filter((c) => c.topic && c.articleIds.length >= 2 && c.primaryArticleId);
  } catch {
    return [];
  }
}

export function calcTrendScore(params: {
  articleCount: number;
  sourceCount: number;
  lastSeenAt: Date;
  avgViralScore: number;
}): number {
  const ageHours = (Date.now() - params.lastSeenAt.getTime()) / (1000 * 60 * 60);
  const recency = ageHours < 3 ? 1.0 : ageHours < 12 ? 0.7 : ageHours < 24 ? 0.4 : 0.1;
  return Math.min(
    100,
    Math.round(
      Math.min(params.sourceCount / 5, 1.0) * 40 +
      Math.min(params.articleCount / 8, 1.0) * 30 +
      recency * 20 +
      Math.min(params.avgViralScore / 100, 1.0) * 10
    )
  );
}
