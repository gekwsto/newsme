import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { BRAND, BRAND_TRANSPARENCY } from '@/config/brand';
import { SITE } from '@/config/site';
import { prisma } from '@/lib/db';
import { canonicalUrl, DEFAULT_OG_IMAGE, organizationJsonLd } from '@/lib/seo';
import { filterAndSortAuthors } from '@/lib/about/author-filter';

export const revalidate = 3600;

const PAGE_DESCRIPTION = `Μάθετε περισσότερα για το ${BRAND.name}, την εκδοτική του προσέγγιση, τους συντάκτες, τη διαδικασία διορθώσεων και τους τρόπους επικοινωνίας.`;

export const metadata: Metadata = {
  title: `Σχετικά με το ${BRAND.name}`,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: canonicalUrl('/about'),
  },
  openGraph: {
    title: `Σχετικά με το ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    url: canonicalUrl('/about'),
    siteName: BRAND.name,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: BRAND.name }],
    locale: SITE.locale,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Σχετικά με το ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
    site: BRAND.twitterHandle,
  },
};

export default async function AboutPage() {
  const authorsRaw = await prisma.author.findMany({
    where: {
      isActive: true,
      isDefault: false,
      articles: {
        some: { status: 'PUBLISHED' },
      },
    },
    select: {
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      title: true,
      twitterUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      linkedinUrl: true,
      isActive: true,
      isDefault: true,
      _count: {
        select: {
          articles: { where: { status: 'PUBLISHED' } },
        },
      },
    },
  });

  const authors = filterAndSortAuthors(authorsRaw);

  // JSON-LD graph
  const aboutPageLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': canonicalUrl('/about'),
    url: canonicalUrl('/about'),
    name: `Σχετικά με το ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    isPartOf: { '@id': `${BRAND.domain}/#website` },
    about: { '@id': `${BRAND.domain}/#organization` },
  };

  const org = organizationJsonLd();

  const personEntities = authors.map((a) => {
    const authorUrl = canonicalUrl(`/authors/${a.slug}`);
    const sameAs = [a.twitterUrl, a.facebookUrl, a.instagramUrl, a.linkedinUrl].filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );
    return {
      '@type': 'Person',
      '@id': `${BRAND.domain}/#author-${a.slug}`,
      name: a.name,
      url: authorUrl,
      ...(a.avatarUrl ? { image: a.avatarUrl } : {}),
      ...(a.title ? { jobTitle: a.title } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      worksFor: { '@id': `${BRAND.domain}/#organization` },
    };
  });

  const jsonLd = [aboutPageLd, org, ...personEntities];

  const hasSocials = BRAND.twitter || BRAND.facebook || BRAND.instagram;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="text-center mb-16">
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 mb-6">
            Σχετικά με το {BRAND.name}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Το {BRAND.name} είναι ένα ψηφιακό ενημερωτικό μέσο με στόχο την άμεση, καθαρή και
            εύκολα προσβάσιμη παρουσίαση της επικαιρότητας. Συγκεντρώνουμε και οργανώνουμε
            ειδήσεις από την Ελλάδα και τον κόσμο, ώστε οι αναγνώστες να μπορούν να
            ενημερώνονται γρήγορα και υπεύθυνα.
          </p>
        </header>

        {/* ── Αποστολή ──────────────────────────────────────────────────── */}
        <section aria-labelledby="mission-heading" className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 mb-16">
          <h2 id="mission-heading" className="text-2xl font-black mb-4">
            Η αποστολή μας
          </h2>
          <p className="text-slate-300 leading-relaxed text-lg">
            Στόχος μας είναι να προσφέρουμε ενημέρωση με σαφήνεια, συνέπεια και σεβασμό προς τον
            αναγνώστη. Επιδιώκουμε κάθε δημοσίευση να παρουσιάζει ξεκάθαρα το θέμα, την
            ημερομηνία δημοσίευσης, τον συντάκτη και, όπου απαιτείται, τις πηγές στις οποίες
            βασίζεται.
          </p>
        </section>

        {/* ── Πώς δημιουργείται το περιεχόμενο ──────────────────────────── */}
        <section
          aria-labelledby="content-process-heading"
          className="mb-16"
        >
          <h2
            id="content-process-heading"
            className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-4"
          >
            Πώς δημιουργείται το περιεχόμενο
          </h2>
          <div className="space-y-4 text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              Το περιεχόμενο του {BRAND.name} οργανώνεται και δημοσιεύεται μέσα από την εκδοτική
              διαδικασία της ιστοσελίδας. Οι πληροφορίες αξιολογούνται, διασταυρώνονται όπου αυτό
              είναι δυνατό και παρουσιάζονται με τρόπο κατανοητό για τον αναγνώστη. Όταν ένα
              δημοσίευμα βασίζεται σε πληροφορίες άλλου μέσου, επίσημη ανακοίνωση ή εξωτερική
              πηγή, η προέλευση της πληροφορίας αναφέρεται με σαφήνεια.
            </p>
            <p>
              Η πλατφόρμα χρησιμοποιεί αυτοματοποιημένα εργαλεία για την παρακολούθηση
              ειδησεογραφικών πηγών και τη βοήθεια στη σύνταξη δημοσιευμάτων. Κάθε άρθρο
              υπόκειται σε εκδοτική επιμέλεια πριν δημοσιευτεί.
            </p>
          </div>
        </section>

        {/* ── Οι συντάκτες μας ──────────────────────────────────────────── */}
        <section aria-labelledby="authors-heading" className="mb-16">
          <h2
            id="authors-heading"
            className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-3"
          >
            Οι συντάκτες μας
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
            Γνωρίστε τους ανθρώπους που υπογράφουν το περιεχόμενο του {BRAND.name}. Η παρακάτω
            λίστα ενημερώνεται αυτόματα από τους ενεργούς συντάκτες που έχουν δημοσιευμένα άρθρα
            στην ιστοσελίδα.
          </p>

          {authors.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {authors.map((author) => {
                const initials = author.name
                  .split(/\s+/)
                  .map((n) => n.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join('');
                const authorHref = `/authors/${author.slug}`;
                const articleWord =
                  author._count.articles === 1 ? 'δημοσιευμένο άρθρο' : 'δημοσιευμένα άρθρα';

                return (
                  <Link
                    key={author.slug}
                    href={authorHref}
                    aria-label={`Δείτε το προφίλ και τα άρθρα του/της ${author.name}`}
                    className="group bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all flex gap-4"
                  >
                    <div className="shrink-0">
                      {author.avatarUrl ? (
                        <Image
                          src={author.avatarUrl}
                          alt=""
                          width={56}
                          height={56}
                          className="rounded-full object-cover w-14 h-14"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 font-black text-lg select-none"
                          aria-hidden="true"
                        >
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                        {author.name}
                      </p>
                      {author.title && (
                        <p className="text-red-600 dark:text-red-400 text-xs font-semibold mt-0.5">
                          {author.title}
                        </p>
                      )}
                      {author.bio && (
                        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mt-1 line-clamp-2">
                          {author.bio}
                        </p>
                      )}
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1.5">
                        {author._count.articles} {articleWord}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-6">
              Δεν υπάρχουν ενεργοί συντάκτες αυτή τη στιγμή.
            </p>
          )}
        </section>

        {/* ── Υπογραφές και συντάκτες ───────────────────────────────────── */}
        <section
          aria-labelledby="signatures-heading"
          className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-8 mb-16"
        >
          <h2
            id="signatures-heading"
            className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-4"
          >
            Υπογραφές και συντάκτες
          </h2>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Τα άρθρα του {BRAND.name} συνδέονται με τον συντάκτη που είναι υπεύθυνος για τη
            δημοσίευσή τους. Πατώντας στο όνομα του συντάκτη, ο αναγνώστης μπορεί να δει το
            προφίλ του και τα υπόλοιπα δημοσιευμένα άρθρα του.
          </p>
        </section>

        {/* ── Διορθώσεις και ενημερώσεις ────────────────────────────────── */}
        <section aria-labelledby="corrections-heading" className="mb-16">
          <h2
            id="corrections-heading"
            className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-4"
          >
            Διορθώσεις και ενημερώσεις
          </h2>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Επιδιώκουμε το περιεχόμενό μας να είναι ακριβές και ενημερωμένο. Όταν εντοπίζεται
            ουσιαστικό λάθος, το δημοσίευμα διορθώνεται ή ενημερώνεται. Οι αναγνώστες μπορούν να
            μας ενημερώνουν για πιθανές ανακρίβειες μέσω της{' '}
            <Link
              href="/contact"
              className="text-red-600 hover:underline focus-visible:underline"
            >
              σελίδας επικοινωνίας
            </Link>
            .
          </p>
        </section>

        {/* ── Επικοινωνία ───────────────────────────────────────────────── */}
        <section
          aria-labelledby="contact-heading"
          className="bg-slate-900 text-white rounded-2xl p-8 mb-16"
        >
          <h2 id="contact-heading" className="text-2xl font-black mb-4">
            Επικοινωνία
          </h2>
          <p className="text-slate-300 leading-relaxed mb-6">
            Για διορθώσεις, παρατηρήσεις, θέματα περιεχομένου ή άλλες πληροφορίες, μπορείτε να
            επικοινωνήσετε με το {BRAND.name} μέσω της επίσημης σελίδας επικοινωνίας.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <Mail size={16} aria-hidden="true" />
              Σελίδα επικοινωνίας
            </Link>
            {BRAND.email && (
              <a
                href={`mailto:${BRAND.email}`}
                className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {BRAND.email}
              </a>
            )}
          </div>

          {hasSocials && (
            <div className="border-t border-slate-700 pt-5">
              <p className="text-slate-400 text-sm mb-3">Κοινωνικά δίκτυα:</p>
              <div className="flex flex-wrap gap-4">
                {BRAND.twitter && (
                  <a
                    href={BRAND.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-white text-sm transition-colors focus-visible:underline"
                  >
                    Twitter / X
                  </a>
                )}
                {BRAND.facebook && (
                  <a
                    href={BRAND.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-white text-sm transition-colors focus-visible:underline"
                  >
                    Facebook
                  </a>
                )}
                {BRAND.instagram && (
                  <a
                    href={BRAND.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-white text-sm transition-colors focus-visible:underline"
                  >
                    Instagram
                  </a>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Ταυτότητα του μέσου ───────────────────────────────────────── */}
        <section
          aria-labelledby="identity-heading"
          className="border border-slate-200 dark:border-slate-700 rounded-2xl p-8"
        >
          <h2
            id="identity-heading"
            className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-6"
          >
            Ταυτότητα του μέσου
          </h2>

          <dl className="space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                Όνομα έκδοσης
              </dt>
              <dd className="text-slate-900 dark:text-slate-100">{BRAND.name}</dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                Website
              </dt>
              <dd>
                <a
                  href={BRAND.domain}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-600 hover:underline focus-visible:underline"
                >
                  {BRAND.domain.replace(/^https?:\/\//, '')}
                </a>
              </dd>
            </div>

            {BRAND.email && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Email επικοινωνίας
                </dt>
                <dd>
                  <a
                    href={`mailto:${BRAND.email}`}
                    className="text-red-600 hover:underline focus-visible:underline"
                  >
                    {BRAND.email}
                  </a>
                </dd>
              </div>
            )}

            {BRAND_TRANSPARENCY.editorialContactEmail && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Email σύνταξης
                </dt>
                <dd>
                  <a
                    href={`mailto:${BRAND_TRANSPARENCY.editorialContactEmail}`}
                    className="text-red-600 hover:underline focus-visible:underline"
                  >
                    {BRAND_TRANSPARENCY.editorialContactEmail}
                  </a>
                </dd>
              </div>
            )}

            {BRAND_TRANSPARENCY.correctionsEmail && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Email διορθώσεων
                </dt>
                <dd>
                  <a
                    href={`mailto:${BRAND_TRANSPARENCY.correctionsEmail}`}
                    className="text-red-600 hover:underline focus-visible:underline"
                  >
                    {BRAND_TRANSPARENCY.correctionsEmail}
                  </a>
                </dd>
              </div>
            )}

            {BRAND_TRANSPARENCY.publisherLegalName && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Εκδότης
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {BRAND_TRANSPARENCY.publisherLegalName}
                </dd>
              </div>
            )}

            {BRAND_TRANSPARENCY.publisherAddress && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Διεύθυνση
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {BRAND_TRANSPARENCY.publisherAddress}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </>
  );
}
