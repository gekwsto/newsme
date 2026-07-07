'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ArticleStatus,
  ArticleType,
  SourceType,
  SocialPostStatus,
  SocialPlatform,
} from '@/generated/prisma/enums';
import {
  generateEvergreenContent,
  optimizeEvergreenContent,
  type EvergreenGenerateOptions,
} from '@/lib/ai/evergreen-generator';
import {
  EvergreenInputSchema,
  type EvergreenInput,
  type EvergreenLength,
  type EvergreenArticleType,
} from '@/lib/ai/evergreen-schemas';
import { computeSeoScore } from '@/lib/seo-checker';
import { pickDisplayAuthor } from '@/lib/authors/pick-display-author';

export type { EvergreenInput };

export type EvergreenResult =
  | {
      ok: true;
      articleId: string;
      title: string;
      seoScore: number;
      seoGrade: string;
      searchIntent: string;
      relatedTopics: string[];
      futureArticles: string[];
      internalLinkSuggestions: Array<{ anchorText: string; topic: string; context: string }>;
    }
  | { ok: false; error: string };

function estimateReadTime(html: string): number {
  const wordCount = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = await prisma.article.findUnique({ where: { slug: base } });
  if (!existing) return base;
  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}`;
    const conflict = await prisma.article.findUnique({ where: { slug: candidate } });
    if (!conflict) return candidate;
    suffix++;
  }
}

export async function generateAndSaveEvergreenArticle(
  input: EvergreenInput,
): Promise<EvergreenResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος' };

    const validation = EvergreenInputSchema.safeParse(input);
    if (!validation.success) {
      return { ok: false, error: validation.error.issues[0]?.message ?? 'Μη έγκυρα δεδομένα' };
    }

    const validated = validation.data;
    const category = await prisma.category.findUnique({ where: { id: validated.categoryId } });
    if (!category) return { ok: false, error: 'Η κατηγορία δεν βρέθηκε' };

    const secondaryKeywords = validated.secondaryKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const options: EvergreenGenerateOptions = {
      topic: validated.topic,
      primaryKeyword: validated.primaryKeyword,
      secondaryKeywords,
      categoryName: category.name,
      targetLength: validated.targetLength as EvergreenLength,
      articleType: validated.articleType as EvergreenArticleType,
      estimatedDifficulty: validated.estimatedDifficulty,
      generateFaq: validated.generateFaq,
      generateInternalLinks: validated.generateInternalLinks,
      generateSocialPosts: validated.generateSocialPosts,
      generateImagePrompt: validated.generateImagePrompt,
    };

    // First generation pass
    let generated = await generateEvergreenContent(options);

    // Compute SEO score — skip image/internalLinks fields (not addressable by AI)
    const seoCheck = computeSeoScore({
      title: generated.title,
      excerpt: generated.excerpt,
      content: generated.contentHtml,
      seoTitle: generated.seoTitle,
      seoDescription: generated.seoDescription,
      tags: generated.tags,
      imageUrl: null,
      generatedImageUrl: null,
      readTime: estimateReadTime(generated.contentHtml),
      slug: generated.slug,
    });

    // Auto-optimize only for content/meta issues, not infrastructure (image, internal links)
    const fixableIssues = seoCheck.issues.filter(
      (i) => !['image', 'internalLinks'].includes(i.field),
    );

    if (fixableIssues.length > 0 && seoCheck.score < 90) {
      generated = await optimizeEvergreenContent(
        generated,
        fixableIssues.map((i) => i.message),
        validated.primaryKeyword,
      );
    }

    // Final score
    const finalCheck = computeSeoScore({
      title: generated.title,
      excerpt: generated.excerpt,
      content: generated.contentHtml,
      seoTitle: generated.seoTitle,
      seoDescription: generated.seoDescription,
      tags: generated.tags,
      imageUrl: null,
      generatedImageUrl: null,
      readTime: estimateReadTime(generated.contentHtml),
      slug: generated.slug,
    });

    const slug = await uniqueSlug(generated.slug || 'evergreen');

    const article = await prisma.article.create({
      data: {
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.contentHtml,
        seoTitle: generated.seoTitle || null,
        seoDescription: generated.seoDescription || null,
        seoScore: finalCheck.score,
        articleType: ArticleType.EVERGREEN,
        status: ArticleStatus.PENDING_APPROVAL,
        sourceType: SourceType.AI_GENERATED,
        categoryId: validated.categoryId,
        authorId: session.user.id,
        displayAuthorId: await pickDisplayAuthor(),
        readTime: estimateReadTime(generated.contentHtml),
        evergreenKeyword: validated.primaryKeyword,
        secondaryKeywords,
        faqJson: generated.faqItems.length ? (generated.faqItems as object) : undefined,
        searchIntent: generated.searchIntent,
        estimatedDifficulty: validated.estimatedDifficulty,
      },
    });

    await prisma.aiDraft.create({
      data: {
        articleId: article.id,
        prompt: `[EVERGREEN] ${validated.topic} | Keyword: ${validated.primaryKeyword}`,
        rawOutput: JSON.stringify(generated),
        model: 'gpt-4o',
        imagePrompt: generated.imagePrompt || null,
      },
    });

    if (validated.generateSocialPosts) {
      const { facebook, linkedin } = generated.socialPosts;
      if (facebook) {
        await prisma.socialPost.create({
          data: {
            articleId: article.id,
            platform: SocialPlatform.FACEBOOK,
            content: facebook,
            status: SocialPostStatus.DRAFT,
          },
        });
      }
      if (linkedin) {
        await prisma.socialPost.create({
          data: {
            articleId: article.id,
            platform: SocialPlatform.LINKEDIN,
            content: linkedin,
            status: SocialPostStatus.DRAFT,
          },
        });
      }
    }

    for (const tagName of generated.tags) {
      const trimmed = tagName.trim();
      if (!trimmed) continue;
      const tag = await prisma.tag.upsert({
        where: { name: trimmed },
        update: {},
        create: { name: trimmed },
      });
      await prisma.articleTag.upsert({
        where: { articleId_tagId: { articleId: article.id, tagId: tag.id } },
        update: {},
        create: { articleId: article.id, tagId: tag.id },
      });
    }

    return {
      ok: true,
      articleId: article.id,
      title: generated.title,
      seoScore: finalCheck.score,
      seoGrade: finalCheck.grade,
      searchIntent: generated.searchIntent,
      relatedTopics: generated.contentCluster.relatedTopics,
      futureArticles: generated.contentCluster.futureArticles,
      internalLinkSuggestions: generated.internalLinkSuggestions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Άγνωστο σφάλμα';
    console.error('[generateAndSaveEvergreenArticle]', error);
    return { ok: false, error: message };
  }
}
