import 'dotenv/config';
import { computeSemanticScore, getSemanticMatrixConfig } from '../src/lib/semantic-filter';

const config = getSemanticMatrixConfig();

interface Case {
  label: string;
  title: string;
  excerpt: string;
  expectCategory: string;
  expectMustPass: boolean;
}

const cases: Case[] = [
  // ── Οικονομία: gov_agencies (requiredMatches: 1) ────────────────────────────
  {
    label: 'ΟΠΕΚΑ alone → Οικονομία mustPass',
    title: 'ΟΠΕΚΑ: Πότε πληρώνεται το επίδομα Ιουλίου',
    excerpt: 'Οι δικαιούχοι θα δουν το ποσό στον λογαριασμό τους.',
    expectCategory: 'Οικονομία',
    expectMustPass: true,
  },
  {
    label: 'ΕΦΚΑ alone → Οικονομία mustPass',
    title: 'e-ΕΦΚΑ: Νέα εφαρμογή για ηλεκτρονική αίτηση σύνταξης',
    excerpt: 'Η ψηφιακή πλατφόρμα ξεκινά από τον Σεπτέμβριο.',
    expectCategory: 'Οικονομία',
    expectMustPass: true,
  },
  {
    label: 'ΑΣΕΠ alone → Οικονομία mustPass',
    title: 'ΑΣΕΠ: Νέα προκήρυξη για 800 θέσεις στο Δημόσιο',
    excerpt: 'Οι αιτήσεις υποβάλλονται έως τις 30 Σεπτεμβρίου.',
    expectCategory: 'Οικονομία',
    expectMustPass: true,
  },
  {
    label: 'ΕΝΦΙΑ alone → Οικονομία mustPass',
    title: 'ΕΝΦΙΑ 2026: Πότε έρχονται τα εκκαθαριστικά',
    excerpt: 'Το υπουργείο Οικονομικών ανακοίνωσε τις ημερομηνίες πληρωμής.',
    expectCategory: 'Οικονομία',
    expectMustPass: true,
  },
  {
    label: 'generic_fiscal: 2 matches → Οικονομία mustPass',
    title: 'Αλλαγές στα επιδόματα — νέες πληρωμές Αυγούστου',
    excerpt: 'Τι αλλάζει για τους δικαιούχους και πότε θα δουν τα χρήματα.',
    expectCategory: 'Οικονομία',
    expectMustPass: true,
  },
  {
    label: 'generic_fiscal: 1 match only → should NOT force pass',
    title: 'Νέες πληρωμές για επιχειρήσεις',
    excerpt: 'Ανακοινώθηκαν νέα μέτρα στήριξης.',
    expectCategory: '(none)',
    expectMustPass: false,
  },

  // ── Ελλάδα: breaking_greece (requiredMatches: 1) ──────────────────────────
  {
    label: 'σεισμός → Ελλάδα mustPass',
    title: 'Σεισμός 5,1 Ρίχτερ στη Ζάκυνθο — αισθητός στην Αθήνα',
    excerpt: 'Δεν αναφέρθηκαν ζημιές ή τραυματισμοί.',
    expectCategory: 'Ελλάδα',
    expectMustPass: true,
  },
  {
    label: 'απεργία σήμερα (phrase) → Ελλάδα mustPass',
    title: 'Απεργία σήμερα στα Μέσα Μαζικής Μεταφοράς — ποια δρομολόγια ακυρώνονται',
    excerpt: 'Τα ΜΜΜ δεν θα κυκλοφορήσουν από τις 9 το πρωί.',
    expectCategory: 'Ελλάδα',
    expectMustPass: true,
  },
  {
    label: 'daily_life: σχολεία + αργίες → Ελλάδα mustPass',
    title: 'Κλειστά σχολεία αύριο — αργίες Σεπτεμβρίου 2026',
    excerpt: 'Ποια σχολεία παραμένουν κλειστά και για ποιο λόγο.',
    expectCategory: 'Ελλάδα',
    expectMustPass: true,
  },
  {
    label: 'daily_life: 1 match only → should NOT force pass',
    title: 'Νέα μέτρα για τα σχολεία από το υπουργείο',
    excerpt: 'Αλλαγές στο εκπαιδευτικό σύστημα ανακοινώθηκαν σήμερα.',
    expectCategory: 'Ελλάδα',
    expectMustPass: false,
  },

  // ── Υγεία: health_orgs (requiredMatches: 1) ─────────────────────────────────
  {
    label: 'ΕΟΠΥΥ → Υγεία mustPass',
    title: 'ΕΟΠΥΥ: Νέες ρυθμίσεις για αποζημίωση φαρμάκων',
    excerpt: 'Αλλαγές στη λίστα αποζημιούμενων φαρμάκων από 1η Αυγούστου.',
    expectCategory: 'Υγεία',
    expectMustPass: true,
  },
  {
    label: 'lifestyle_health: 2 matches → Υγεία mustPass',
    title: 'Χοληστερίνη και διατροφή: Τι τρώμε για καλύτερες τιμές',
    excerpt: 'Ειδικοί προτείνουν αυτές τις τροφές για μείωση της χοληστερόλης.',
    expectCategory: 'Υγεία',
    expectMustPass: true,
  },
  {
    label: 'lifestyle_health: βιταμίνη D → Υγεία mustPass',
    title: 'Βιταμίνη D: Τι συμβαίνει αν δεν έχεις αρκετή — συμπτώματα',
    excerpt: 'Η έλλειψη βιταμίνης D σχετίζεται με κόπωση και αδυναμία.',
    expectCategory: 'Υγεία',
    expectMustPass: true,
  },

  // ── Καιρός mustPass ─────────────────────────────────────────────────────────
  {
    label: 'κακοκαιρία → Καιρός mustPass',
    title: 'Κακοκαιρία «Βικτώρια»: Ισχυρές βροχές και καταιγίδες',
    excerpt: 'Η ΕΜΥ εξέδωσε έκτακτο δελτίο επικίνδυνων καιρικών φαινομένων.',
    expectCategory: 'Καιρός',
    expectMustPass: true,
  },
  {
    label: 'Μαρουσάκης → Καιρός mustPass',
    title: 'Μαρουσάκης: Έρχεται κύμα ζέστης — θερμοκρασίες στους 40 βαθμούς',
    excerpt: 'Ο γνωστός μετεωρολόγος προειδοποιεί για καύσωνα την επόμενη εβδομάδα.',
    expectCategory: 'Καιρός',
    expectMustPass: true,
  },
  {
    label: 'daily_weather: καιρός + χιόνια → Καιρός mustPass',
    title: 'Ο καιρός αύριο — χιόνια στα ορεινά, βροχές στην Αττική',
    excerpt: 'Τι αναμένεται για τις επόμενες ώρες σε Αθήνα και Θεσσαλονίκη.',
    expectCategory: 'Καιρός',
    expectMustPass: true,
  },

  // ── Media mustPass ──────────────────────────────────────────────────────────
  {
    label: 'Netflix → Media mustPass',
    title: 'Netflix: Αυτές είναι οι νέες σειρές του Σεπτεμβρίου 2026',
    excerpt: 'Η πλατφόρμα ανακοίνωσε το πρόγραμμά της για τον ερχόμενο μήνα.',
    expectCategory: 'Media',
    expectMustPass: true,
  },
  {
    label: 'ΑΝΤ1 + ΣΚΑΪ → Media via keywords, NOT mustPass',
    title: 'ΑΝΤ1 και ΣΚΑΪ ανακοινώνουν τα νέα προγράμματα φθινοπώρου',
    excerpt: 'Τα δύο κανάλια παρουσίασαν σήμερα τη σεζόν τους.',
    expectCategory: 'Media',
    expectMustPass: false,
  },
  {
    label: 'entertainment: 2 matches → Media mustPass',
    title: 'Τηλεθέαση: Αυτή η σειρά κέρδισε χθες — δείτε τα νούμερα',
    excerpt: 'Ποιο κανάλι επικράτησε στην τηλεθέαση την Πέμπτη βράδυ.',
    expectCategory: 'Media',
    expectMustPass: true,
  },

  // ── Plus mustPass ───────────────────────────────────────────────────────────
  {
    label: 'ζώδια → Plus mustPass',
    title: 'Ζώδια: Οι προβλέψεις για όλα τα ζώδια αυτή την εβδομάδα',
    excerpt: 'Τι λένε τα άστρα για αγάπη, επαγγελματικά και υγεία.',
    expectCategory: 'Plus',
    expectMustPass: true,
  },

  // ── No mustPass: normal keyword scoring ────────────────────────────────────
  {
    label: 'AI news: normal keyword scoring',
    title: 'OpenAI ανακοινώνει GPT-5 — τι αλλάζει για τους developers',
    excerpt: 'Το νέο μοντέλο θα είναι διαθέσιμο μέσω API από τον Σεπτέμβριο.',
    expectCategory: 'AI',
    expectMustPass: false,
  },
  {
    label: 'Κόσμος: normal keyword scoring (Πούτιν)',
    title: 'Πούτιν: Ανακοίνωσε νέες κυρώσεις κατά της Δύσης',
    excerpt: 'Η Ρωσία αντιδρά στις πιέσεις της Ευρωπαϊκής Ένωσης.',
    expectCategory: 'Κόσμος',
    expectMustPass: false,
  },

  // ── Anti-spam: single generic word should NOT force pass ──────────────────
  {
    label: 'ANTI-SPAM: "υγεία" alone → NOT mustPass',
    title: 'Νέα μελέτη για την υγεία — τι δείχνει η έρευνα',
    excerpt: 'Επιστήμονες παρουσίασαν τα αποτελέσματα σε διεθνές συνέδριο.',
    expectCategory: 'Υγεία',
    expectMustPass: false,
  },
  {
    label: 'ANTI-SPAM: "viral" alone → NOT mustPass',
    title: 'Το viral βίντεο που κάνει τον γύρο του διαδικτύου',
    excerpt: 'Ένα αστείο κλιπ με μια γάτα το είδαν εκατομμύρια χρήστες.',
    expectCategory: 'Plus',
    expectMustPass: false,
  },
];

// ─── Run tests ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

console.log('\n════ Semantic MustPass Test Suite ════\n');

for (const tc of cases) {
  const result = computeSemanticScore(
    { id: tc.label, title: tc.title, excerpt: tc.excerpt },
    config
  );

  const gotCategory = result.assignedCategory ?? '(none)';
  const gotMustPass = result.mustPassGroupTriggered !== null;
  const gotScore = result.semanticScore;
  const gotFilter = result.passedSemanticFilter;

  const categoryOk = gotCategory === tc.expectCategory;
  const mustPassOk = gotMustPass === tc.expectMustPass;
  const ok = categoryOk && mustPassOk;

  const status = ok ? '✅' : '❌';
  if (ok) passed++; else failed++;

  console.log(`${status} ${tc.label}`);
  if (!ok) {
    if (!categoryOk)
      console.log(`     category: got "${gotCategory}", want "${tc.expectCategory}"`);
    if (!mustPassOk)
      console.log(`     mustPass: got ${gotMustPass} (group: ${result.mustPassGroupTriggered?.groupName ?? '-'}), want ${tc.expectMustPass}`);
  } else {
    const mpInfo = result.mustPassGroupTriggered
      ? ` [${result.mustPassGroupTriggered.groupName}: ${result.mustPassGroupTriggered.matchedTags.join(', ')}]`
      : '';
    console.log(`     → "${gotCategory}" score=${gotScore} filter=${gotFilter}${mpInfo}`);
  }
}

console.log(`\n════ Results: ${passed}/${cases.length} passed, ${failed} failed ════\n`);
if (failed > 0) process.exit(1);
