import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createAndSendCampaign, createArticleCampaign } from '@/lib/push/campaign-service';
import { isVapidConfigured } from '@/lib/push/vapid-config';

export const runtime = 'nodejs';

const SendSchema = z.union([
  z.object({
    articleId: z.string().min(1).max(128),
    title: z.string().max(100).optional(),
    body: z.string().max(200).optional(),
    imageUrl: z.string().url().max(2048).nullable().optional(),
  }),
  z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(200),
    targetUrl: z.string().url().max(2048),
    imageUrl: z.string().url().max(2048).nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return Response.json(
      { error: 'VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    let result;

    if ('articleId' in parsed.data) {
      result = await createArticleCampaign(parsed.data.articleId, {
        title: parsed.data.title,
        body: parsed.data.body,
        imageUrl: parsed.data.imageUrl,
      });
    } else {
      result = await createAndSendCampaign({
        title: parsed.data.title,
        body: parsed.data.body,
        targetUrl: parsed.data.targetUrl,
        imageUrl: parsed.data.imageUrl,
      });
    }

    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Campaign failed';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
