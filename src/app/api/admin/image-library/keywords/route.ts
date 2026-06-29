import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ωͰ-Ͽ0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const imageAssetId = searchParams.get('imageAssetId');
  if (!imageAssetId) return Response.json({ error: 'imageAssetId required' }, { status: 400 });

  const keywords = await prisma.imageKeyword.findMany({
    where: { imageAssetId },
    orderBy: [{ isPriority: 'desc' }, { keyword: 'asc' }],
  });

  return Response.json(keywords);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    imageAssetId?: string;
    keyword?: string;
    aliases?: string[];
    isPriority?: boolean;
    isOverride?: boolean;
  };

  const imageAssetId = body.imageAssetId?.trim();
  const rawKeyword = body.keyword?.trim();
  if (!imageAssetId || !rawKeyword) {
    return Response.json({ error: 'imageAssetId and keyword required' }, { status: 400 });
  }

  const keyword = norm(rawKeyword);
  const aliases = (body.aliases ?? []).map(norm).filter(Boolean);

  try {
    const record = await prisma.imageKeyword.upsert({
      where: { imageAssetId_keyword: { imageAssetId, keyword } },
      update: {
        aliases,
        isPriority: body.isPriority ?? false,
        isOverride: body.isOverride ?? false,
      },
      create: {
        imageAssetId,
        keyword,
        aliases,
        isPriority: body.isPriority ?? false,
        isOverride: body.isOverride ?? false,
      },
    });
    return Response.json(record, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const body = await req.json() as {
    aliases?: string[];
    isPriority?: boolean;
    isOverride?: boolean;
  };

  const aliases = body.aliases !== undefined
    ? (body.aliases as string[]).map(norm).filter(Boolean)
    : undefined;

  const record = await prisma.imageKeyword.update({
    where: { id },
    data: {
      ...(aliases !== undefined ? { aliases } : {}),
      ...(body.isPriority !== undefined ? { isPriority: body.isPriority } : {}),
      ...(body.isOverride !== undefined ? { isOverride: body.isOverride } : {}),
    },
  });
  return Response.json(record);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await prisma.imageKeyword.delete({ where: { id } });
  return Response.json({ ok: true });
}
