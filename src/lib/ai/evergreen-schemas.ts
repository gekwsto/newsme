import { z } from 'zod';

// ─── Enums & Labels ───────────────────────────────────────────────────────────

export const EVERGREEN_ARTICLE_TYPES = [
  'what-is',
  'guide',
  'comparison',
  'tutorial',
  'explainer',
  'best-of',
  'analysis',
  'faq',
] as const;

export type EvergreenArticleType = (typeof EVERGREEN_ARTICLE_TYPES)[number];

export const evergreenArticleTypeLabels: Record<EvergreenArticleType, string> = {
  'what-is': 'What Is (Τι Είναι)',
  guide: 'Guide (Οδηγός)',
  comparison: 'Comparison (Σύγκριση)',
  tutorial: 'Tutorial (Βήμα προς Βήμα)',
  explainer: 'Explainer (Επεξήγηση)',
  'best-of': 'Best Of (Τα Καλύτερα)',
  analysis: 'Analysis (Ανάλυση)',
  faq: 'FAQ (Συχνές Ερωτήσεις)',
};

export const EVERGREEN_LENGTHS = ['short', 'medium', 'long'] as const;
export type EvergreenLength = (typeof EVERGREEN_LENGTHS)[number];

export const evergreenLengthLabels: Record<EvergreenLength, string> = {
  short: 'Σύντομο (1200–1500 λέξεις)',
  medium: 'Μεσαίο (1800–2200 λέξεις)',
  long: 'Εκτεταμένο (2500–3500 λέξεις)',
};

export const evergreenWordCountMap: Record<EvergreenLength, string> = {
  short: '1200-1500',
  medium: '1800-2200',
  long: '2500-3500',
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const FaqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const InternalLinkSchema = z.object({
  anchorText: z.string().min(1),
  topic: z.string().min(1),
  context: z.string(),
});

export const GeneratedEvergreenSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  contentHtml: z.string().min(1),
  seoTitle: z.string(),
  seoDescription: z.string(),
  searchIntent: z.enum(['Informational', 'Commercial', 'Navigational', 'Transactional']),
  faqItems: z.array(FaqItemSchema).default([]),
  internalLinkSuggestions: z.array(InternalLinkSchema).default([]),
  contentCluster: z.object({
    relatedTopics: z.array(z.string()),
    futureArticles: z.array(z.string()),
  }),
  socialPosts: z.object({
    facebook: z.string(),
    linkedin: z.string(),
    newsletter: z.string(),
  }),
  imagePrompt: z.string(),
  imageAltText: z.string().default(''),
  imageTitle: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

export type GeneratedEvergreen = z.infer<typeof GeneratedEvergreenSchema>;

// ─── Input schema ─────────────────────────────────────────────────────────────

export const EvergreenInputSchema = z.object({
  topic: z.string().min(5, 'Το θέμα πρέπει να έχει τουλάχιστον 5 χαρακτήρες'),
  primaryKeyword: z.string().min(2, 'Εισάγετε primary keyword'),
  secondaryKeywords: z.string().default(''),
  categoryId: z.string().min(1, 'Επιλέξτε κατηγορία'),
  targetLength: z.enum(EVERGREEN_LENGTHS),
  articleType: z.enum(EVERGREEN_ARTICLE_TYPES),
  estimatedDifficulty: z.number().min(1).max(100).default(50),
  generateFaq: z.boolean().default(true),
  generateInternalLinks: z.boolean().default(true),
  generateSocialPosts: z.boolean().default(false),
  generateImagePrompt: z.boolean().default(true),
});

export type EvergreenInput = z.infer<typeof EvergreenInputSchema>;
