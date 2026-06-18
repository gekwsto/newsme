import { auth } from '@/lib/auth';
import { importFromPexels } from '@/lib/images/pexels';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    categoryId?: string;
    tagId?: string;
    query?: string;
    perPage?: number;
  };

  const categoryId = body.categoryId?.trim();
  const query = body.query?.trim();

  if (!categoryId || !query) {
    return Response.json({ error: 'categoryId and query are required' }, { status: 400 });
  }

  const perPage = Math.min(Math.max(Number(body.perPage) || 20, 1), 80);

  try {
    const result = await importFromPexels({
      categoryId,
      tagId: body.tagId || null,
      query,
      perPage,
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    console.error('[import-pexels] error:', err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
