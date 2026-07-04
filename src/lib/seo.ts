import { BRAND } from '@/config/brand';
import { SITE } from '@/config/site';

export const SITE_URL = BRAND.domain;
export const SITE_NAME = BRAND.name;
export const SITE_DESCRIPTION = BRAND.description;
export const SITE_LOCALE = SITE.locale;
export const SITE_TWITTER = BRAND.twitterHandle;
export const DEFAULT_OG_IMAGE = `${BRAND.domain}${BRAND.ogImage}`;

export function canonicalUrl(path: string): string {
  return `${BRAND.domain}${path.startsWith('/') ? path : `/${path}`}`;
}

export function articleCanonical(categorySlug: string, articleSlug: string): string {
  return canonicalUrl(`/${categorySlug}/${articleSlug}`);
}

export function categoryCanonical(slug: string): string {
  return canonicalUrl(`/category/${slug}`);
}

export function organizationJsonLd() {
  const sameAs = [BRAND.twitter, BRAND.facebook, BRAND.instagram, BRAND.youtube].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': `${BRAND.domain}/#organization`,
    name: BRAND.name,
    url: BRAND.domain,
    logo: {
      '@type': 'ImageObject',
      url: `${BRAND.domain}${BRAND.logo}`,
      width: BRAND.logoWidth,
      height: BRAND.logoHeight,
    },
    ...(sameAs.length ? { sameAs } : {}),
    foundingDate: BRAND.foundingDate,
    founders: BRAND.founders.map((name) => ({ '@type': 'Person', name })),
    address: {
      '@type': 'PostalAddress',
      addressLocality: BRAND.addressLocality,
      addressCountry: SITE.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Editorial',
      email: BRAND.editorialEmail,
      url: BRAND.contactUrl,
    },
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BRAND.domain}/#website`,
    name: BRAND.name,
    url: BRAND.domain,
    description: BRAND.description,
    inLanguage: SITE.language,
    publisher: { '@id': `${BRAND.domain}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BRAND.domain}/articles?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(crumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export function newsArticleJsonLd(article: {
  title: string;
  excerpt: string;
  slug: string;
  categorySlug: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  authorUrl?: string;
  /** Display category name (not internal slug) */
  category: string;
  tags: string[];
  imageUrl?: string;
  articleType?: string;
  /** Plain-text article body, pre-stripped of HTML, max ~20 000 chars */
  articleBody?: string;
}) {
  const schemaType = article.articleType === 'NEWS' ? 'NewsArticle' : 'Article';

  const headline =
    article.title.length > 110 ? `${article.title.slice(0, 107)}…` : article.title;
  const description =
    (article.excerpt || '').length > 160
      ? `${article.excerpt.slice(0, 157)}…`
      : article.excerpt || '';
  const keywords = [article.category, ...article.tags].filter(Boolean).join(', ');
  const url = articleCanonical(article.categorySlug, article.slug);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    '@id': url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    headline,
    description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: article.authorUrl
      ? { '@type': 'Person', name: article.author, url: article.authorUrl }
      : { '@type': 'Person', name: article.author },
    publisher: {
      '@type': 'NewsMediaOrganization',
      '@id': `${BRAND.domain}/#organization`,
      name: BRAND.name,
      url: BRAND.domain,
      logo: {
        '@type': 'ImageObject',
        url: `${BRAND.domain}${BRAND.logo}`,
        width: BRAND.logoWidth,
        height: BRAND.logoHeight,
      },
    },
    isPartOf: { '@id': `${BRAND.domain}/#website` },
    articleSection: article.category,
    keywords,
    inLanguage: SITE.language,
  };

  if (article.imageUrl) {
    const absoluteImageUrl = article.imageUrl.startsWith('http')
      ? article.imageUrl
      : `${BRAND.domain}${article.imageUrl}`;
    schema.image = {
      '@type': 'ImageObject',
      url: absoluteImageUrl,
      width: 1200,
      height: 630,
    };
  }

  if (article.articleBody) {
    schema.articleBody = article.articleBody;
  }

  return schema;
}

/** Strip HTML tags and decode common entities. Safe for server-only use (no DOM). */
export function stripHtmlToText(html: string, maxLength = 20_000): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function faqPageJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function categoryPageJsonLd(category: {
  name: string;
  slug: string;
  description: string;
  articleCount: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': categoryCanonical(category.slug),
    name: `${category.name} — ${BRAND.name}`,
    description: category.description,
    url: categoryCanonical(category.slug),
    inLanguage: SITE.language,
    isPartOf: { '@id': `${BRAND.domain}/#website` },
  };
}
