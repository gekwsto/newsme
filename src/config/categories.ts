// Two-tier category system.
//
// INTERNAL categories live in the DB and are used by the AI/RSS pipeline.
// DISPLAY categories are what the frontend shows. Each display category
// aggregates one or more internal categories.
//
// Pipeline (content-generator, semantic-filter, evergreen) → writes to internal slugs
// Frontend (nav, badges, category pages, sitemap)          → reads display categories

export const DISPLAY_CATEGORIES = [
  { name: 'Ελλάδα',   slug: 'ellada',   color: '#0891b2' },
  { name: 'Κόσμος',   slug: 'kosmos',   color: '#4f46e5' },
  { name: 'Οικονομία', slug: 'oikonomia', color: '#059669' },
  { name: 'Υγεία',    slug: 'ygeia',    color: '#16a34a' },
  { name: 'Media',    slug: 'media',    color: '#db2777' },
  { name: 'Plus',     slug: 'plus',     color: '#7c3aed' },
] as const;

export type DisplayCategorySlug = (typeof DISPLAY_CATEGORIES)[number]['slug'];

// display slug → internal slugs whose articles it aggregates
export const DISPLAY_CATEGORY_MAP: Record<DisplayCategorySlug, string[]> = {
  ellada:    ['ellada'],
  kosmos:    ['kosmos'],
  oikonomia: ['oikonomia', 'epixeirimatikotita'],
  ygeia:     ['ygeia'],
  media:     ['media'],
  plus:      ['plus', 'ai', 'texnologia', 'viral', 'apopseis', 'athlitika', 'kairos'],
};

// internal slug → display category slug
export const INTERNAL_TO_DISPLAY: Record<string, DisplayCategorySlug> = {
  ellada:             'ellada',
  kosmos:             'kosmos',
  oikonomia:          'oikonomia',
  epixeirimatikotita: 'oikonomia',
  ai:                 'plus',
  texnologia:         'plus',
  viral:              'plus',
  apopseis:           'plus',
  athlitika:          'plus',
  kairos:             'plus',
  ygeia:              'ygeia',
  media:              'media',
  plus:               'plus',
};

export function getDisplayCategory(internalSlug: string) {
  const displaySlug = INTERNAL_TO_DISPLAY[internalSlug] ?? internalSlug;
  return DISPLAY_CATEGORIES.find((c) => c.slug === displaySlug) ?? null;
}

export function isDisplayCategory(slug: string): slug is DisplayCategorySlug {
  return DISPLAY_CATEGORIES.some((c) => c.slug === slug);
}

// Internal slugs that should NOT appear in frontend navigation
export const INTERNAL_ONLY_SLUGS = new Set([
  'ai', 'texnologia', 'epixeirimatikotita', 'viral', 'apopseis', 'athlitika', 'kairos',
]);
