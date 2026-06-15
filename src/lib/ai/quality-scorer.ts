export interface QualityScores {
  qualityScore: number;
  aiSeoScore: number;
  readabilityScore: number;
}

interface ScorerInput {
  contentHtml: string;
  seoTitle?: string;
  seoDescription?: string;
  primaryKeyword: string;
  faqCount: number;
}

function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
}

function countOccurrences(text: string, keyword: string): number {
  return (text.toLowerCase().match(new RegExp(keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
}

function scoreQuality(input: ScorerInput): number {
  const { contentHtml, faqCount } = input;
  const words = wordCount(contentHtml);
  let score = 0;

  if (words >= 2500) score += 3;
  else if (words >= 2000) score += 2.5;
  else if (words >= 1800) score += 2;
  else score += Math.max(0, (words / 1800) * 1.5);

  if (contentHtml.includes('<table')) score += 1;
  if (contentHtml.includes('<blockquote')) score += 0.5;
  if (contentHtml.includes('<ol')) score += 0.5;

  if (faqCount >= 7) score += 2;
  else if (faqCount >= 5) score += 1.5;
  else if (faqCount >= 3) score += 1;

  if (contentHtml.includes('quick-answer')) score += 1;

  const internalLinks = (contentHtml.match(/href="\/article\//g) ?? []).length;
  score += Math.min(internalLinks, 3) * 0.5;

  if (contentHtml.includes('eeaat-byline')) score += 0.5;

  return parseFloat(Math.min(10, score).toFixed(1));
}

function scoreSeo(input: ScorerInput): number {
  const { contentHtml, seoTitle, seoDescription, primaryKeyword } = input;
  const plainText = contentHtml.replace(/<[^>]+>/g, ' ');
  const words = wordCount(contentHtml);
  let score = 0;

  const h1Match = contentHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    score += 1;
    if (h1Match[1].toLowerCase().includes(primaryKeyword.toLowerCase())) score += 1;
  }

  const h2Count = (contentHtml.match(/<h2/g) ?? []).length;
  if (h2Count >= 8) score += 1;
  else if (h2Count >= 5) score += 0.5;

  const first100Words = plainText.split(/\s+/).slice(0, 100).join(' ');
  if (first100Words.toLowerCase().includes(primaryKeyword.toLowerCase())) score += 1;

  if (words > 0) {
    const density = (countOccurrences(plainText, primaryKeyword) / words) * 100;
    if (density >= 0.8 && density <= 2) score += 1.5;
    else if (density >= 0.5 && density <= 3) score += 0.5;
  }

  if (seoDescription) {
    const len = seoDescription.length;
    if (len >= 140 && len <= 160) score += 1.5;
    else if (len >= 120 && len <= 170) score += 1;
  }

  if (seoTitle && seoTitle.length <= 60) score += 1;

  if (contentHtml.includes('quick-answer')) score += 0.5;

  const internalLinks = (contentHtml.match(/href="\/article\//g) ?? []).length;
  if (internalLinks >= 3) score += 1;
  else if (internalLinks >= 1) score += 0.5;

  return parseFloat(Math.min(10, score).toFixed(1));
}

function scoreReadability(input: ScorerInput): number {
  const { contentHtml } = input;
  let score = 0;

  const paragraphs = contentHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [];
  if (paragraphs.length > 0) {
    const avgParagraphWords = paragraphs.reduce((sum, p) => {
      const text = p.replace(/<[^>]+>/g, ' ');
      return sum + text.split(/\s+/).length;
    }, 0) / paragraphs.length;

    if (avgParagraphWords >= 50 && avgParagraphWords <= 120) score += 3;
    else if (avgParagraphWords >= 30 && avgParagraphWords <= 160) score += 2;
    else score += 1;
  }

  const headingCount = (contentHtml.match(/<h[23]/g) ?? []).length;
  const totalWords = wordCount(contentHtml);
  const headingDensity = totalWords > 0 ? (headingCount / totalWords) * 300 : 0;
  if (headingDensity >= 1 && headingDensity <= 4) score += 2;
  else if (headingDensity >= 0.5) score += 1;

  const listItems = (contentHtml.match(/<li/g) ?? []).length;
  if (listItems >= 10) score += 2;
  else if (listItems >= 5) score += 1.5;
  else if (listItems >= 3) score += 1;

  const boldCount = (contentHtml.match(/<strong/g) ?? []).length;
  if (boldCount >= 5) score += 1;
  else if (boldCount >= 2) score += 0.5;

  if (contentHtml.includes('<table')) score += 0.5;

  return parseFloat(Math.min(10, score).toFixed(1));
}

export function scoreArticle(input: ScorerInput): QualityScores {
  return {
    qualityScore: scoreQuality(input),
    aiSeoScore: scoreSeo(input),
    readabilityScore: scoreReadability(input),
  };
}

export function passesQualityGate(scores: QualityScores): boolean {
  return scores.qualityScore >= 7 && scores.aiSeoScore >= 7;
}
