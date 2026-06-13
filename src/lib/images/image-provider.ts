import 'server-only';
import OpenAI from 'openai';
import { logEvent, SERVICE } from '@/lib/monitoring/events';

let _client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface GeneratedImage {
  url: string;
  provider: string;
  model: string;
  cost: number;
}

const COST_MAP: Record<string, number> = {
  'dall-e-3-standard-1024x1024': 0.04,
  'dall-e-3-hd-1024x1024': 0.08,
  'dall-e-3-standard-1792x1024': 0.08,
  'dall-e-3-hd-1792x1024': 0.12,
  'dall-e-2-1024x1024': 0.018,
  'dall-e-2-512x512': 0.018,
  'dall-e-2-256x256': 0.016,
};

const CATEGORY_VISUALS: Record<string, string> = {
  ai: 'neural networks, glowing circuits, abstract data flows, futuristic technology',
  τεχνολογία: 'abstract technology, circuits, digital screens, geometric patterns',
  οικονομία: 'abstract financial charts, coins, market graphs, economic symbols',
  επιχειρηματικότητα: 'abstract business growth, network nodes, startup concepts',
  πολιτική: 'abstract civic symbols, scales of justice, government architecture',
  κόσμος: 'abstract global map, earth, international connectivity',
  ελλάδα: 'abstract Mediterranean, Aegean blue, architectural elements',
  viral: 'abstract social connections, trending waves, network patterns',
  απόψεις: 'abstract thought bubbles, perspective lines, editorial concepts',
};

function buildEditorialPrompt(title: string, category: string, tags: string[]): string {
  const catLower = category.toLowerCase();
  const visuals = CATEGORY_VISUALS[catLower] || tags.slice(0, 3).join(', ') || 'abstract editorial, news, information';
  return (
    `Editorial illustration for a Greek news article. Topic: "${title.slice(0, 80)}". ` +
    `Visual style: abstract, flat design, symbolic editorial illustration. ` +
    `Imagery to incorporate: ${visuals}. ` +
    `Rules: NO real people, NO faces, NO logos, NO brand names, NO text, NO copyrighted characters. ` +
    `Use abstract shapes, icons, and symbolic metaphors. Clean, modern, suitable for news publication.`
  );
}

export async function generateArticleImage(
  title: string,
  category: string,
  tags: string[]
): Promise<GeneratedImage> {
  const model = process.env.IMAGE_MODEL || 'dall-e-3';
  const quality = (process.env.IMAGE_QUALITY || 'standard') as 'standard' | 'hd';
  const size = (process.env.IMAGE_SIZE || '1024x1024') as '1024x1024' | '1024x1792' | '1792x1024' | '256x256' | '512x512';

  const prompt = buildEditorialPrompt(title, category, tags);
  const costKey = `${model}-${quality}-${size}`;
  const cost = COST_MAP[costKey] ?? 0.04;

  const response = await getClient().images.generate({
    model,
    prompt,
    n: 1,
    size,
    ...(model === 'dall-e-3' ? { quality } : {}),
  });

  const imgData = response.data?.[0];
  const url = imgData?.url;
  if (!url) {
    if (imgData?.b64_json) throw new Error('OpenAI returned base64 image — set IMAGE_MODEL=dall-e-3 for URL output');
    throw new Error('No image URL returned from OpenAI');
  }

  void logEvent({
    service: SERVICE.OPENAI,
    type: 'image_generated',
    status: 'OK',
    message: `Generated image with ${model} — estimated cost $${cost}`,
    metadata: { model, quality, size, cost, titleSnippet: title.slice(0, 60) },
  });

  return { url, provider: 'openai', model, cost };
}
