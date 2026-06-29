'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateArticleContent, PROMPT_VERSION, GENERATOR_VERSION } from '@/lib/ai/content-generator';
import { GenerateInputSchema, type GenerateInput } from '@/lib/ai/schemas';
import { ArticleStatus, SourceType, SocialPostStatus, TrainingDataType } from '@/generated/prisma/enums';
import { captureTrainingExample } from '@/lib/training-capture';

export type GenerateResult =
  | { ok: true; articleId: string; title: string }
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

export async function generateAndSaveArticle(input: GenerateInput): Promise<GenerateResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος' };

    const validation = GenerateInputSchema.safeParse(input);
    if (!validation.success) {
      return { ok: false, error: validation.error.issues[0]?.message ?? 'Μη έγκυρα δεδομένα' };
    }

    const validated = validation.data;

    const category = await prisma.category.findUnique({ where: { id: validated.categoryId } });
    if (!category) return { ok: false, error: 'Η κατηγορία δεν βρέθηκε' };

    // Call OpenAI
    const generated = await generateArticleContent({
      topic: validated.topic,
      categoryName: category.name,
      tone: validated.tone,
      articleType: validated.articleType,
      targetLength: validated.targetLength,
      sourceUrl: validated.sourceUrl || undefined,
      generateFacebookPost: validated.generateFacebookPost,
      generateAiCommentary: validated.generateAiCommentary,
    });

    const sourceType: SourceType =
      validated.sourceUrl ? SourceType.RSS_SUMMARY : SourceType.AI_GENERATED;

    const slug = await uniqueSlug(generated.slug || 'article');
    const categoryId = validated.categoryId;

    // Create Article
    const article = await prisma.article.create({
      data: {
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.contentHtml,
        aiCommentary: validated.generateAiCommentary && generated.aiCommentary
          ? generated.aiCommentary
          : null,
        seoTitle: generated.seoTitle || null,
        seoDescription: generated.seoDescription || null,
        status: ArticleStatus.PENDING_APPROVAL,
        sourceType,
        categoryId,
        authorId: session.user.id,
        readTime: estimateReadTime(generated.contentHtml),
      },
    });

    // Create AiDraft (stores the full generation metadata)
    await prisma.aiDraft.create({
      data: {
        articleId: article.id,
        prompt: validated.topic,
        rawOutput: JSON.stringify(generated),
        model: 'gpt-5-mini',
        imagePrompt: generated.imagePrompt || null,
        promptVersion: PROMPT_VERSION,
        generatorVersion: GENERATOR_VERSION,
      },
    });

    void captureTrainingExample({
      articleId: article.id,
      sourceTitle: validated.topic,
      sourceUrl: validated.sourceUrl || undefined,
      dataType: TrainingDataType.NEWS_MANUAL,
      systemPrompt: generated._prompts.systemPrompt,
      userPrompt: generated._prompts.userPrompt,
      aiCompletion: JSON.stringify(generated),
      model: generated._prompts.model,
      generatedTitle: generated.title,
      generatedExcerpt: generated.excerpt,
      generatedTags: generated.tags,
      category: category.name,
      promptVersion: PROMPT_VERSION,
      generatorVersion: GENERATOR_VERSION,
    });

    // Create Facebook SocialPost if requested
    if (validated.generateFacebookPost && generated.facebookPost) {
      await prisma.socialPost.create({
        data: {
          articleId: article.id,
          platform: 'FACEBOOK',
          content: generated.facebookPost,
          status: SocialPostStatus.DRAFT,
        },
      });
    }

    // Upsert and link tags
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

    return { ok: true, articleId: article.id, title: generated.title };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Άγνωστο σφάλμα';
    console.error('[generateAndSaveArticle]', error);
    return { ok: false, error: message };
  }
}
