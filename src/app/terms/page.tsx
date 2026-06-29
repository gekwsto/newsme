import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl } from '@/lib/seo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: `Όροι Χρήσης | ${BRAND.name}`,
  description: `Οι όροι και προϋποθέσεις χρήσης του ${new URL(BRAND.domain).hostname}.`,
  alternates: { canonical: canonicalUrl('/terms') },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">Αρχική</Link>
        <span>/</span>
        <span className="text-slate-700">Όροι Χρήσης</span>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 mb-3">Όροι Χρήσης</h1>
        <p className="text-slate-500 text-sm">Τελευταία ενημέρωση: Ιούνιος 2026</p>
      </header>

      <div className="space-y-6 text-sm">
        {[
          {
            title: '1. Αποδοχή Όρων',
            content: `Με τη χρήση του ${new URL(BRAND.domain).hostname} αποδέχεστε πλήρως τους παρόντες όρους χρήσης. Αν δεν συμφωνείτε, παρακαλούμε να μην χρησιμοποιείτε τον ιστότοπο.`,
          },
          {
            title: '2. Πνευματική Ιδιοκτησία',
            content: `Το σύνολο του περιεχομένου (άρθρα, εικόνες, κείμενα, λογότυπα) ανήκει στο ${BRAND.name} ή σε τρίτους με άδεια. Απαγορεύεται η αναπαραγωγή χωρίς γραπτή άδεια. Επιτρέπεται η κοινοποίηση με αναφορά πηγής και hyperlink.`,
          },
          {
            title: '3. Χρήση Περιεχομένου',
            content: `Το περιεχόμενο παρέχεται για ενημερωτικούς σκοπούς. Δεν αποτελεί επαγγελματική συμβουλή (νομική, οικονομική, ιατρική). Το ${BRAND.name} δεν φέρει ευθύνη για αποφάσεις που λαμβάνονται βάσει του περιεχομένου.`,
          },
          {
            title: '4. Σύνδεσμοι σε Τρίτους',
            content: 'Ο ιστότοπος μπορεί να περιέχει συνδέσμους σε τρίτους. Δεν φέρουμε ευθύνη για το περιεχόμενο ή τις πολιτικές αυτών των ιστότοπων.',
          },
          {
            title: '5. Περιορισμός Ευθύνης',
            content: `Το ${BRAND.name} παρέχει τον ιστότοπο "ως έχει" χωρίς εγγυήσεις. Δεν φέρουμε ευθύνη για τυχόν απώλειες ή ζημιές από τη χρήση ή την αδυναμία χρήσης του ιστότοπου.`,
          },
          {
            title: '6. Cookies',
            content: 'Χρησιμοποιούμε cookies για τη λειτουργικότητα και την ανάλυση κοινού. Για λεπτομέρειες, βλ. Πολιτική Απορρήτου.',
          },
          {
            title: '7. Τροποποιήσεις',
            content: 'Διατηρούμε το δικαίωμα να τροποποιούμε τους παρόντες όρους ανά πάσα στιγμή. Οι αλλαγές ισχύουν από τη στιγμή δημοσίευσής τους.',
          },
          {
            title: '8. Εφαρμοστέο Δίκαιο',
            content: 'Οι παρόντες όροι διέπονται από το ελληνικό δίκαιο. Αρμόδια είναι τα Δικαστήρια Αθηνών.',
          },
        ].map((s) => (
          <section key={s.title} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-black text-slate-900 mb-2">{s.title}</h2>
            <p className="text-slate-600 leading-relaxed">{s.content}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 text-sm text-slate-500">
        <Link href="/privacy-policy" className="text-red-600 hover:underline mr-4">Πολιτική Απορρήτου</Link>
        <Link href="/editorial-policy" className="text-red-600 hover:underline">Συντακτική Πολιτική</Link>
      </div>
    </div>
  );
}
