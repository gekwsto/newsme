import type { Metadata } from 'next';
import Link from 'next/link';
import { canonicalUrl } from '@/lib/seo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: `Πολιτική Χρήσης AI | ${BRAND.name}`,
  description:
    'Πώς χρησιμοποιούμε την τεχνητή νοημοσύνη στη δημιουργία περιεχομένου και τι σημαίνει αυτό για τους αναγνώστες μας.',
  alternates: { canonical: canonicalUrl('/ai-policy') },
};

const principles = [
  {
    title: 'AI ως εργαλείο, όχι αντικατάσταση',
    body: 'Η τεχνητή νοημοσύνη χρησιμοποιείται για να επιταχύνει και να βελτιώσει τη δουλειά των συντακτών μας — όχι για να τους αντικαταστήσει. Κάθε άρθρο που δημοσιεύεται έχει ελεγχθεί, επιμεληθεί και εγκριθεί από έναν ανθρώπινο συντάκτη.',
  },
  {
    title: 'Διαφάνεια για AI περιεχόμενο',
    body: 'Τα άρθρα που δημιουργήθηκαν με σημαντική βοήθεια AI σημαίνονται στο κείμενο με ένδειξη "Δημιουργήθηκε με AI". Ο αναγνώστης έχει πάντα το δικαίωμα να γνωρίζει πώς δημιουργήθηκε το περιεχόμενο που διαβάζει.',
  },
  {
    title: 'Ποιο AI χρησιμοποιούμε',
    body: 'Χρησιμοποιούμε OpenAI GPT-4 για τη δημιουργία πρώτων προχείρων και σχολιασμών. Χρησιμοποιούμε επίσης AI για τη βαθμολόγηση και κατηγοριοποίηση ειδήσεων από RSS feeds, ώστε να επικεντρώνουμε τους ανθρώπινους πόρους στις πιο αξιόλογες ιστορίες.',
  },
  {
    title: 'Τι ΔΕΝ κάνουμε με AI',
    body: 'Δεν δημοσιεύουμε αδιαθεσίωτο AI output. Δεν χρησιμοποιούμε AI για να παράγουμε ψευδείς πληροφορίες ή παραπλανητικό περιεχόμενο. Δεν αφήνουμε AI να αποφασίζει αν ένα άρθρο δημοσιεύεται — αυτή η απόφαση είναι πάντα ανθρώπινη.',
  },
  {
    title: 'Ακρίβεια AI περιεχομένου',
    body: 'Τα AI language models μπορούν να κάνουν λάθη. Για αυτό, κάθε AI-βοηθούμενο άρθρο ελέγχεται για factual accuracy, πριν δημοσιευτεί. Αν εντοπίσετε σφάλμα σε AI-βοηθούμενο άρθρο, επικοινωνήστε μαζί μας.',
  },
  {
    title: 'Δεδομένα και Απόρρητο',
    body: 'Δεν χρησιμοποιούμε προσωπικά δεδομένα αναγνωστών για εκπαίδευση AI μοντέλων. Τα δεδομένα που εισάγουμε στα AI εργαλεία είναι αποκλειστικά δημόσιο περιεχόμενο (RSS feeds, δημοσιευμένα άρθρα).',
  },
];

export default function AIPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-red-600 transition-colors">Αρχική</Link>
        <span>/</span>
        <span className="text-slate-700">Πολιτική Χρήσης AI</span>
      </nav>

      <header className="mb-10">
        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
          <span className="text-violet-600 font-black text-sm">AI</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-3">Πολιτική Χρήσης AI</h1>
        <p className="text-slate-500 leading-relaxed">
          Στο {BRAND.name}, η τεχνητή νοημοσύνη είναι μέρος της δουλειάς μας. Εδώ εξηγούμε ακριβώς πώς και γιατί.
        </p>
        <p className="text-xs text-slate-400 mt-3">Τελευταία ενημέρωση: Ιούνιος 2026</p>
      </header>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-5 mb-8">
        <p className="text-sm font-semibold text-violet-800 mb-1">Η θέση μας με μια πρόταση</p>
        <p className="text-sm text-violet-700 leading-relaxed">
          Χρησιμοποιούμε AI ως εργαλείο δημοσιογραφικής υποστήριξης — κάθε δημοσιευμένο άρθρο φέρει την ευθύνη ανθρώπινου συντάκτη.
        </p>
      </div>

      <div className="space-y-6">
        {principles.map((p) => (
          <section key={p.title} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-black text-slate-900 mb-2">{p.title}</h2>
            <p className="text-slate-600 leading-relaxed text-sm">{p.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 bg-slate-50 rounded-xl p-6 border border-slate-200 text-sm">
        <p className="font-semibold text-slate-800 mb-3">Έχετε ερωτήσεις για τη χρήση AI;</p>
        <p className="text-slate-600 mb-3">Επικοινωνήστε στο <a href={`mailto:${BRAND.aiEmail}`} className="text-red-600 hover:underline">{BRAND.aiEmail}</a></p>
        <div className="flex flex-wrap gap-3">
          <Link href="/editorial-policy" className="text-red-600 hover:text-red-700 hover:underline">Συντακτική Πολιτική</Link>
          <Link href="/transparency" className="text-red-600 hover:text-red-700 hover:underline">Διαφάνεια</Link>
        </div>
      </div>
    </div>
  );
}
