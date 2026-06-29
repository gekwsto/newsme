import { auth } from '@/lib/auth';
import { selectFeaturedImage } from '@/lib/images/select-featured-image';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    categorySlug?: string;
    articleTitle?: string;
    matchedKeywords?: string[];
  };

  const categorySlug = body.categorySlug?.trim();
  if (!categorySlug) return Response.json({ error: 'categorySlug required' }, { status: 400 });

  const categories = await prisma.imageCategory.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  const result = await selectFeaturedImage({
    categorySlug,
    matchedKeywords: body.matchedKeywords ?? [],
    articleTitle: body.articleTitle ?? '',
    debug: true,
  });

  return Response.json({ result, categories });
}
