import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId') ?? undefined;

  const collections = await prisma.imageCollection.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { name: 'asc' },
    include: { _count: { select: { assets: true } } },
  });
  return Response.json(collections);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { name?: string; categoryId?: string; description?: string };
  const name = body.name?.trim();
  const categoryId = body.categoryId?.trim();
  if (!name || !categoryId) {
    return Response.json({ error: 'name and categoryId required' }, { status: 400 });
  }

  const slug = slugify(name);
  try {
    const collection = await prisma.imageCollection.create({
      data: { name, slug, categoryId, description: body.description?.trim() || null },
      include: { _count: { select: { assets: true } } },
    });
    return Response.json(collection, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await prisma.imageCollection.delete({ where: { id } });
  return Response.json({ ok: true });
}
