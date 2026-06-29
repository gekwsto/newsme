import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const defaults = await prisma.imageCategoryDefault.findMany({
    include: {
      category: { select: { id: true, name: true, slug: true } },
      imageAsset: { select: { id: true, publicUrl: true, altText: true } },
    },
  });
  return Response.json(defaults);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { categoryId?: string; imageAssetId?: string };
  if (!body.categoryId || !body.imageAssetId) {
    return Response.json({ error: 'categoryId and imageAssetId required' }, { status: 400 });
  }

  const record = await prisma.imageCategoryDefault.upsert({
    where: { categoryId: body.categoryId },
    update: { imageAssetId: body.imageAssetId },
    create: { categoryId: body.categoryId, imageAssetId: body.imageAssetId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      imageAsset: { select: { id: true, publicUrl: true, altText: true } },
    },
  });
  return Response.json(record);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId');
  if (!categoryId) return Response.json({ error: 'categoryId required' }, { status: 400 });

  await prisma.imageCategoryDefault.delete({ where: { categoryId } });
  return Response.json({ ok: true });
}
