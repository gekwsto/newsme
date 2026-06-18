import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId');

  const tags = await prisma.imageTag.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { name: 'asc' },
    include: { _count: { select: { assets: true } } },
  });

  return Response.json(tags);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { name?: string; categoryId?: string };
  const name = body.name?.trim();
  const categoryId = body.categoryId?.trim();

  if (!name || !categoryId) return Response.json({ error: 'name and categoryId required' }, { status: 400 });

  const slug = slugify(name);
  if (!slug) return Response.json({ error: 'Invalid name' }, { status: 400 });

  const tag = await prisma.imageTag.create({
    data: { name, slug, categoryId },
  });

  return Response.json(tag, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await prisma.imageTag.delete({ where: { id } });
  return Response.json({ ok: true });
}
