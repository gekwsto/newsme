import { prisma } from '@/lib/db';

/**
 * Picks a random active Author for pipeline-generated articles.
 * Fallback chain: random active → default → null.
 */
export async function pickDisplayAuthor(): Promise<string | null> {
  const active = await prisma.author.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (active.length > 0) {
    return active[Math.floor(Math.random() * active.length)].id;
  }

  const fallback = await prisma.author.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });

  return fallback?.id ?? null;
}
