import { prisma } from '@/lib/db';
import { ArticleStatus } from '@/generated/prisma/enums';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    await prisma.article.updateMany({
      where: { slug, status: ArticleStatus.PUBLISHED },
      data: { views: { increment: 1 } },
    });
  } catch {
    // silent — don't break the page if this fails
  }

  return new Response(null, { status: 204 });
}
