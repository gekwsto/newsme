import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId    = searchParams.get('categoryId')    || undefined;
  const tagId         = searchParams.get('tagId')         || undefined;
  const collectionId  = searchParams.get('collectionId')  || undefined;
  const theme         = searchParams.get('theme')         || undefined;
  const isActive      = searchParams.get('isActive');
  const hasKeywords   = searchParams.get('hasKeywords');
  const page          = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize      = Math.min(Number(searchParams.get('pageSize') || '40'), 100);

  const where = {
    ...(categoryId   ? { categoryId }   : {}),
    ...(tagId        ? { tagId }        : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(theme        ? { theme }        : {}),
    ...(isActive !== null ? { isActive: isActive !== 'false' } : {}),
    ...(hasKeywords === 'true' ? { keywords: { some: {} } } : {}),
    ...(hasKeywords === 'false' ? { keywords: { none: {} } } : {}),
  };

  const [assets, total] = await Promise.all([
    prisma.imageAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category:   { select: { name: true, slug: true } },
        tag:        { select: { name: true, slug: true } },
        collection: { select: { name: true, slug: true } },
        keywords:   { orderBy: [{ isPriority: 'desc' }, { keyword: 'asc' }] },
        _count:     { select: { usages: true } },
      },
    }),
    prisma.imageAsset.count({ where }),
  ]);

  return Response.json({ assets, total, page, pageSize });
}
