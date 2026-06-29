import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl } from '@/lib/seo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: `Συντακτική Πολιτική | ${BRAND.name}`,
  description: `Οι αρχές, τα πρότυπα και οι διαδικασίες που διέπουν τη δημοσιογραφική μας πρακτική στο ${BRAND.name}.`,
  alternates: { canonical: canonicalUrl('/editorial-policy') },
};

const sections = [
  {
    title: 'Αποστολή και Αξίες',
    content: `Το ${BRAND.name} δεσμεύεται στην παροχή αξιόπιστης, έγκαιρης και αναλυτικής δημοσιογραφίας για AI, τεχνολογία, οικονομία και επικαιρότητα. Στόχος μας δεν είναι απλώς να αναφέρουμε γεγονότα, αλλά να τα εξηγούμε με πλαίσιο και να βοηθούμε τους αναγνώστες να τα κατανοήσουν.`,
  },
  {
    title: 'Ακρίβεια και Επαλήθευση',
    content: `Κάθε ισχυρισμός που δημοσιεύεται επαληθεύεται από τουλάχιστον δύο ανεξάρτητες πηγές πριν δημοσιευτεί. Όταν δεν μπορούμε να επαληθεύσουμε πληροφορία, το αναφέρουμε ρητά. Δεν δημοσιεύουμε φήμες ή αδιαθεσίωτες κατηγορίες.`,
  },
  {
    title: 'Ανεξαρτησία και Αμεροληψία',
    content: `Η συντακτική μας ανεξαρτησία είναι αδιαπραγμάτευτη. Καμία εμπορική, πολιτική ή άλλη εξωτερική πίεση δεν επηρεάζει τις συντακτικές αποφάσεις μας. Οι διαφημιστές δεν έχουν καμία επιρροή στο περιεχόμενο. Σαφώς διαχωρίζουμε τη γνώμη από τα γεγονότα.`,
  },
  {
    title: 'Χρήση Τεχνητής Νοημοσύνης',
    content: `Χρησιμοποιούμε εργαλεία AI για να υποβοηθούμε — όχι να αντικαθιστούμε — τη δημοσιογραφία. Κάθε AI-generated περιεχόμενο ελέγχεται, επιμελείται και εγκρίνεται από ανθρώπινο συντάκτη πριν δημοσιευτεί. Τα AI-βοηθούμενα άρθρα σημαίνονται αναλόγως. Για πλήρεις λεπτομέρειες, δείτε την Πολιτική Χρήσης AI.`,
  },
  {
    title: 'Πηγές και Παραπομπές',
    content: `Οι πηγές μας αναφέρονται ρητά όπου είναι δυνατόν. Οι ανώνυμες πηγές χρησιμοποιούνται μόνο όταν η πληροφορία είναι σημαντικού δημοσίου συμφέροντος και δεν μπορεί να αποκτηθεί αλλιώς. Τα hyperlinks παρέχονται για αρχικές πηγές και επίσημα δεδομένα.`,
  },
  {
    title: 'Διορθώσεις και Ενημερώσεις',
    content: `Διορθώνουμε άμεσα και διαφανώς κάθε σφάλμα. Οι διορθώσεις αναφέρονται ρητά στο τέλος του άρθρου με σαφή αναφορά στο τι άλλαξε και γιατί. Δεν διαγράφουμε σφάλματα χωρίς να το αναφέρουμε.`,
  },
  {
    title: 'Εμπορικά Θέματα',
    content: `Το εμπορικό τμήμα λειτουργεί πλήρως ανεξάρτητα από τη σύνταξη. Τα sponsored άρθρα και οι διαφημίσεις σημαίνονται ξεκάθαρα ως τέτοια. Δεν δέχόμαστε πληρωμή για ευνοϊκή κάλυψη.`,
  },
  {
    title: 'Επικοινωνία με τη Σύνταξη',
    content: `Για συντακτικά θέματα, παρατηρήσεις ή διορθώσεις, επικοινωνήστε με τη σύνταξη στο ${BRAND.editorialEmail}. Απαντάμε εντός 2 εργάσιμων ημερών.`,
  },
];

export default function EditorialPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">Αρχική</Link>
        <span>/</span>
        <span className="text-slate-700">Συντακτική Πολιτική</span>
      </nav>

      <header className="mb-10">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4">
          <span className="text-red-600 font-black text-lg">Σ</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-3">Συντακτική Πολιτική</h1>
        <p className="text-slate-500 leading-relaxed">
          Ο τρόπος που δουλεύουμε, τα πρότυπα που τηρούμε και οι δεσμεύσεις μας απέναντι στους αναγνώστες.
        </p>
        <p className="text-xs text-slate-400 mt-3">Τελευταία ενημέρωση: Ιούνιος 2026</p>
      </header>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-black text-slate-900 mb-3">{section.title}</h2>
            <p className="text-slate-600 leading-relaxed text-sm">{section.content}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 bg-slate-50 rounded-xl p-6 border border-slate-200 text-sm text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">Σχετικές Πολιτικές</p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link href="/ai-policy" className="text-red-600 hover:text-red-700 hover:underline">Πολιτική Χρήσης AI</Link>
          <Link href="/transparency" className="text-red-600 hover:text-red-700 hover:underline">Διαφάνεια</Link>
          <Link href="/privacy-policy" className="text-red-600 hover:text-red-700 hover:underline">Πολιτική Απορρήτου</Link>
        </div>
      </div>
    </div>
  );
}
