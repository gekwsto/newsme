import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SourceSeed = {
  name: string;
  url: string;
  categorySlug: string;
  language?: string;
  country?: string;
  reliabilityScore?: number;
  feedSourceType?: string;
  enabled?: boolean;
};

async function main() {
  const rawPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!rawPassword) {
    throw new Error('ADMIN_INITIAL_PASSWORD environment variable is not set');
  }

  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@newsme.gr' },
    update: { passwordHash },
    create: {
      name: 'Admin',
      email: 'admin@newsme.gr',
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`✅ Admin user ready: ${admin.email}`);

  // ─── Categories ──────────────────────────────────────────────────────────────

  const categoryData = [
    // ── Internal categories (used by AI/RSS pipeline — do not remove) ──
    { name: 'AI', slug: 'ai', color: '#7c3aed' },
    { name: 'Τεχνολογία', slug: 'texnologia', color: '#2563eb' },
    { name: 'Οικονομία', slug: 'oikonomia', color: '#059669' },
    { name: 'Επιχειρηματικότητα', slug: 'epixeirimatikotita', color: '#d97706' },
    { name: 'Ελλάδα', slug: 'ellada', color: '#0891b2' },
    { name: 'Κόσμος', slug: 'kosmos', color: '#4f46e5' },
    { name: 'Viral', slug: 'viral', color: '#db2777' },
    { name: 'Απόψεις', slug: 'apopseis', color: '#475569' },
    { name: 'Αθλητικά', slug: 'athlitika', color: '#16a34a' },
    { name: 'Καιρός', slug: 'kairos', color: '#0ea5e9' },
    // ── Display-only categories (frontend navigation — phase 2 will add pipeline support) ──
    { name: 'Υγεία', slug: 'ygeia', color: '#16a34a' },
    { name: 'Media', slug: 'media', color: '#db2777' },
    { name: 'Plus', slug: 'plus', color: '#7c3aed' },
  ];

  for (const cat of categoryData) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log(`✅ ${categoryData.length} categories ready`);

  // ─── RSS Sources ─────────────────────────────────────────────────────────────

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const rssSourceData: SourceSeed[] = [
    // ── Διεθνείς (EN) ──
    { name: 'TechCrunch AI',           url: 'https://techcrunch.com/category/artificial-intelligence/feed/', categorySlug: 'ai',                language: 'EN', country: 'GLOBAL', reliabilityScore: 85, feedSourceType: 'TECH' },
    { name: 'The Verge AI',            url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', categorySlug: 'ai',           language: 'EN', country: 'GLOBAL', reliabilityScore: 88, feedSourceType: 'TECH' },
    { name: 'MIT Technology Review',   url: 'https://www.technologyreview.com/feed/',                         categorySlug: 'ai',               language: 'EN', country: 'GLOBAL', reliabilityScore: 92, feedSourceType: 'TECH' },
    { name: 'The Verge',               url: 'https://www.theverge.com/rss/index.xml',                         categorySlug: 'texnologia',        language: 'EN', country: 'GLOBAL', reliabilityScore: 88, feedSourceType: 'TECH' },
    { name: 'Ars Technica',            url: 'https://feeds.arstechnica.com/arstechnica/index',                 categorySlug: 'texnologia',        language: 'EN', country: 'GLOBAL', reliabilityScore: 90, feedSourceType: 'TECH' },
    { name: 'TechCrunch',              url: 'https://techcrunch.com/feed/',                                   categorySlug: 'texnologia',        language: 'EN', country: 'GLOBAL', reliabilityScore: 85, feedSourceType: 'TECH' },
    { name: 'Reuters Business',        url: 'https://feeds.reuters.com/reuters/businessNews',                  categorySlug: 'oikonomia',         language: 'EN', country: 'GLOBAL', reliabilityScore: 95, feedSourceType: 'BUSINESS' },
    { name: 'Bloomberg Markets',       url: 'https://feeds.bloomberg.com/markets/news.rss',                   categorySlug: 'oikonomia',         language: 'EN', country: 'GLOBAL', reliabilityScore: 95, feedSourceType: 'ECONOMY' },
    { name: 'TechCrunch Startups',     url: 'https://techcrunch.com/category/startups/feed/',                 categorySlug: 'epixeirimatikotita', language: 'EN', country: 'GLOBAL', reliabilityScore: 85, feedSourceType: 'BUSINESS' },
    { name: 'Harvard Business Review', url: 'https://feeds.hbr.org/harvardbusiness',                         categorySlug: 'epixeirimatikotita', language: 'EN', country: 'GLOBAL', reliabilityScore: 92, feedSourceType: 'BUSINESS' },
    { name: 'Reuters World',           url: 'https://feeds.reuters.com/reuters/worldNews',                    categorySlug: 'kosmos',             language: 'EN', country: 'GLOBAL', reliabilityScore: 95, feedSourceType: 'NEWS' },
    { name: 'BBC World',               url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   categorySlug: 'kosmos',             language: 'EN', country: 'GLOBAL', reliabilityScore: 95, feedSourceType: 'NEWS' },

    // ── Ελληνικές πηγές (EL/GR) — enabled: false αρχικά, τεστάρετε πρώτα ──
    { name: 'Ναυτεμπορική',      url: 'https://www.naftemporiki.gr/feed/',         categorySlug: 'oikonomia',          language: 'EL', country: 'GR', reliabilityScore: 88, feedSourceType: 'ECONOMY',  enabled: false },
    { name: 'Capital.gr',        url: 'https://www.capital.gr/feed/',              categorySlug: 'oikonomia',          language: 'EL', country: 'GR', reliabilityScore: 85, feedSourceType: 'ECONOMY',  enabled: false },
    { name: 'Euro2day',          url: 'https://www.euro2day.gr/feed/',             categorySlug: 'oikonomia',          language: 'EL', country: 'GR', reliabilityScore: 85, feedSourceType: 'ECONOMY',  enabled: false },
    { name: 'Fortune Greece',    url: 'https://fortune.gr/feed/',                  categorySlug: 'epixeirimatikotita', language: 'EL', country: 'GR', reliabilityScore: 80, feedSourceType: 'BUSINESS', enabled: false },
    { name: 'Ημερησία',          url: 'https://www.imerisia.gr/feed/',             categorySlug: 'epixeirimatikotita', language: 'EL', country: 'GR', reliabilityScore: 78, feedSourceType: 'BUSINESS', enabled: false },
    { name: 'CNN Greece',        url: 'https://www.cnn.gr/feed/',                  categorySlug: 'ellada',             language: 'EL', country: 'GR', reliabilityScore: 82, feedSourceType: 'NEWS',     enabled: false },
    { name: 'News247',           url: 'https://www.news247.gr/feed/',              categorySlug: 'ellada',             language: 'EL', country: 'GR', reliabilityScore: 78, feedSourceType: 'NEWS',     enabled: false },
    { name: 'Insider.gr',        url: 'https://www.insider.gr/feed/',              categorySlug: 'ellada',             language: 'EL', country: 'GR', reliabilityScore: 78, feedSourceType: 'NEWS',     enabled: false },
    { name: 'Liberal.gr',        url: 'https://www.liberal.gr/feed/',              categorySlug: 'apopseis',           language: 'EL', country: 'GR', reliabilityScore: 75, feedSourceType: 'NEWS',     enabled: false },
    { name: 'Techblog.gr',       url: 'https://www.techblog.gr/feed/',             categorySlug: 'texnologia',         language: 'EL', country: 'GR', reliabilityScore: 80, feedSourceType: 'TECH',     enabled: false },
    { name: 'Καθημερινή',        url: 'https://www.kathimerini.gr/feed/',          categorySlug: 'ellada',             language: 'EL', country: 'GR', reliabilityScore: 90, feedSourceType: 'NEWS',     enabled: false },
    { name: 'Οικονομικός Ταχ.', url: 'https://www.ot.gr/feed/',                   categorySlug: 'oikonomia',          language: 'EL', country: 'GR', reliabilityScore: 82, feedSourceType: 'ECONOMY',  enabled: false },
  ];

  let sourcesCreated = 0;
  for (const source of rssSourceData) {
    const categoryId = catMap[source.categorySlug];
    if (!categoryId) {
      console.warn(`⚠ Category not found: ${source.categorySlug}`);
      continue;
    }
    await prisma.rssSource.upsert({
      where: { url: source.url },
      update: {
        language: source.language ?? 'EN',
        country: source.country ?? 'GLOBAL',
        reliabilityScore: source.reliabilityScore ?? 70,
        feedSourceType: source.feedSourceType ?? 'NEWS',
      },
      create: {
        name: source.name,
        url: source.url,
        categoryId,
        enabled: source.enabled ?? true,
        language: source.language ?? 'EN',
        country: source.country ?? 'GLOBAL',
        reliabilityScore: source.reliabilityScore ?? 70,
        feedSourceType: source.feedSourceType ?? 'NEWS',
      },
    });
    sourcesCreated++;
  }

  console.log(`✅ ${sourcesCreated} RSS sources ready (${rssSourceData.filter((s) => s.country === 'GR').length} Greek)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
