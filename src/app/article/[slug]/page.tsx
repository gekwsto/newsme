import { notFound, permanentRedirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function OldArticleRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await prisma.article.findUnique({
    where: { slug },
    select: { category: { select: { slug: true } } },
  });
  if (!article) notFound();
  permanentRedirect(`/${article.category.slug}/${slug}`);
}
