import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Διαφάνεια | ΑΙΣΧΟΛΙΑΣΜΟΣ',
  description:
    'Πληροφορίες για την ιδιοκτησία, τη χρηματοδότηση, τις διορθώσεις και τη λειτουργία του ΑΙΣΧΟΛΙΑΣΜΟΣ.',
  alternates: { canonical: canonicalUrl('/transparency') },
};

export default function TransparencyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">Αρχική</Link>
        <span>/</span>
        <span className="text-slate-700">Διαφάνεια</span>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 mb-3">Διαφάνεια</h1>
        <p className="text-slate-500 leading-relaxed">
          Πιστεύουμε ότι η αξιοπιστία χτίζεται με ανοιχτότητα. Εδώ παρέχουμε πλήρεις πληροφορίες για το πώς λειτουργούμε.
        </p>
        <p className="text-xs text-slate-400 mt-3">Τελευταία ενημέρωση: Ιούνιος 2026</p>
      </header>

      <div className="space-y-6">
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Ιδιοκτησία</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Το ΑΙΣΧΟΛΙΑΣΜΟΣ (aisxoliasmos.gr) είναι ανεξάρτητο ψηφιακό μέσο ενημέρωσης. Δεν ανήκει σε μεγάλο media group, πολιτικό κόμμα ή εταιρεία τεχνολογίας. Η ιδιοκτησία είναι ιδιωτική.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Χρηματοδότηση</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-3">
            Το ΑΙΣΧΟΛΙΑΣΜΟΣ χρηματοδοτείται από:
          </p>
          <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside">
            <li>Διαφημιστικά έσοδα (display ads, native advertising — σαφώς σημαίνονται)</li>
            <li>Subscriptions και premium περιεχόμενο (μελλοντικά)</li>
            <li>Ιδιωτική χρηματοδότηση ιδρυτών</li>
          </ul>
          <p className="text-sm text-slate-500 mt-3">
            Καμία χρηματοδότηση δεν επηρεάζει τις συντακτικές αποφάσεις μας.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Πολιτική Διορθώσεων</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Όταν κάνουμε λάθη, τα διορθώνουμε άμεσα και διαφανώς. Κάθε διόρθωση αναφέρεται στο τέλος του άρθρου με σαφή αναφορά στο τι άλλαξε. Δεν διαγράφουμε άρθρα ή αποσπάσματα χωρίς αναφορά. Για να αναφέρετε λάθος: <a href="mailto:corrections@aisxoliasmos.gr" className="text-red-600 hover:underline">corrections@aisxoliasmos.gr</a>
          </p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Χρήση Τεχνητής Νοημοσύνης</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Χρησιμοποιούμε AI εργαλεία (GPT-4) για βοήθεια στη δημιουργία περιεχομένου. Κάθε AI-βοηθούμενο άρθρο ελέγχεται από ανθρώπινο συντάκτη. Για πλήρεις λεπτομέρειες, δείτε την{' '}
            <Link href="/ai-policy" className="text-red-600 hover:underline">Πολιτική Χρήσης AI</Link>.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Συνδέσεις και Συμφέροντα</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Οι συντάκτες μας δεν κατέχουν μετοχές ή οικονομικά συμφέροντα σε εταιρείες που καλύπτουν. Αν υπάρχει σύγκρουση συμφερόντων σε συγκεκριμένο άρθρο, αναφέρεται ρητά. Δεν δεχόμαστε δωρεάν προϊόντα ή ταξίδια με αντάλλαγμα κάλυψη.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-900 mb-3">Επικοινωνία</h2>
          <dl className="text-sm text-slate-600 space-y-2">
            <div className="flex gap-2"><dt className="font-medium text-slate-800 shrink-0">Γενικά:</dt><dd><a href="mailto:info@aisxoliasmos.gr" className="text-red-600 hover:underline">info@aisxoliasmos.gr</a></dd></div>
            <div className="flex gap-2"><dt className="font-medium text-slate-800 shrink-0">Σύνταξη:</dt><dd><a href="mailto:editorial@aisxoliasmos.gr" className="text-red-600 hover:underline">editorial@aisxoliasmos.gr</a></dd></div>
            <div className="flex gap-2"><dt className="font-medium text-slate-800 shrink-0">Διορθώσεις:</dt><dd><a href="mailto:corrections@aisxoliasmos.gr" className="text-red-600 hover:underline">corrections@aisxoliasmos.gr</a></dd></div>
            <div className="flex gap-2"><dt className="font-medium text-slate-800 shrink-0">Τύπος:</dt><dd><a href="mailto:press@aisxoliasmos.gr" className="text-red-600 hover:underline">press@aisxoliasmos.gr</a></dd></div>
          </dl>
        </section>
      </div>

      <div className="mt-10 bg-slate-50 rounded-xl p-5 border border-slate-200 text-sm">
        <div className="flex flex-wrap gap-3">
          <Link href="/editorial-policy" className="text-red-600 hover:text-red-700 hover:underline">Συντακτική Πολιτική</Link>
          <Link href="/ai-policy" className="text-red-600 hover:text-red-700 hover:underline">Πολιτική AI</Link>
          <Link href="/privacy-policy" className="text-red-600 hover:text-red-700 hover:underline">Πολιτική Απορρήτου</Link>
          <Link href="/terms" className="text-red-600 hover:text-red-700 hover:underline">Όροι Χρήσης</Link>
        </div>
      </div>
    </div>
  );
}
