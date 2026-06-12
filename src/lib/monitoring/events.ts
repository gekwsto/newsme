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

const OPENAI_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o':      { input: 5 / 1e6,    output: 15 / 1e6 },
  'gpt-4o-mini': { input: 0.15 / 1e6, output: 0.60 / 1e6 },
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
