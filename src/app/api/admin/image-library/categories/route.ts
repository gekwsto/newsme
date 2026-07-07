import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zα-ω0-9-]/g, '')
    .replace(/-+/g, '-');
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const categories = await prisma.imageCategory.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { tags: true, assets: true } },
    },
  });

  return Response.json(categories);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

  const slug = slugify(name);
  if (!slug) return Response.json({ error: 'Invalid name' }, { status: 400 });

  const category = await prisma.imageCategory.create({
    data: { name, slug, description: body.description?.trim() || null },
  });

  return Response.json(category, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await prisma.imageCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
