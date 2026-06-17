import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const articles = await prisma.discoveredArticle.findMany({
    where: {
      humanVerdict: { in: ['accepted', 'rejected'] },
    },
    orderBy: { humanVerdictAt: 'asc' },
    select: {
      title: true,
      url: true,
      excerpt: true,
      humanVerdict: true,
      humanVerdictAt: true,
      source: { select: { name: true, country: true, language: true } },
      category: { select: { name: true } },
      score: {
        select: {
          overallScore: true,
          greekInterestScore: true,
          facebookClickScore: true,
          searchPotentialScore: true,
          evergreenScore: true,
          rejected: true,
          rejectReason: true,
        },
      },
    },
  });

  if (articles.length === 0) {
    return NextResponse.json({ error: 'No labeled articles found' }, { status: 404 });
  }

  const lines = articles.map((a) =>
    JSON.stringify({
      title: a.title,
      excerpt: a.excerpt ?? '',
      source: a.source.name,
      source_country: a.source.country,
      source_language: a.source.language,
      category: a.category.name,
      url: a.url,
      scores: a.score
        ? {
            overall: a.score.overallScore,
            greek_interest: a.score.greekInterestScore,
            facebook_click: a.score.facebookClickScore,
            search_potential: a.score.searchPotentialScore,
            evergreen: a.score.evergreenScore,
            ai_rejected: a.score.rejected,
            ai_reject_reason: a.score.rejectReason ?? null,
          }
        : null,
      label: a.humanVerdict === 'accepted' ? 1 : 0,
      labeled_at: a.humanVerdictAt?.toISOString() ?? null,
    })
  );

  const output = lines.join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `article-review-labels-${date}-${articles.length}ex.jsonl`;

  return new NextResponse(output, {
    status: 200,
    headers: {
      'Content-Type': 'application/jsonl',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Labeled-Count': String(articles.length),
      'X-Accepted-Count': String(articles.filter((a) => a.humanVerdict === 'accepted').length),
      'X-Rejected-Count': String(articles.filter((a) => a.humanVerdict === 'rejected').length),
    },
  });
}
