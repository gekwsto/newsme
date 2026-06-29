import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs/promises';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    isActive?:     boolean;
    tagId?:        string | null;
    collectionId?: string | null;
    qualityScore?: number;
    seasonStart?:  string | null;
    seasonEnd?:    string | null;
    theme?:        string;
    altText?:      string;
    description?:  string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.isActive     === 'boolean') data.isActive     = body.isActive;
  if ('tagId'        in body)                 data.tagId        = body.tagId ?? null;
  if ('collectionId' in body)                 data.collectionId = body.collectionId ?? null;
  if (typeof body.qualityScore === 'number')  data.qualityScore = Math.min(10, Math.max(1, Math.round(body.qualityScore)));
  if ('seasonStart'  in body)                 data.seasonStart  = body.seasonStart ?? null;
  if ('seasonEnd'    in body)                 data.seasonEnd    = body.seasonEnd ?? null;
  if (typeof body.theme        === 'string')  data.theme        = body.theme;
  if (typeof body.altText      === 'string')  data.altText      = body.altText.trim();
  if ('description'  in body)                 data.description  = body.description ?? null;

  const asset = await prisma.imageAsset.update({
    where: { id },
    data,
    include: {
      tag:        { select: { name: true, slug: true } },
      collection: { select: { name: true, slug: true } },
      keywords:   { orderBy: [{ isPriority: 'desc' }, { keyword: 'asc' }] },
    },
  });
  return Response.json(asset);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const asset = await prisma.imageAsset.findUnique({ where: { id }, select: { localPath: true } });
  if (!asset) return Response.json({ error: 'Not found' }, { status: 404 });

  await prisma.imageAsset.delete({ where: { id } });

  try {
    await fs.unlink(asset.localPath);
  } catch {
    console.warn(`[image-library] could not delete file: ${asset.localPath}`);
  }

  return Response.json({ ok: true });
}
