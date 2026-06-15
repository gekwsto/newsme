import { prisma } from '@/lib/db';
import { fetchFeed } from '@/lib/rss/fetcher';
import { computeLocalScore } from '@/lib/content-filter';
import { scoreArticles } from '@/lib/ai/content-scorer';
import { generateArticleContent } from '@/lib/ai/content-generator';
import { FacebookClient } from '@/lib/social/facebook';
import { logEvent, logOpenAIUsage, getMonthlyAiCosts, SERVICE } from '@/lib/monitoring/events';
import { SITE_URL } from '@/lib/seo';
import { ArticleStatus, ArticleType, DiscoveredStatus, SocialPostStatus, SourceType } from '@/generated/prisma/enums';
import { getContentFiltersConfig } from '@/lib/content-filter';

const MODEL = 'gpt-5-mini';

function estimateReadTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function uniqueSlug(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  let slug = clean;
  let i = 0;
  while (await prisma.article.findUnique({ where: { slug } })) {
    slug = `${clean}-${++i}`;
  }
  return slug;
}

function isAllowedHour(allowedHours: number[]): boolean {
  const athensHour = parseInt(
    new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' })
      .format(new Date()),
    10
  );
  return allowedHours.includes(athensHour);
}


export interface PipelineRunResult {
  ok: boolean;
  articlesGenerated: number;
  facebookPosted: number;
  error?: string;
  skippedReason?: string;
}

export async function runNewsPipeline(): Promise<PipelineRunResult> {
  const settings = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!settings) {
    return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'No settings configured' };
  }

  if (!settings.isEnabled) {
    return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'Pipeline disabled' };
  }

  if (!isAllowedHour(settings.allowedPublishHours)) {
    return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'Outside allowed publish hours' };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCount = await prisma.article.count({
    where: {
      articleType: ArticleType.NEWS,
      sourceType: SourceType.RSS_SUMMARY,
      createdAt: { gte: todayStart },
    },
  });

  if (todayCount >= settings.maxNewsPerDay) {
    return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: `Daily limit reached (${todayCount}/${settings.maxNewsPerDay})` };
  }

  const monthlyCosts = await getMonthlyAiCosts();
  if (monthlyCosts.news >= settings.dailyAiBudgetLimit * 30) {
    return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'Monthly AI budget exceeded' };
  }

  let articlesGenerated = 0;
  let facebookPosted = 0;
  const remaining = settings.maxNewsPerDay - todayCount;

  try {
    const sources = await prisma.rssSource.findMany({
      where: { enabled: true, allowAutoGeneration: true },
      select: { id: true, name: true, url: true, language: true, country: true, categoryId: true },
    });

    if (sources.length === 0) {
      return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'No auto-generation sources' };
    }

    const filtersConfig = getContentFiltersConfig();
    const allNewItems: Array<{
      sourceId: string;
      sourceName: string;
      language: string;
      country: string;
      categoryId: string;
      title: string;
      url: string;
      excerpt: string | null;
      imageUrl: string | null;
    }> = [];

    for (const source of sources) {
      try {
        const items = await fetchFeed(source.url);
        for (const item of items.slice(0, 10)) {
          const exists = await prisma.discoveredArticle.findUnique({ where: { url: item.url } });
          if (exists) continue;
          allNewItems.push({
            sourceId: source.id,
            sourceName: source.name,
            language: source.language,
            country: source.country,
            categoryId: source.categoryId,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt ?? null,
            imageUrl: item.imageUrl ?? null,
          });
        }
      } catch {
        // skip failed feed
      }
    }

    if (allNewItems.length === 0) {
      return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'No new items from feeds' };
    }

    const recentTitles = (await prisma.discoveredArticle.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 48 * 3600000) } },
      select: { title: true },
    })).map((a) => a.title);

    const filtered = allNewItems
      .map((item) => ({
        item,
        score: computeLocalScore(
          { id: item.url, title: item.title, excerpt: item.excerpt, url: item.url, categoryName: '' },
          filtersConfig,
          recentTitles
        ),
      }))
      .filter(({ score }) => !score.shouldIgnore)
      .sort((a, b) => b.score.localScore - a.score.localScore)
      .slice(0, Math.min(remaining * 3, 30));

    if (filtered.length === 0) {
      return { ok: true, articlesGenerated: 0, facebookPosted: 0, skippedReason: 'All items filtered out' };
    }

    const toScore = filtered.slice(0, 15).map(({ item }) => ({
      id: item.url,
      title: item.title,
      excerpt: item.excerpt,
    }));

    const scores = await scoreArticles(toScore);
    const threshold = settings.minimumImportanceScore * 10;

    const qualifiedItems = filtered
      .map(({ item }) => {
        const score = scores.find((s) => s.id === item.url);
        return { item, aiScore: score?.overallScore ?? 0 };
      })
      .filter(({ aiScore }) => aiScore >= threshold)
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, remaining);

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      return { ok: false, articlesGenerated: 0, facebookPosted: 0, error: 'No admin user found' };
    }

    for (const { item } of qualifiedItems) {
      if (articlesGenerated >= remaining) break;

      try {
        const topic = item.title + (item.excerpt ? '\n\n' + item.excerpt : '') + '\n\nΠηγή: ' + item.sourceName;

        const generated = await generateArticleContent({
          topic,
          categoryName: '',
          tone: 'informative',
          articleType: 'summary',
          targetLength: 'medium',
          sourceUrl: item.url,
          sourceLanguage: item.language,
          sourceCountry: item.country,
          sourceName: item.sourceName,
          generateFacebookPost: settings.facebookAutoPost,
          generateAiCommentary: true,
        });

        void logOpenAIUsage({
          service: SERVICE.ARTICLE,
          model: MODEL,
          inputTokens: 1200,
          outputTokens: 1800,
          operation: `news-auto: ${generated.title.slice(0, 60)}`,
        });

        const slug = await uniqueSlug(generated.slug || 'article');
        const status = settings.publishMode === 'PUBLISH'
          ? ArticleStatus.PUBLISHED
          : settings.publishMode === 'APPROVED'
            ? ArticleStatus.APPROVED
            : ArticleStatus.DRAFT;

        const article = await prisma.article.create({
          data: {
            title: generated.title,
            slug,
            excerpt: generated.excerpt,
            content: generated.contentHtml,
            aiCommentary: generated.aiCommentary ?? null,
            seoTitle: generated.seoTitle ?? null,
            seoDescription: generated.seoDescription ?? null,
            status,
            articleType: ArticleType.NEWS,
            sourceType: SourceType.RSS_SUMMARY,
            categoryId: item.categoryId,
            authorId: adminUser.id,
            readTime: estimateReadTime(generated.contentHtml),
            suggestedImageUrl: item.imageUrl,
            imageStatus: item.imageUrl ? 'RSS_AVAILABLE' : 'NONE',
            publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
          },
        });

        await prisma.aiDraft.create({
          data: {
            articleId: article.id,
            prompt: topic,
            rawOutput: JSON.stringify(generated),
            model: MODEL,
          },
        });

        await prisma.discoveredArticle.upsert({
          where: { url: item.url },
          update: { status: DiscoveredStatus.DRAFT_CREATED },
          create: {
            sourceId: item.sourceId,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt,
            categoryId: item.categoryId,
            status: DiscoveredStatus.DRAFT_CREATED,
            imageUrl: item.imageUrl,
          },
        });

        articlesGenerated++;

        if (settings.facebookAutoPost && generated.facebookPost && status === ArticleStatus.PUBLISHED) {
          const articleUrl = `${SITE_URL}/article/${slug}`;
          const fbResult = await FacebookClient.publish({ content: generated.facebookPost, link: articleUrl });

          const socialPost = await prisma.socialPost.create({
            data: {
              articleId: article.id,
              platform: 'FACEBOOK',
              content: generated.facebookPost,
              status: fbResult.ok ? SocialPostStatus.PUBLISHED : SocialPostStatus.FAILED,
              publishedAt: fbResult.ok ? new Date() : null,
              externalPostId: fbResult.ok ? fbResult.externalId : null,
              errorMessage: fbResult.ok ? null : fbResult.error,
            },
          });

          if (fbResult.ok) {
            facebookPosted++;
            void logEvent({
              service: SERVICE.FACEBOOK,
              type: 'auto_post',
              status: 'OK',
              message: `Auto-posted to Facebook: "${generated.title}"`,
              metadata: { articleId: article.id, socialPostId: socialPost.id, externalId: fbResult.externalId },
            });
          } else {
            void logEvent({
              service: SERVICE.FACEBOOK,
              type: 'auto_post',
              status: 'ERROR',
              message: `Facebook post failed: ${fbResult.error}`,
              metadata: { articleId: article.id },
            });
          }
        }

        void logEvent({
          service: SERVICE.ARTICLE,
          type: 'auto_pipeline_article',
          status: 'OK',
          message: `Auto-pipeline created: "${generated.title}" [${status}]`,
          metadata: { articleId: article.id, source: item.sourceName, status },
        });
      } catch (err) {
        void logEvent({
          service: SERVICE.ARTICLE,
          type: 'auto_pipeline_article',
          status: 'ERROR',
          message: `Auto-pipeline error for "${item.title}": ${err instanceof Error ? err.message : 'Unknown'}`,
          metadata: { url: item.url },
        });
      }
    }

    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'news_pipeline_run',
      status: 'OK',
      message: `Pipeline complete: ${articlesGenerated} articles, ${facebookPosted} Facebook posts`,
      metadata: { articlesGenerated, facebookPosted, sourcesChecked: sources.length },
    });

    return { ok: true, articlesGenerated, facebookPosted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    void logEvent({
      service: SERVICE.SCHEDULER,
      type: 'news_pipeline_run',
      status: 'ERROR',
      message: `Pipeline failed: ${message}`,
    });
    return { ok: false, articlesGenerated, facebookPosted, error: message };
  }
}
