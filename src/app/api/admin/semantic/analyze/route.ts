import { auth } from '@/lib/auth';
import { analyzeArticle } from '@/lib/semantic-service-db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { title?: string; excerpt?: string; body?: string };

  if (!body.title?.trim() && !body.excerpt?.trim()) {
    return Response.json({ error: 'title or excerpt required' }, { status: 400 });
  }

  const result = await analyzeArticle({
    title: body.title ?? '',
    excerpt: body.excerpt ?? '',
    body: body.body,
  });

  return Response.json(result);
}
