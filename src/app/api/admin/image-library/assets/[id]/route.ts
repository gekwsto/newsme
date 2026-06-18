import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs/promises';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { isActive?: boolean };

  if (typeof body.isActive !== 'boolean') {
    return Response.json({ error: 'isActive boolean required' }, { status: 400 });
  }

  const asset = await prisma.imageAsset.update({
    where: { id },
    data: { isActive: body.isActive },
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
