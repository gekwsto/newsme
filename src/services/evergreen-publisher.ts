import { revalidatePath } from 'next/cache';
import { markTrainingPublished } from '@/lib/training-capture';
import { prisma } from '@/lib/db';
import { ArticleStatus, ArticleType, SourceType } from '@/generated/prisma/enums';
import { logEvent, SERVICE } from '@/lib/monitoring/events';

const PUBLISH_HOURS_ATHENS = [8, 12, 16, 20];

function getAthensHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('el-GR', {
      timeZone: 'Europe/Athens',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10,
  );
}

function getAthensHourStart(): Date {
  const now = new Date();
  const tz = 'Europe/Athens';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00:00`;
  const athensHourStart = new Date(localStr + '+00:00');

  const offset = now.getTime() - new Date(
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(now),
  ).getTime();

  return new Date(athensHourStart.getTime() - offset);
}

export interface PublisherResult {
  ok: boolean;
  published: number;
  skipped: boolean;
  skipReason?: string;
  articleId?: string;
  articleTitle?: string;
  articleSlug?: string;
}

export async function runEvergreenPublisher(force = false): Promise<PublisherResult> {
  const athensHour = getAthensHour();

  if (!force && !PUBLISH_HOURS_ATHENS.includes(athensHour)) {
    return {
      ok: true,
      published: 0,
      skipped: true,
      skipReason: `Not a publish hour (Athens: ${athensHour}:xx). Publish at: ${PUBLISH_HOURS_ATHENS.join(', ')}:00`,
    };
  }

  if (!force) {
    const hourStart = getAthensHourStart();
    const alreadyPublished = await prisma.article.findFirst({
      where: {
        articleType: ArticleType.EVERGREEN,
        sourceType: SourceType.AI_GENERATED,
        status: ArticleStatus.PUBLISHED,
        publishedAt: { gte: hourStart },
      },
      select: { id: true },
    });

    if (alreadyPublished) {
      return {
        ok: true,
        published: 0,
        skipped: true,
        skipReason: 'Already published an evergreen article in this hour window',
      };
    }
  }

  const draft = await prisma.article.findFirst({
    where: {
      articleType: ArticleType.EVERGREEN,
      sourceType: SourceType.AI_GENERATED,
      status: ArticleStatus.DRAFT,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, slug: true, content: true, category: { select: { slug: true } } },
  });

  if (!draft) {
    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'evergreen_publish_skip',
      status: 'WARNING',
      message: 'Evergreen publisher: no DRAFT articles available',
      metadata: { athensHour, force },
    });
    return {
      ok: true,
      published: 0,
      skipped: true,
      skipReason: 'No DRAFT evergreen articles in queue',
    };
  }

  await prisma.article.update({
    where: { id: draft.id },
    data: {
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  void markTrainingPublished(draft.id, draft.title, draft.content);
  revalidatePath('/');
  revalidatePath('/articles');
  revalidatePath(`/${draft.category.slug}/${draft.slug}`);
  revalidatePath('/sitemap.xml');
  revalidatePath('/sitemap-evergreen.xml');

  void logEvent({
    service: SERVICE.SCHEDULER,
    type: 'evergreen_published',
    status: 'OK',
    message: `Evergreen published: "${draft.title}" (${draft.slug})`,
    metadata: { articleId: draft.id, athensHour, force },
  });

  return {
    ok: true,
    published: 1,
    skipped: false,
    articleId: draft.id,
    articleTitle: draft.title,
    articleSlug: draft.slug,
  };
}
