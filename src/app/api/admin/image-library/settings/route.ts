import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.imageSelectionSettings.findFirst();
  return Response.json(settings ?? null);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, number>;

  const existing = await prisma.imageSelectionSettings.findFirst();

  const data = {
    categoryWeight:        Number(body.categoryWeight),
    subcategoryWeight:     Number(body.subcategoryWeight),
    priorityKeywordWeight: Number(body.priorityKeywordWeight),
    keywordWeight:         Number(body.keywordWeight),
    exactPhraseWeight:     Number(body.exactPhraseWeight),
    multiKeyword2Bonus:    Number(body.multiKeyword2Bonus),
    multiKeyword3Bonus:    Number(body.multiKeyword3Bonus),
    qualityScoreWeight:    Number(body.qualityScoreWeight),
    overrideBonus:         Number(body.overrideBonus),
    recentUsage1dPenalty:  Number(body.recentUsage1dPenalty),
    recentUsage3dPenalty:  Number(body.recentUsage3dPenalty),
    recentUsage7dPenalty:  Number(body.recentUsage7dPenalty),
    usageCountPenalty:     Number(body.usageCountPenalty),
    usageCountCap:         Number(body.usageCountCap),
  };

  const settings = existing
    ? await prisma.imageSelectionSettings.update({ where: { id: existing.id }, data })
    : await prisma.imageSelectionSettings.create({ data });

  return Response.json(settings);
}
