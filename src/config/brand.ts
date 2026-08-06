export const BRAND = {
  name: 'NewsMe',
  seoName: 'newsme.gr',
  shortName: 'NewsMe',
  tagline: 'Η καθημερινή ενημέρωση με αξιοπιστία.',
  description: 'Η καθημερινή ενημέρωση με αξιοπιστία.',

  domain: 'https://newsme.gr',

  email: 'info@newsme.gr',
  supportEmail: 'support@newsme.gr',
  pressEmail: 'press@newsme.gr',
  editorialEmail: 'editorial@newsme.gr',
  privacyEmail: 'privacy@newsme.gr',
  correctionsEmail: 'corrections@newsme.gr',
  aiEmail: 'ai@newsme.gr',
  contactUrl: 'https://newsme.gr/contact',
  aboutUrl: 'https://newsme.gr/about',
  editorialPolicyUrl: 'https://newsme.gr/editorial-policy',
  transparencyUrl: 'https://newsme.gr/transparency',

  twitter: 'https://twitter.com/newsme',
  twitterHandle: '@newsme',
  facebook: 'https://facebook.com/newsme',
  instagram: 'https://instagram.com/newsme',
  youtube: '',

  logo: '/logo.svg',
  logoWidth: 512,
  logoHeight: 512,
  favicon: '/favicon.ico',
  ogImage: '/og-default.jpg',

  publisher: 'NewsMe',
  author: 'NewsMe',

  foundingDate: '2025-01-01',
  founders: ['Newsme Editorial Team'] as string[],
  addressLocality: 'Athens',
} as const;

/**
 * Optional publication transparency fields.
 * Leave undefined until you have real, verified values to fill in.
 * The About page will silently omit any field that is undefined or empty.
 */
export const BRAND_TRANSPARENCY: {
  publisherLegalName?: string;
  publisherAddress?: string;
  editorialContactEmail?: string;
  correctionsEmail?: string;
} = {
  editorialContactEmail: 'editorial@newsme.gr',
  correctionsEmail: 'corrections@newsme.gr',
};
