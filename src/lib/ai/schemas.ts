import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const TONES = ['informative', 'sharp', 'simple', 'professional', 'viral'] as const;
export const ARTICLE_TYPES = ['original', 'summary', 'opinion', 'explainer', 'listicle'] as const;
export const TARGET_LENGTHS = ['short', 'medium', 'long'] as const;

export type Tone = (typeof TONES)[number];
export type ArticleType = (typeof ARTICLE_TYPES)[number];
export type TargetLength = (typeof TARGET_LENGTHS)[number];

// ─── Human-readable labels ────────────────────────────────────────────────────

export const toneLabels: Record<Tone, string> = {
  informative: 'Ενημερωτικό',
  sharp: 'Αιχμηρό',
  simple: 'Απλό & κατανοητό',
  professional: 'Επαγγελματικό',
  viral: 'Viral',
};

export const articleTypeLabels: Record<ArticleType, string> = {
  original: 'Πρωτότυπο',
  summary: 'Σύνοψη',
  opinion: 'Γνώμη / Άποψη',
  explainer: 'Explainer',
  listicle: 'Listicle (Αριθμημένη λίστα)',
};

export const targetLengthLabels: Record<TargetLength, string> = {
  short: 'Σύντομο (350-550 λέξεις)',
  medium: 'Μεσαίο (600-900 λέξεις)',
  long: 'Εκτεταμένο (900-1400 λέξεις)',
};

// ─── Input schema ─────────────────────────────────────────────────────────────

export const GenerateInputSchema = z.object({
  topic: z
    .string()
    .min(5, 'Το θέμα πρέπει να έχει τουλάχιστον 5 χαρακτήρες')
    .max(500, 'Το θέμα δεν μπορεί να ξεπερνά 500 χαρακτήρες'),
  categoryId: z.string().min(1, 'Επιλέξτε κατηγορία'),
  tone: z.enum(TONES),
  articleType: z.enum(ARTICLE_TYPES),
  targetLength: z.enum(TARGET_LENGTHS),
  sourceUrl: z.string().optional(),
  generateFacebookPost: z.boolean().default(true),
  generateAiCommentary: z.boolean().default(true),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

// ─── AI response schema ───────────────────────────────────────────────────────

export const GeneratedArticleSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  contentHtml: z.string().min(1),
  aiCommentary: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  facebookPost: z.string(),
  imagePrompt: z.string(),
  tags: z.array(z.string()).default([]),
});

export type GeneratedArticle = z.infer<typeof GeneratedArticleSchema>;
