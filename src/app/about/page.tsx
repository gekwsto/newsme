import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Zap, Brain, Target, Users, Mail } from 'lucide-react';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: 'Σχετικά με εμάς',
  description: `Μάθε για την ιστορία, την αποστολή και την ομάδα πίσω από το ${BRAND.name}.`,
};

const team = [
  {
    name: 'Νίκος Παπαδόπουλος',
    role: 'Αρχισυντάκτης / AI & Τεχνολογία',
    avatar: 'https://i.pravatar.cc/150?img=12',
    bio: 'Τεχνολογικός αναλυτής με 10 χρόνια εμπειρία στα media. Πρώην TechRadar Greece.',
    twitter: '@nikospapad_tech',
  },
  {
    name: 'Μαρία Κωνσταντίνου',
    role: 'Δημοσιογράφος / Οικονομία',
    avatar: 'https://i.pravatar.cc/150?img=47',
    bio: 'Οικονομική δημοσιογράφος, πρώην Financial Times Greece. Ειδικεύεται σε markets και fintech.',
    twitter: '@maria_oikonomia',
  },
  {
    name: 'Γιώργος Αλεξίου',
    role: 'Συντάκτης / Επιχειρηματικότητα',
    avatar: 'https://i.pravatar.cc/150?img=33',
    bio: 'Επιχειρηματικός αναλυτής, σύμβουλος startups και mentor σε accelerators.',
    twitter: '@giorgos_startup',
  },
  {
    name: 'Ελένη Σταυρίδου',
    role: 'Ανταποκρίτρια / Κόσμος',
    avatar: 'https://i.pravatar.cc/150?img=5',
    bio: 'Διεθνής ανταποκρίτρια, με έδρα Βρυξέλλες. Καλύπτει ΕΕ, γεωπολιτική και διεθνή θέματα.',
    twitter: '@elena_world',
  },
];

const values = [
  {
    icon: Brain,
    title: 'Έξυπνη Ανάλυση',
    description:
      'Δεν δίνουμε απλά ειδήσεις — τις εξηγούμε, τις συσχετίζουμε και τις αναλύουμε με πλαίσιο.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: Zap,
    title: 'Ταχύτητα & Ακρίβεια',
    description: 'Πρώτοι στην επικαιρότητα, χωρίς ποτέ να θυσιάζουμε την ακρίβεια για ταχύτητα.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: Target,
    title: 'Αμεροληψία',
    description:
      'Παρουσιάζουμε τα γεγονότα ευθέως. Οι απόψεις μας ξεχωρίζουν σαφώς από τα γεγονότα.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Users,
    title: 'Κοινότητα',
    description:
      'Γράφουμε για ανθρώπους που θέλουν να καταλαβαίνουν τον κόσμο, όχι μόνο να τον παρακολουθούν.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="w-16 h-16 bg-red-600 rounded-xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-black text-2xl">AI</span>
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-4">Σχετικά με εμάς</h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
          <em className="not-italic font-semibold text-slate-700">
            &ldquo;Η επικαιρότητα με έξυπνο σχολιασμό.&rdquo;
          </em>
          <br />
          Δεν φτιάξαμε ακόμα ένα site ειδήσεων. Φτιάξαμε ένα site που σε βοηθά να
          <strong className="text-slate-900"> καταλαβαίνεις</strong> τις ειδήσεις.
        </p>
      </div>

      {/* Mission */}
      <section className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 mb-16">
        <h2 className="text-2xl font-black mb-4">Η Αποστολή μας</h2>
        <p className="text-slate-300 leading-relaxed text-lg mb-4">
          Ζούμε σε μια εποχή πληροφοριακής υπερφόρτωσης. Νέα έρχονται από παντού, με ρυθμό που
          κάνει αδύνατο να ξέρεις τι είναι σημαντικό και τι είναι θόρυβος.
        </p>
        <p className="text-slate-300 leading-relaxed text-lg mb-4">
          Το NewsMe γεννήθηκε για να λύσει αυτό το πρόβλημα. Φέρνουμε τις πιο σημαντικές
          ειδήσεις για <strong className="text-white">AI, τεχνολογία, οικονομία</strong> και
          επικαιρότητα — και τις εξηγούμε με τρόπο που έχει νόημα.
        </p>
        <p className="text-white font-semibold text-lg">
          Επικαιρότητα που την καταλαβαίνεις. Ανάλυση που σε βοηθά να αποφασίσεις.
        </p>
      </section>

      {/* Values */}
      <section className="mb-16">
        <h2 className="text-2xl font-black text-slate-900 mb-8 text-center">Οι Αξίες μας</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <div
                key={value.title}
                className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"
              >
                <div className={`w-10 h-10 ${value.bg} ${value.color} rounded-lg flex items-center justify-center mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{value.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{value.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Team */}
      <section className="mb-16">
        <h2 className="text-2xl font-black text-slate-900 mb-8 text-center">Η Ομάδα</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {team.map((member) => (
            <div
              key={member.name}
              className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex gap-4"
            >
              <div className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-200 shrink-0">
                <Image
                  src={member.avatar}
                  alt={member.name}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">{member.name}</p>
                <p className="text-red-600 text-xs font-semibold mb-2">{member.role}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{member.bio}</p>
                <p className="text-slate-400 text-xs mt-1">{member.twitter}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Integration note */}
      <section className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-8 mb-16">
        <h2 className="text-xl font-black text-slate-900 mb-3">AI & Ανθρώπινη Επιμέλεια</h2>
        <p className="text-slate-600 leading-relaxed">
          Το NewsMe χρησιμοποιεί τεχνητή νοημοσύνη για να <strong>υποβοηθεί</strong> τη
          δημιουργία περιεχομένου — αλλά κάθε άρθρο ελέγχεται, επιμελείται και εγκρίνεται από
          ανθρώπους πριν δημοσιευτεί. Η ευθύνη για την ακρίβεια και την ποιότητα είναι πάντα
          ανθρώπινη.
        </p>
      </section>

      {/* CTA */}
      <div className="text-center">
        <h2 className="text-2xl font-black text-slate-900 mb-3">Επικοινώνησε μαζί μας</h2>
        <p className="text-slate-500 mb-6">
          Έχεις πρόταση, παρατήρηση ή θέλεις να συνεργαστείς;
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-full transition-colors"
        >
          <Mail size={16} />
          Επικοινωνία
        </Link>
      </div>
    </div>
  );
}
