import { prisma } from '@/lib/db';

export const SERVICE = {
  RSS: 'rss',
  SCORING: 'scoring',
  CLUSTERING: 'clustering',
  ARTICLE: 'article',
  FACEBOOK: 'facebook',
  SCHEDULER: 'scheduler',
  ANALYTICS: 'analytics',
  OPENAI: 'openai',
} as const;

export const OPENAI_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-5':        { input: 10 / 1e6,   output: 40 / 1e6  },
  'gpt-5-mini':   { input: 1.5 / 1e6,  output: 6 / 1e6   },
  'gpt-4o':       { input: 5 / 1e6,    output: 15 / 1e6  },
  'gpt-4o-mini':  { input: 0.15 / 1e6, output: 0.60 / 1e6 },
};

export async function logEvent(params: {
  service: string;
  type: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.systemEvent.create({
      data: {
        service: params.service,
        type: params.type,
        status: params.status,
        message: params.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: params.metadata as any,
      },
    });
  } catch {
    // logging must never throw or disrupt the main operation
  }
}

export async function getMonthlyAiCosts(): Promise<{
  evergreen: number;
  news: number;
  total: number;
  byModel: Record<string, { calls: number; costUsd: number }>;
}> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const events = await prisma.systemEvent.findMany({
    where: {
      service: SERVICE.OPENAI,
      type: 'usage',
      createdAt: { gte: start },
    },
    select: { metadata: true },
  });

  let evergreen = 0;
  let news = 0;
  const byModel: Record<string, { calls: number; costUsd: number }> = {};

  for (const e of events) {
    if (!e.metadata || typeof e.metadata !== 'object') continue;
    const m = e.metadata as Record<string, unknown>;
    const cost = typeof m.estimatedCostUsd === 'number' ? m.estimatedCostUsd : 0;
    const model = typeof m.model === 'string' ? m.model : 'unknown';
    const originService = typeof m.originService === 'string' ? m.originService : '';

    if (originService === 'evergreen') evergreen += cost;
    else if (originService === 'article') news += cost;

    if (!byModel[model]) byModel[model] = { calls: 0, costUsd: 0 };
    byModel[model].calls++;
    byModel[model].costUsd = parseFloat((byModel[model].costUsd + cost).toFixed(5));
  }

  return {
    evergreen: parseFloat(evergreen.toFixed(4)),
    news: parseFloat(news.toFixed(4)),
    total: parseFloat((evergreen + news).toFixed(4)),
    byModel,
  };
}

export async function logOpenAIUsage(params: {
  service: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  operation: string;
}): Promise<void> {
  const cost = OPENAI_COSTS[params.model] ?? OPENAI_COSTS['gpt-4o'];
  const estimatedCostUsd =
    params.inputTokens * cost.input + params.outputTokens * cost.output;
  await logEvent({
    service: SERVICE.OPENAI,
    type: 'usage',
    status: 'OK',
    message: `${params.operation} — ${params.model}`,
    metadata: {
      originService: params.service,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 100000) / 100000,
    },
  });
}
