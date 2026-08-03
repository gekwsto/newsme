import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { BRAND, BRAND_TRANSPARENCY } from '@/config/brand';
import { SITE } from '@/config/site';

const PAGE_DESCRIPTION = `Μάθετε πώς λειτουργεί το ${BRAND.name}, ποιοι συντάσσουν το περιεχόμενο, πώς χρησιμοποιούνται οι πηγές και πώς πραγματοποιούνται διορθώσεις.`;

export const metadata: Metadata = {
  title: `Διαφάνεια και υπευθυνότητα | ${BRAND.name}`,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: canonicalUrl('/transparency') },
  openGraph: {
    title: `Διαφάνεια και υπευθυνότητα | ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    url: canonicalUrl('/transparency'),
    siteName: BRAND.name,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: BRAND.name }],
    locale: SITE.locale,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Διαφάνεια και υπευθυνότητα | ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
    site: BRAND.twitterHandle,
  },
};

export default function TransparencyPage() {
  const hasSocials = BRAND.twitter || BRAND.facebook || BRAND.instagram;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 dark:text-slate-400 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">
          Αρχική
        </Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-slate-300">Διαφάνεια και υπευθυνότητα</span>
      </nav>

      <header className="mb-12">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-4">
          Διαφάνεια και υπευθυνότητα
        </h1>
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-lg">
          Η διαφάνεια αποτελεί βασική αρχή λειτουργίας του {BRAND.name}. Θέλουμε οι αναγνώστες να
          γνωρίζουν ποιος υπογράφει κάθε δημοσίευμα, πότε δημοσιεύτηκε, πότε ενημερώθηκε και
          ποιες πηγές χρησιμοποιήθηκαν για την παρουσίαση του θέματος.
        </p>
      </header>

      <div className="space-y-6">
        {/* Οι συντάκτες μας */}
        <section
          aria-labelledby="authors-heading"
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
        >
          <h2
            id="authors-heading"
            className="text-lg font-black text-slate-900 dark:text-slate-100 mb-3"
          >
            Οι συντάκτες μας
          </h2>
          <div className="space-y-3 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            <p>
              Τα άρθρα του {BRAND.name} γράφονται και επιμελούνται από πραγματικούς συντάκτες.
              Κάθε δημοσίευμα συνδέεται με τον συντάκτη που είναι υπεύθυνος για το περιεχόμενό
              του και οδηγεί στο αντίστοιχο δημόσιο προφίλ του.
            </p>
            <p>
              Οι συντάκτες αναλαμβάνουν την ευθύνη για την ακρίβεια του περιεχομένου, τις
              απαραίτητες ενημερώσεις και τις διορθώσεις που μπορεί να προκύψουν μετά τη
              δημοσίευση.
            </p>
          </div>
        </section>

        {/* Πηγές και τεκμηρίωση */}
        <section
          aria-labelledby="sources-heading"
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
        >
          <h2
            id="sources-heading"
            className="text-lg font-black text-slate-900 dark:text-slate-100 mb-3"
          >
            Πηγές και τεκμηρίωση
          </h2>
          <div className="space-y-3 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            <p>
              Όταν ένα δημοσίευμα βασίζεται σε επίσημη ανακοίνωση, δημόσιο έγγραφο, δήλωση,
              πρακτορείο ειδήσεων ή πληροφορία άλλου μέσου, η προέλευση της πληροφορίας αναφέρεται
              με σαφήνεια μέσα στο άρθρο.
            </p>
            <p>
              Οι συντάκτες επιδιώκουν να ελέγχουν τις πληροφορίες που δημοσιεύονται και να
              παρουσιάζουν τα γεγονότα με το απαραίτητο πλαίσιο, χωρίς παραπλανητικές
              διατυπώσεις.
            </p>
          </div>
        </section>

        {/* Διορθώσεις και ενημερώσεις */}
        <section
          aria-labelledby="corrections-heading"
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
        >
          <h2
            id="corrections-heading"
            className="text-lg font-black text-slate-900 dark:text-slate-100 mb-3"
          >
            Διορθώσεις και ενημερώσεις
          </h2>
          <div className="space-y-3 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            <p>
              Όταν εντοπίζεται ουσιαστικό λάθος, ανακριβής πληροφορία ή νεότερη εξέλιξη, το
              σχετικό δημοσίευμα διορθώνεται ή ενημερώνεται. Όταν πραγματοποιείται ουσιαστική
              αλλαγή, εμφανίζεται η ημερομηνία τελευταίας ενημέρωσης.
            </p>
            <p>
              Οι αναγνώστες μπορούν να μας ενημερώνουν για πιθανές ανακρίβειες μέσω της{' '}
              <Link href="/contact" className="text-red-600 hover:underline focus-visible:underline">
                σελίδας επικοινωνίας
              </Link>{' '}
              ή μέσω του επίσημου email διορθώσεων:{' '}
              <a
                href={`mailto:${BRAND.correctionsEmail}`}
                className="text-red-600 hover:underline focus-visible:underline"
              >
                {BRAND.correctionsEmail}
              </a>
              .
            </p>
          </div>
        </section>

        {/* Διαφημιστικό και εμπορικό περιεχόμενο */}
        <section
          aria-labelledby="advertising-heading"
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
        >
          <h2
            id="advertising-heading"
            className="text-lg font-black text-slate-900 dark:text-slate-100 mb-3"
          >
            Διαφημιστικό και εμπορικό περιεχόμενο
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            Οι διαφημίσεις, οι χορηγούμενες δημοσιεύσεις και οι εμπορικές συνεργασίες
            διακρίνονται με σαφήνεια από το συντακτικό περιεχόμενο. Όταν υπάρχει εμπορική
            συνεργασία, η σχετική ένδειξη πρέπει να είναι εμφανής στον αναγνώστη.
          </p>
        </section>

        {/* Ταυτότητα του μέσου */}
        <section
          aria-labelledby="identity-heading"
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
        >
          <h2
            id="identity-heading"
            className="text-lg font-black text-slate-900 dark:text-slate-100 mb-4"
          >
            Ταυτότητα του μέσου
          </h2>

          <dl className="space-y-2.5 text-sm">
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

            {BRAND.editorialEmail && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Email σύνταξης
                </dt>
                <dd>
                  <a
                    href={`mailto:${BRAND.editorialEmail}`}
                    className="text-red-600 hover:underline focus-visible:underline"
                  >
                    {BRAND.editorialEmail}
                  </a>
                </dd>
              </div>
            )}

            {BRAND.correctionsEmail && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium">
                  Email διορθώσεων
                </dt>
                <dd>
                  <a
                    href={`mailto:${BRAND.correctionsEmail}`}
                    className="text-red-600 hover:underline focus-visible:underline"
                  >
                    {BRAND.correctionsEmail}
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

            {hasSocials && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-slate-500 dark:text-slate-400 sm:w-44 shrink-0 font-medium pt-0.5">
                  Κοινωνικά δίκτυα
                </dt>
                <dd className="flex flex-wrap gap-3">
                  {BRAND.twitter && (
                    <a
                      href={BRAND.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline focus-visible:underline"
                    >
                      Twitter / X
                    </a>
                  )}
                  {BRAND.facebook && (
                    <a
                      href={BRAND.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline focus-visible:underline"
                    >
                      Facebook
                    </a>
                  )}
                  {BRAND.instagram && (
                    <a
                      href={BRAND.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline focus-visible:underline"
                    >
                      Instagram
                    </a>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* Footer links */}
      <div className="mt-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-sm">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/editorial-policy"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Συντακτική πολιτική
          </Link>
          <Link
            href="/privacy-policy"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Πολιτική Απορρήτου
          </Link>
          <Link
            href="/terms"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Όροι Χρήσης
          </Link>
          <Link
            href="/contact"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Επικοινωνία
          </Link>
        </div>
      </div>
    </div>
  );
}
