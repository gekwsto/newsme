import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl } from '@/lib/seo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: `Πολιτική Απορρήτου | ${BRAND.name}`,
  description: `Πώς συλλέγουμε, χρησιμοποιούμε και προστατεύουμε τα προσωπικά δεδομένα σας στο ${BRAND.name}.`,
  alternates: { canonical: canonicalUrl('/privacy-policy') },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">Αρχική</Link>
        <span>/</span>
        <span className="text-slate-700">Πολιτική Απορρήτου</span>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 mb-3">Πολιτική Απορρήτου</h1>
        <p className="text-slate-500 text-sm">Τελευταία ενημέρωση: Ιούνιος 2026</p>
      </header>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-8">
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">1. Ποιος είναι υπεύθυνος επεξεργασίας</h2>
          <p className="text-slate-600">{`Το ${BRAND.name} (${new URL(BRAND.domain).hostname}) είναι ο υπεύθυνος επεξεργασίας των προσωπικών δεδομένων που συλλέγονται μέσω αυτού του ιστότοπου.`} Επικοινωνία: <a href={`mailto:${BRAND.privacyEmail}`} className="text-red-600 hover:underline">{BRAND.privacyEmail}</a></p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">2. Τι δεδομένα συλλέγουμε</h2>
          <ul className="text-slate-600 space-y-2 list-disc list-inside">
            <li><strong>Δεδομένα χρήσης:</strong> IP, browser, σελίδες που επισκέφτηκες, χρόνος παραμονής</li>
            <li><strong>Email:</strong> Αν εγγραφείς στο newsletter (προαιρετικό)</li>
            <li><strong>Cookies:</strong> Για λειτουργικότητα και ανάλυση (βλ. Cookie Policy)</li>
            <li><strong>Φόρμα επικοινωνίας:</strong> Όνομα, email, μήνυμα</li>
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">3. Για ποιους σκοπούς</h2>
          <ul className="text-slate-600 space-y-2 list-disc list-inside">
            <li>Παροχή και βελτίωση των υπηρεσιών του ιστότοπου</li>
            <li>Αποστολή newsletter (μόνο με ρητή συγκατάθεση)</li>
            <li>Ανάλυση κοινού για βελτίωση περιεχομένου</li>
            <li>Εκπλήρωση νομικών υποχρεώσεων</li>
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">4. Νομική βάση (GDPR)</h2>
          <p className="text-slate-600">Η επεξεργασία βασίζεται σε: (α) νόμιμο συμφέρον για ανάλυση κοινού και βελτίωση, (β) συγκατάθεση για newsletter και non-essential cookies, (γ) εκτέλεση σύμβασης για εγγεγραμμένους χρήστες.</p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">5. Κοινοποίηση σε τρίτους</h2>
          <p className="text-slate-600 mb-2">Δεν πουλάμε δεδομένα. Κοινοποιούμε μόνο σε:</p>
          <ul className="text-slate-600 space-y-1 list-disc list-inside">
            <li>Παρόχους hosting/υποδομής (εντός ΕΕ)</li>
            <li>Εργαλεία analytics (ανωνυμοποιημένα δεδομένα)</li>
            <li>Αρχές, εφόσον απαιτείται από νόμο</li>
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">6. Τα δικαιώματά σας</h2>
          <p className="text-slate-600 mb-2">Σύμφωνα με GDPR έχετε δικαίωμα:</p>
          <ul className="text-slate-600 space-y-1 list-disc list-inside">
            <li>Πρόσβασης στα δεδομένα σας</li>
            <li>Διόρθωσης ανακριβών δεδομένων</li>
            <li>Διαγραφής («δικαίωμα στη λήθη»)</li>
            <li>Φορητότητας δεδομένων</li>
            <li>Εναντίωσης στην επεξεργασία</li>
            <li>Ανάκλησης συγκατάθεσης ανά πάσα στιγμή</li>
          </ul>
          <p className="text-slate-600 mt-3">Άσκηση δικαιωμάτων: <a href={`mailto:${BRAND.privacyEmail}`} className="text-red-600 hover:underline">{BRAND.privacyEmail}</a></p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">7. Χρόνος Διατήρησης</h2>
          <p className="text-slate-600">Τα δεδομένα newsletter διατηρούνται έως την απεγγραφή. Τα analytics δεδομένα διατηρούνται για 14 μήνες (Google Analytics standard). Τα logs διατηρούνται για 90 ημέρες.</p>
        </section>

        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-3">8. Επικοινωνία</h2>
          <p className="text-slate-600">Για οποιαδήποτε ερώτηση σχετικά με αυτή την πολιτική ή τα δικαιώματά σας: <a href={`mailto:${BRAND.privacyEmail}`} className="text-red-600 hover:underline">{BRAND.privacyEmail}</a></p>
        </section>
      </div>
    </div>
  );
}
