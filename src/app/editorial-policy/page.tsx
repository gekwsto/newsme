import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { BRAND } from '@/config/brand';
import { SITE } from '@/config/site';

const PAGE_DESCRIPTION = `Οι αρχές, τα πρότυπα και οι δεσμεύσεις που διέπουν τη δημοσιογραφική πρακτική του ${BRAND.name}.`;

export const metadata: Metadata = {
  title: `Συντακτική Πολιτική | ${BRAND.name}`,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: canonicalUrl('/editorial-policy') },
  openGraph: {
    title: `Συντακτική Πολιτική | ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    url: canonicalUrl('/editorial-policy'),
    siteName: BRAND.name,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: BRAND.name }],
    locale: SITE.locale,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Συντακτική Πολιτική | ${BRAND.name}`,
    description: PAGE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
    site: BRAND.twitterHandle,
  },
};

const sections = [
  {
    id: 'mission',
    title: 'Αποστολή και αξίες',
    content: `Το ${BRAND.name} δεσμεύεται στην παροχή αξιόπιστης, έγκαιρης και τεκμηριωμένης δημοσιογραφίας για την τεχνολογία, την οικονομία και την ελληνική επικαιρότητα. Στόχος μας δεν είναι απλώς να αναφέρουμε γεγονότα, αλλά να τα παρουσιάζουμε με πλαίσιο, ώστε οι αναγνώστες να κατανοούν τι συμβαίνει και γιατί έχει σημασία.`,
  },
  {
    id: 'accuracy',
    title: 'Ακρίβεια και επαλήθευση',
    content: `Πριν από κάθε δημοσίευση, οι συντάκτες επιδιώκουν να επαληθεύουν τις πληροφορίες που αναφέρονται. Όταν δεν μπορούμε να επιβεβαιώσουμε ένα στοιχείο, το αναφέρουμε ρητά. Δεν δημοσιεύουμε φήμες, αδιαθεσίωτες κατηγορίες ή πληροφορίες που δεν έχουμε μπορέσει να ελέγξουμε.`,
  },
  {
    id: 'independence',
    title: 'Ανεξαρτησία και αμεροληψία',
    content: `Η συντακτική ανεξαρτησία αποτελεί βασική αρχή λειτουργίας. Καμία εμπορική, πολιτική ή άλλη εξωτερική πίεση δεν επηρεάζει τις συντακτικές αποφάσεις. Οι διαφημιστές δεν έχουν επιρροή στο περιεχόμενο. Διαχωρίζουμε σαφώς τα γεγονότα από την ανάλυση και την άποψη.`,
  },
  {
    id: 'sources',
    title: 'Πηγές και παραπομπές',
    content: `Οι πηγές αναφέρονται ρητά μέσα στο κείμενο όπου αυτό είναι δυνατό. Hyperlinks παρέχονται για επίσημα έγγραφα, δεδομένα και πρωτογενές υλικό. Ανώνυμες πηγές χρησιμοποιούνται μόνο όταν η πληροφορία είναι σημαντικού δημοσίου συμφέροντος και δεν μπορεί να αποκτηθεί αλλιώς.`,
  },
  {
    id: 'corrections',
    title: 'Διορθώσεις και ενημερώσεις',
    content: `Κάθε ουσιαστικό σφάλμα διορθώνεται άμεσα και με διαφάνεια. Όταν ένα άρθρο ενημερώνεται ουσιαστικά, εμφανίζεται η ημερομηνία τελευταίας ενημέρωσης. Δεν διαγράφουμε σφάλματα χωρίς αναφορά. Για διορθώσεις ή παρατηρήσεις, επικοινωνήστε μαζί μας στο ${BRAND.correctionsEmail}.`,
  },
  {
    id: 'commercial',
    title: 'Εμπορικό και διαφημιστικό περιεχόμενο',
    content: `Το εμπορικό τμήμα λειτουργεί ανεξάρτητα από τη σύνταξη. Τα χορηγούμενα άρθρα και οι διαφημίσεις σημαίνονται ξεκάθαρα ως τέτοια και διαχωρίζονται οπτικά από το συντακτικό περιεχόμενο. Δεν δεχόμαστε πληρωμή για ευνοϊκή κάλυψη.`,
  },
  {
    id: 'ethics',
    title: 'Δεοντολογία και σεβασμός',
    content: `Δεν δημοσιεύουμε υλικό που βλάπτει αδικαιολόγητα ιδιώτες, εκθέτει ευπαθείς πληθυσμούς ή προωθεί διακρίσεις. Σεβόμαστε τα δεδομένα προσωπικού χαρακτήρα και τις αρχές δημοσιογραφικής δεοντολογίας.`,
  },
  {
    id: 'contact',
    title: 'Επικοινωνία με τη σύνταξη',
    content: `Για συντακτικά θέματα, παρατηρήσεις ή διορθώσεις επικοινωνήστε με τη σύνταξη στο ${BRAND.editorialEmail}. Απαντάμε εντός 2 εργάσιμων ημερών.`,
  },
];

export default function EditorialPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 dark:text-slate-400 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">
          Αρχική
        </Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-slate-300">Συντακτική Πολιτική</span>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-3">
          Συντακτική Πολιτική
        </h1>
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
          Ο τρόπος που δουλεύουμε, τα πρότυπα που τηρούμε και οι δεσμεύσεις μας απέναντι στους
          αναγνώστες.
        </p>
      </header>

      <div className="space-y-6">
        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6"
          >
            <h2
              id={`${section.id}-heading`}
              className="text-lg font-black text-slate-900 dark:text-slate-100 mb-3"
            >
              {section.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
              {section.content}
            </p>
          </section>
        ))}
      </div>

      <div className="mt-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-sm">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/transparency"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Διαφάνεια
          </Link>
          <Link
            href="/about"
            className="text-red-600 hover:text-red-700 hover:underline focus-visible:underline"
          >
            Σχετικά με εμάς
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
