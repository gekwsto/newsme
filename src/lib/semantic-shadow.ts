/**
 * semantic-shadow.ts — Phase C Shadow Mode
 *
 * Runs the NEW DB-backed semantic system in PARALLEL with the OLD JSON-based
 * system during each pipeline run. Results are logged for comparison only.
 *
 * SAFETY: Never modifies category assignment, pass/fail, article tags,
 *         image selection, or any published article.
 */
import 'server-only';

import { prisma } from '@/lib/db';
import { analyzeArticle, loadSemanticConfig } from '@/lib/semantic-service-db';

export interface ShadowInput {
  pipelineRunId: string;
  rssUrl: string;
  rssTitle: string;
  rssExcerpt: string | null;
  /** OLD system (JSON-based, production source of truth) */
  oldCategory: string | null;
  oldScore: number;
  oldPassed: boolean;
}

/**
 * Run NEW system for all pipeline items and write shadow comparison rows.
 * Called fire-and-forget from the pipeline; errors are logged but never rethrow.
 */
export async function runShadowBatch(items: ShadowInput[]): Promise<void> {
  if (items.length === 0) return;

  // Pre-load config once so all items share the same in-process cache
  const cfg = await loadSemanticConfig();

  const writes = await Promise.allSettled(
    items.map(async (item) => {
      const result = await analyzeArticle({
        title: item.rssTitle,
        excerpt: item.rssExcerpt ?? '',
        config: cfg,
      });

      const zeroMatch = result.matchedTags.length === 0;
      const newCategory = result.winningCategory;
      const newScore = result.semanticScore;
      const newPassed = result.passedSemanticFilter;

      const categoryAgree = newCategory === item.oldCategory;
      const passAgree = newPassed === item.oldPassed;
      const disagreement = !categoryAgree || !passAgree;

      let disagreementReason: string | null = null;
      if (disagreement) {
        const parts: string[] = [];
        if (!categoryAgree) {
          parts.push(`cat: OLD="${item.oldCategory ?? 'none'}" NEW="${newCategory ?? 'none'}"`);
        }
        if (!passAgree) {
          parts.push(item.oldPassed ? 'OLD:PASS NEW:FAIL' : 'OLD:FAIL NEW:PASS');
        }
        if (zeroMatch) parts.push('NEW:zero-match');
        disagreementReason = parts.join(' | ');
      }

      // Store only the fields needed for admin display — keep JSON compact
      const matchedTagsSummary = result.matchedTags.map((t) => ({
        tag: t.tagName,
        category: t.category,
        score: t.tagScore,
        location: t.bestLocation,
        aliases: t.matchedAliases.map((a) => a.alias).slice(0, 3),
      }));

      await prisma.shadowSemanticResult.create({
        data: {
          pipelineRunId: item.pipelineRunId,
          rssUrl: item.rssUrl,
          rssTitle: item.rssTitle,
          oldCategory: item.oldCategory,
          oldScore: item.oldScore,
          oldPassed: item.oldPassed,
          newCategory,
          newScore,
          newPassed,
          newMatchedTags: matchedTagsSummary,
          zeroMatch,
          categoryAgree,
          passAgree,
          disagreement,
          disagreementReason,
        },
      });
    })
  );

  const failed = writes.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(
      `[shadow] ${failed.length}/${items.length} shadow writes failed:`,
      (failed[0] as PromiseRejectedResult).reason
    );
  }
}
