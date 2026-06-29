import { prisma } from '@/lib/db';
import { TrainingDataType } from '@/generated/prisma/enums';

export interface TrainingCaptureInput {
  articleId: string;
  discoveredArticleId?: string;
  sourceTitle: string;
  sourceExcerpt?: string;
  sourceUrl?: string;
  sourceName?: string;
  dataType: TrainingDataType;
  systemPrompt: string;
  userPrompt: string;
  aiCompletion: string;
  model: string;
  generatedTitle: string;
  generatedExcerpt: string;
  generatedTags: string[];
  category?: string;
  promptVersion?: string;
  generatorVersion?: string;
  matchedKeywords?: string[];
  semanticCategory?: string;
  compoundScore?: number;
}

export async function captureTrainingExample(input: TrainingCaptureInput): Promise<void> {
  try {
    await prisma.trainingExample.create({
      data: {
        articleId: input.articleId,
        discoveredArticleId: input.discoveredArticleId ?? null,
        sourceTitle: input.sourceTitle,
        sourceExcerpt: input.sourceExcerpt ?? null,
        sourceUrl: input.sourceUrl ?? null,
        sourceName: input.sourceName ?? null,
        dataType: input.dataType,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        aiCompletion: input.aiCompletion,
        model: input.model,
        generatedTitle: input.generatedTitle,
        generatedExcerpt: input.generatedExcerpt,
        generatedTags: input.generatedTags,
        category: input.category ?? null,
        promptVersion: input.promptVersion ?? null,
        generatorVersion: input.generatorVersion ?? null,
        matchedKeywords: input.matchedKeywords ?? [],
        semanticCategory: input.semanticCategory ?? null,
        compoundScore: input.compoundScore ?? null,
      },
    });
  } catch (err) {
    console.error('[training-capture] captureTrainingExample failed:', err);
    // Non-fatal — never block the generation pipeline
  }
}

export async function markTrainingPublished(
  articleId: string,
  finalTitle: string,
  finalContent: string
): Promise<void> {
  try {
    const example = await prisma.trainingExample.findUnique({
      where: { articleId },
      select: { generatedTitle: true },
    });
    if (!example) return;

    await prisma.trainingExample.update({
      where: { articleId },
      data: {
        wasPublished: true,
        finalTitle,
        finalContent,
        wasEdited: finalTitle.trim() !== example.generatedTitle.trim(),
      },
    });
  } catch (err) {
    console.error('[training-capture] markTrainingPublished failed:', err);
  }
}

export async function markTrainingRejected(articleId: string): Promise<void> {
  try {
    await prisma.trainingExample.updateMany({
      where: { articleId },
      data: { wasRejected: true },
    });
  } catch (err) {
    console.error('[training-capture] markTrainingRejected failed:', err);
  }
}

export async function markTrainingEdited(articleId: string): Promise<void> {
  try {
    await prisma.trainingExample.updateMany({
      where: { articleId },
      data: { wasEdited: true },
    });
  } catch (err) {
    console.error('[training-capture] markTrainingEdited failed:', err);
  }
}
