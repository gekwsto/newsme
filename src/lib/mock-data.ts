import { Article, Category, AdminArticle } from '@/types';

export const categories: Category[] = [
  { name: 'AI', slug: 'ai', color: '#7c3aed' },
  { name: 'Τεχνολογία', slug: 'texnologia', color: '#1d4ed8' },
  { name: 'Οικονομία', slug: 'oikonomia', color: '#059669' },
  { name: 'Επιχειρηματικότητα', slug: 'epixeirimatikotita', color: '#c2410c' },
  { name: 'Ελλάδα', slug: 'ellada', color: '#0891b2' },
  { name: 'Κόσμος', slug: 'kosmos', color: '#4338ca' },
  { name: 'Viral', slug: 'viral', color: '#db2777' },
  { name: 'Απόψεις', slug: 'apopseis', color: '#475569' },
];

export const getCategoryBySlug = (slug: string): Category | undefined =>
  categories.find((c) => c.slug === slug);

const authors = {
  nikos: {
    name: 'Νίκος Παπαδόπουλος',
    avatar: 'https://i.pravatar.cc/150?img=12',
    bio: 'Τεχνολογικός αναλυτής και ειδικός AI με 10 χρόνια εμπειρία.',
  },
  maria: {
    name: 'Μαρία Κωνσταντίνου',
    avatar: 'https://i.pravatar.cc/150?img=47',
    bio: 'Δημοσιογράφος οικονομικής επικαιρότητας, πρώην FT.',
  },
  giorgos: {
    name: 'Γιώργος Αλεξίου',
    avatar: 'https://i.pravatar.cc/150?img=33',
    bio: 'Επιχειρηματικός αναλυτής και σύμβουλος startups.',
  },
  elena: {
    name: 'Ελένη Σταυρίδου',
    avatar: 'https://i.pravatar.cc/150?img=5',
    bio: 'Ανταποκρίτρια εξωτερικού, ειδική σε διεθνή θέματα.',
  },
  kostas: {
    name: 'Κώστας Μητρόπουλος',
    avatar: 'https://i.pravatar.cc/150?img=18',
    bio: 'Γνώμη και ανάλυση για ελληνική κοινωνία και πολιτική.',
  },
};

export const articles: Article[] = [
  {
    id: '1',
    slug: 'chatgpt-5-allazei-ta-panta-texniti-noimosini',
    title: 'ChatGPT-5 αλλάζει τα πάντα: Ο κόσμος της τεχνητής νοημοσύνης ποτέ δεν ήταν ίδιος',
    excerpt:
      'Η OpenAI κυκλοφόρησε το ChatGPT-5 και ο κόσμος τεχνολογίας μιλάει για επανάσταση. Τι αλλάζει, γιατί αυτό επηρεάζει καθένα μας και τι σημαίνει για τις θέσεις εργασίας.',
    content: `<p>Η OpenAI έκανε πραγματικότητα αυτό που πολλοί θεωρούσαν αδύνατο: ένα μοντέλο τεχνητής νοημοσύνης που δεν είναι απλά "εντυπωσιακό" αλλά <strong>πραγματικά χρήσιμο</strong> σε καθημερινό επίπεδο.</p>

<h2>Τι κάνει διαφορετικό το ChatGPT-5;</h2>
<p>Σε αντίθεση με τις προηγούμενες εκδόσεις, το ChatGPT-5 συνδυάζει κατανόηση κειμένου, εικόνας, ήχου και βίντεο σε ένα ενιαίο σύστημα. Μπορεί να συλλογίζεται σε βάθος πάνω σε σύνθετα επιστημονικά προβλήματα και να αιτιολογεί τις αποφάσεις του βήμα-βήμα.</p>

<p>Τα benchmarks δείχνουν ότι ξεπερνά για πρώτη φορά ανθρώπους ειδικούς σε τομείς όπως η ιατρική διάγνωση και η νομική ανάλυση — όχι μόνο σε ταχύτητα, αλλά και σε ακρίβεια.</p>

<h2>Ποιοι επηρεάζονται πρώτοι;</h2>
<p>Από δημοσιογράφους και δικηγόρους μέχρι γιατρούς και μηχανικούς λογισμικού, κανείς δεν μένει αλώβητος. Σύμφωνα με έρευνα της McKinsey, έως το 2028 το 40% των εργασιών που σήμερα κάνουν γνωστικοί εργαζόμενοι θα μπορούν να αυτοματοποιηθούν μερικώς ή πλήρως.</p>

<h2>Η ελληνική πραγματικότητα</h2>
<p>Στην Ελλάδα, η υιοθέτηση εργαλείων AI αυξάνεται με ρυθμό 48% ετησίως. Εταιρείες όπως η Eurobank, ο ΟΤΕ και η Cosmote ήδη χρησιμοποιούν AI για αυτοματοποίηση διαδικασιών, εξυπηρέτηση πελατών και ανάλυση δεδομένων.</p>

<blockquote>"Δεν μιλάμε πια για το μέλλον. Μιλάμε για το σήμερα — και η Ελλάδα πρέπει να τρέξει για να μην μείνει πίσω." — Ανώτατο στέλεχος ελληνικής tech εταιρείας</blockquote>

<p>Το ερώτημα δεν είναι πλέον <em>αν</em> η τεχνητή νοημοσύνη θα αλλάξει τη ζωή μας, αλλά πόσο γρήγορα είμαστε έτοιμοι να προσαρμοστούμε. Και αυτό, αγαπητοί αναγνώστες, είναι η πιο κρίσιμη ερώτηση της δεκαετίας.</p>`,
    category: categories[0],
    author: authors.nikos,
    publishedAt: '2025-06-10T09:00:00Z',
    readTime: 6,
    imageUrl:
      'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?auto=format&fit=crop&w=1200&q=80',
    featured: true,
    breaking: true,
    tags: ['ChatGPT', 'AI', 'OpenAI', 'Εργασία'],
    views: 18740,
    aiCommentary: 'Το ChatGPT-5 σηματοδοτεί μια κομβική στιγμή στην ιστορία της τεχνητής νοημοσύνης. Η πολυτροπική αρχιτεκτονία του επιτρέπει συλλογισμό που υπερβαίνει τα όρια της απλής πρόβλεψης επόμενης λέξης. Για την ελληνική αγορά εργασίας, η προσαρμογή απαιτεί επένδυση σε δεξιότητες που συνδυάζουν τεχνική κατανόηση με κριτική σκέψη — τομείς όπου η AI παραμένει πίσω.',
  },
  {
    id: '2',
    slug: 'apple-intelligence-iphone-17-epanastasi',
    title: 'Apple Intelligence στο iPhone 17: Γιατί ακόμα και οι σκεπτικιστές αλλάζουν γνώμη',
    excerpt:
      'Η Apple έδειξε επιτέλους τι σημαίνει AI στην πράξη — και η απάντηση έκανε το Twitter να εκραγεί. Όλες οι λεπτομέρειες για το πιο αναμενόμενο smartphone της χρονιάς.',
    content: `<p>Το iPhone 17 δεν είναι απλά ένα νέο smartphone. Είναι η πρώτη φορά που η Apple βάζει ουσιαστικά τεχνητή νοημοσύνη στο hardware — και η διαφορά φαίνεται αμέσως.</p>

<h2>Τι κάνει το Apple Intelligence;</h2>
<p>Η νέα τσιπσέτ A19 Pro επεξεργάζεται AI tasks εντελώς on-device, χωρίς να στέλνει δεδομένα στο cloud. Αυτό σημαίνει απόλυτο privacy και εξαιρετική ταχύτητα. Το σύστημα μπορεί να:</p>
<ul>
  <li>Ανακαλεί email, φωτογραφίες και μηνύματα με φυσική γλώσσα</li>
  <li>Γράφει και επεξεργάζεται κείμενο βάσει context</li>
  <li>Δημιουργεί εικόνες και emoji on-the-fly</li>
  <li>Ελέγχει apps με φωνητικές εντολές χωρίς internet</li>
</ul>

<p>Η ελληνική γλώσσα υποστηρίζεται πλήρως από την πρώτη μέρα — κάτι που η Apple δεν έκανε σχεδόν ποτέ με τόση προσοχή.</p>`,
    category: categories[1],
    author: authors.nikos,
    publishedAt: '2025-06-09T14:30:00Z',
    readTime: 4,
    imageUrl:
      'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Apple', 'iPhone', 'AI', 'Smartphone'],
    views: 9340,
    aiCommentary: 'Το Apple Intelligence αντιπροσωπεύει μια στρατηγική απόφαση: AI on-device για λόγους privacy, χωρίς εξάρτηση από cloud. Αυτή η προσέγγιση δίνει στην Apple ανταγωνιστικό πλεονέκτημα σε αγορές με αυστηρούς κανονισμούς, όπως η Ευρώπη. Η πλήρης υποστήριξη ελληνικής γλώσσας υποδηλώνει ότι η Apple θεωρεί τη νοτιοανατολική Ευρώπη αναπτυσσόμενη αγορά.',
  },
  {
    id: '3',
    slug: 'ellhniko-aep-rekord-3-2-anaptiksi',
    title: 'Ελληνικό ΑΕΠ: +3,2% — Ποιοι κερδίζουν και ποιοι μένουν πίσω από την ανάπτυξη',
    excerpt:
      'Νέα στοιχεία της Eurostat δείχνουν ότι η Ελλάδα ξεπερνά τον ευρωπαϊκό μέσο όρο ανάπτυξης για τρίτη συνεχή χρονιά. Αλλά η ανισότητα παραμένει ανησυχητική.',
    content: `<p>Η ελληνική οικονομία αναπτύχθηκε κατά 3,2% το 2024, σημαντικά πάνω από τον ευρωπαϊκό μέσο όρο του 1,4%, σύμφωνα με τα τελευταία στοιχεία της Eurostat.</p>

<h2>Οι κινητήριες δυνάμεις</h2>
<p>Ο τουρισμός παραμένει η ατμομηχανή, με 35 εκατ. επισκέπτες και έσοδα €22 δισ. Ακολουθεί η ναυτιλία, με έσοδα-ρεκόρ, και ο κλάδος τεχνολογίας που έχει διπλασιαστεί σε μέγεθος εντός τριετίας.</p>

<h2>Η άλλη πλευρά</h2>
<p>Αρκεί να κοιτάξει κάποιος τα ποσοστά φτώχειας για να καταλάβει ότι η ανάπτυξη δεν φτάνει ισομερώς παντού. Το 18% των Ελλήνων ζει ακόμα κάτω από το όριο της φτώχειας.</p>`,
    category: categories[2],
    author: authors.maria,
    publishedAt: '2025-06-09T10:00:00Z',
    readTime: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['ΑΕΠ', 'Οικονομία', 'Ελλάδα', 'Ανάπτυξη'],
    views: 7210,
    aiCommentary: 'Ο ρυθμός ανάπτυξης 3,2% είναι εντυπωσιακός σε ευρωπαϊκό πλαίσιο, ωστόσο η υπερεξάρτηση από τουρισμό και ναυτιλία εκθέτει την οικονομία σε εξωτερικά σοκ. Η διαφοροποίηση προς τεχνολογία και startups είναι το σωστό βήμα, αλλά χρειάζεται εκπαιδευτική μεταρρύθμιση που το εκπαιδευτικό σύστημα αδυνατεί ακόμα να προσφέρει.',
  },
  {
    id: '4',
    slug: 'ellhniki-startup-15-ekat-series-a',
    title: 'Startup από τη Θεσσαλονίκη μάζεψε €15 εκατ. Series A — Η ελληνική επιχειρηματικότητα ανθεί',
    excerpt:
      'Η Intelliflow, startup SaaS logistics από τη Θεσσαλονίκη, ολοκλήρωσε επιτυχώς γύρο χρηματοδότησης €15 εκατ. από ευρωπαϊκά funds. Πώς το κατάφεραν από μηδενική βάση;',
    content: `<p>Η Intelliflow ιδρύθηκε το 2022 από τρεις αποφοίτους του Αριστοτέλειου Πανεπιστημίου Θεσσαλονίκης. Σήμερα έχει 120 εργαζόμενους, πελάτες σε 12 χώρες και μόλις ολοκλήρωσε έναν από τους μεγαλύτερους γύρους χρηματοδότησης που έχει δει ποτέ ελληνική startup.</p>

<h2>Το προϊόν που κέρδισε την αγορά</h2>
<p>Η πλατφόρμα της Intelliflow χρησιμοποιεί AI για να βελτιστοποιεί logistics chains σε real time. Σε μια εποχή που η supply chain disruption έχει γίνει νόρμα, αυτό είναι χρυσός.</p>

<h2>Τι λένε οι ιδρυτές;</h2>
<p>"Η Θεσσαλονίκη έχει ταλέντο παγκόσμιου επιπέδου. Απλά χρειάζεται και το ecosystem να ακολουθήσει" λέει ο CEO Θανάσης Δήμου.</p>`,
    category: categories[3],
    author: authors.giorgos,
    publishedAt: '2025-06-08T16:45:00Z',
    readTime: 4,
    imageUrl:
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Startup', 'Επενδύσεις', 'Θεσσαλονίκη', 'SaaS'],
    views: 5890,
  },
  {
    id: '5',
    slug: 'athina-koryfi-remote-work-eyropaikwn-poleon',
    title: 'Η Αθήνα στην κορυφή για remote work: Τι την κάνει να ξεχωρίζει από Λισαβόνα και Βαρκελώνη',
    excerpt:
      'Νέα έρευνα του Nomad List ανακηρύσσει την Αθήνα στις top 5 πόλεις παγκοσμίως για digital nomads. Κόστος, ποιότητα ζωής και κοινωνικότητα την ανεβάζουν στην κορυφή.',
    content: `<p>Σε μια εποχή που οι digital nomads αποτελούν μια αναπτυσσόμενη κατηγορία εργαζόμενων, η Αθήνα αναδεικνύεται ως μια από τις πιο ελκυστικές επιλογές παγκοσμίως.</p>

<h2>Γιατί η Αθήνα;</h2>
<p>Η έρευνα επισημαίνει τον συνδυασμό χαμηλού κόστους ζωής σε σχέση με τη Δυτική Ευρώπη, εξαιρετικής γαστρονομίας, φιλόξενης κουλτούρας και γρήγορου ίντερνετ ως τους βασικούς λόγους.</p>`,
    category: categories[4],
    author: authors.elena,
    publishedAt: '2025-06-08T11:00:00Z',
    readTime: 3,
    imageUrl:
      'https://images.unsplash.com/photo-1555993539-1732b0258235?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Αθήνα', 'Remote Work', 'Digital Nomads', 'Τουρισμός'],
    views: 12340,
  },
  {
    id: '6',
    slug: 'polemios-chips-ipa-kina-ti-einai-se-staki',
    title: 'Πόλεμος chips ΗΠΑ-Κίνας: Ποιος κερδίζει τη μάχη που θα καθορίσει τον 21ο αιώνα',
    excerpt:
      'Η TSMC, η Nvidia και η Huawei βρίσκονται στο επίκεντρο μιας γεωπολιτικής αντιπαράθεσης που έχει τεράστιες συνέπειες για όλο τον κόσμο. Όλα όσα πρέπει να γνωρίζετε.',
    content: `<p>Τα semiconductors είναι το νέο πετρέλαιο. Και ο πόλεμος για τον έλεγχό τους είναι ήδη εδώ — με ποντάρισμα τρισεκατομμυρίων δολαρίων.</p>

<h2>Η κατάσταση σήμερα</h2>
<p>Οι ΗΠΑ έχουν επιβάλει αυστηρούς περιορισμούς στην εξαγωγή προηγμένων chips στην Κίνα. Η απάντηση της Κίνας; Επένδυση €180 δισ. για να κτίσει δική της ημιαγωγική βιομηχανία από μηδενική βάση.</p>`,
    category: categories[5],
    author: authors.elena,
    publishedAt: '2025-06-07T13:00:00Z',
    readTime: 7,
    imageUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['ΗΠΑ', 'Κίνα', 'Chips', 'Γεωπολιτική'],
    views: 8120,
  },
  {
    id: '7',
    slug: 'skylos-pou-milai-ellinika-internet-sensation',
    title: 'Ο σκύλος που "μιλάει" ελληνικά έγινε το νέο internet sensation με 50 εκατ. views',
    excerpt:
      'Ο Max, ένας Golden Retriever από τη Θεσσαλονίκη, έγινε παγκόσμιο φαινόμενο όταν ένα βίντεο με τις "απαντήσεις" του στα ελληνικά έφτασε τα 50 εκατ. views σε 3 μέρες.',
    content: `<p>Αν υπάρχει κάτι που μπορεί να ενώσει τον κόσμο σε δύσκολες εποχές, αυτό είναι ένας σκύλος που "μιλάει" ελληνικά.</p>

<p>Ο Max, ένας τετράχρονος Golden Retriever, έγινε ο πρωταγωνιστής ενός βίντεο που ανέβασε η ιδιοκτήτριά του Σοφία Τσούκα στο TikTok. Στο βίντεο, ο Max φαίνεται να "απαντά" στις ερωτήσεις της κόρης της με χαρακτηριστικές φωνούλες που μοιάζουν εκπληκτικά με ελληνικές λέξεις.</p>

<h2>Πώς έγινε viral;</h2>
<p>Το βίντεο ξεκίνησε από ένα ταπεινό 100 views. Στη συνέχεια, ένας Αμερικανός influencer το κοινοποίησε, και από εκεί αρχίζει η ιστορία να γίνεται παράξενη. Σε λιγότερο από 24 ώρες, το Max είχε γίνει trending σε 15 χώρες.</p>`,
    category: categories[6],
    author: authors.kostas,
    publishedAt: '2025-06-07T09:30:00Z',
    readTime: 2,
    imageUrl:
      'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Viral', 'Σκύλος', 'TikTok', 'Humor'],
    views: 24500,
  },
  {
    id: '8',
    slug: 'ellada-ekpaideytiki-epanastasi-apopsi',
    title: 'Γιατί η Ελλάδα χρειάζεται επανάσταση στην εκπαίδευση — και γιατί δεν γίνεται ποτέ',
    excerpt:
      'Η χώρα μας ξοδεύει λιγότερα από οποιαδήποτε άλλη ευρωπαϊκή χώρα για εκπαίδευση ανά μαθητή. Το αποτέλεσμα είναι ορατό — και τα δεδομένα PISA 2024 το επιβεβαιώνουν με τον χειρότερο τρόπο.',
    content: `<p>Κάθε χρόνο η συζήτηση για την εκπαιδευτική μεταρρύθμιση ξεκινά και σβήνει χωρίς να γίνεται τίποτα ουσιαστικό. Φέτος, με τα νέα αποτελέσματα PISA να δείχνουν την Ελλάδα κάτω από τον μέσο όρο του ΟΟΣΑ σε Μαθηματικά, Επιστήμες και Ανάγνωση, ίσως είναι η ώρα να μιλήσουμε ειλικρινά.</p>

<h2>Τα νούμερα που δεν λένε ψέματα</h2>
<p>Η Ελλάδα ξοδεύει €4.200 ανά μαθητή ετησίως. Ο ευρωπαϊκός μέσος όρος είναι €9.800. Η Φινλανδία ξοδεύει €12.400. Και τα αποτελέσματα αντικατοπτρίζουν αυτή τη διαφορά.</p>

<h2>Τι χρειάζεται πραγματικά;</h2>
<p>Δεν είναι μόνο χρήματα. Είναι ανατροπή ενός συστήματος που δίνει έμφαση στην απομνημόνευση αντί στην κριτική σκέψη. Που αντιμετωπίζει τον καθηγητή ως δημόσιο υπάλληλο αντί ως επαγγελματία.</p>`,
    category: categories[7],
    author: authors.kostas,
    publishedAt: '2025-06-06T18:00:00Z',
    readTime: 6,
    imageUrl:
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Εκπαίδευση', 'PISA', 'Κοινωνία', 'Μεταρρύθμιση'],
    views: 6750,
  },
  {
    id: '9',
    slug: 'google-gemini-ultra-2-chatgpt-sigkrisi',
    title: 'Google Gemini Ultra 2 vs ChatGPT-5: Η μάχη των AI titans που ο καθένας μπορεί να δει',
    excerpt:
      'Δοκιμάσαμε τα δύο ισχυρότερα AI models του κόσμου σε 20 διαφορετικές κατηγορίες εργασιών. Τα αποτελέσματα έκαναν ακόμα και εμάς να εκπλαγούμε.',
    content: `<p>Η "AI wars" μπήκε σε νέα φάση. Το Google Gemini Ultra 2 έφτασε επιτέλους και η σύγκριση με το ChatGPT-5 έχει γίνει το πιο συζητημένο θέμα στον τεχνολογικό κόσμο.</p>

<h2>Η μεθοδολογία μας</h2>
<p>Δοκιμάσαμε και τα δύο models σε 20 κατηγορίες: coding, creative writing, factual Q&A, math, image analysis, summarization, και πολλά άλλα. Χρησιμοποιήσαμε blind testing για να αποφύγουμε προκαταλήψεις.</p>`,
    category: categories[0],
    author: authors.nikos,
    publishedAt: '2025-06-06T12:00:00Z',
    readTime: 8,
    imageUrl:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Google', 'Gemini', 'ChatGPT', 'AI Comparison'],
    views: 11230,
  },
  {
    id: '10',
    slug: 'bitcoin-100000-ti-simainei-gia-emas',
    title: 'Bitcoin πέρασε τα $100.000 — Η ανάλυση που δεν θα διαβάσετε αλλού',
    excerpt:
      'Το Bitcoin έγραψε ιστορία ξεπερνώντας τα $100.000 για πρώτη φορά. Τι οδήγησε σε αυτό, τι σημαίνει για την οικονομία και — το σημαντικότερο — τι έρχεται μετά.',
    content: `<p>Η στιγμή ήρθε. Το Bitcoin διέσπασε το ψυχολογικό όριο των $100.000 και ο κόσμος κρυπτονομισμάτων δεν ήταν ποτέ ίδιος ξανά.</p>

<h2>Τι οδήγησε σε αυτό;</h2>
<p>Η έγκριση των Bitcoin ETFs από την SEC, η θεσμική υιοθέτηση από εταιρείες του S&P 500 και η νέα πολιτική της Fed συνέβαλαν σε αυτή την άνοδο που λίγοι ανέμεναν τόσο γρήγορα.</p>`,
    category: categories[2],
    author: authors.maria,
    publishedAt: '2025-06-05T20:00:00Z',
    readTime: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Bitcoin', 'Κρυπτονόμισμα', 'Επένδυση', 'Finance'],
    views: 16800,
  },
  {
    id: '11',
    slug: 'toyrismos-2025-rekord-35-ekat-episkeptes',
    title: 'Τουρισμός 2025: Σπάνε όλα τα ρεκόρ — 35 εκατ. επισκέπτες και €22 δισ. έσοδα',
    excerpt:
      'Η Ελλάδα βιώνει το καλύτερο τουριστικό της καλοκαίρι ever. Τα νούμερα είναι εκπληκτικά — αλλά υπάρχουν και σκοτεινές πλευρές που κανείς δεν θέλει να δει.',
    content: `<p>Τα νούμερα μιλούν μόνα τους: 35 εκατομμύρια τουρίστες, €22 δισ. έσοδα, 6% αύξηση σε σχέση με το 2024. Η Ελλάδα είναι ο hot destination του 2025.</p>

<h2>Ποιες περιοχές κερδίζουν;</h2>
<p>Εκτός από τους κλασικούς προορισμούς (Σαντορίνη, Μύκονος, Κρήτη), φέτος παρατηρείται εκρηκτική αύξηση στη Βόρεια Ελλάδα, τη Χαλκιδική και τη Ρόδο.</p>`,
    category: categories[4],
    author: authors.maria,
    publishedAt: '2025-06-05T10:00:00Z',
    readTime: 4,
    imageUrl:
      'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Τουρισμός', 'Ελλάδα', 'Οικονομία', 'Ρεκόρ'],
    views: 9870,
  },
  {
    id: '12',
    slug: 'eu-ai-act-nees-reglamentaseis-texniti-noimosini',
    title: 'EU AI Act: Πώς οι νέοι ευρωπαϊκοί κανόνες για AI αλλάζουν τα πάντα για εταιρείες και καταναλωτές',
    excerpt:
      'Ο πρώτος νόμος για την τεχνητή νοημοσύνη στον κόσμο μπήκε σε ισχύ στην Ευρώπη. Τι απαγορεύει, τι επιτρέπει και πώς επηρεάζει τις ελληνικές εταιρείες.',
    content: `<p>Η Ευρωπαϊκή Ένωση έγινε η πρώτη δικαιοδοσία παγκοσμίως που εισήγαγε ολοκληρωμένο νομοθετικό πλαίσιο για την τεχνητή νοημοσύνη. Και οι επιπτώσεις θα είναι τεράστιες.</p>

<h2>Τι ορίζει ο νόμος;</h2>
<p>Το AI Act κατηγοριοποιεί τα AI systems ανάλογα με τον κίνδυνο που παρουσιάζουν: minimal risk, limited risk, high risk και unacceptable risk. Τα τελευταία απαγορεύονται πλήρως.</p>`,
    category: categories[5],
    author: authors.elena,
    publishedAt: '2025-06-04T14:00:00Z',
    readTime: 6,
    imageUrl:
      'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['EU', 'AI Act', 'Νομοθεσία', 'Ευρώπη'],
    views: 7340,
  },
  {
    id: '13',
    slug: 'tesla-hellas-ev-kiriarxoun-agora',
    title: 'Tesla στην Ελλάδα: Γιατί τα ηλεκτρικά αυτοκίνητα τριπλασίασαν τις πωλήσεις τους',
    excerpt:
      'Με νέο showroom στη Θεσσαλονίκη και χαμηλότερες τιμές, η Tesla αλλάζει τη δυναμική της ελληνικής αγοράς αυτοκινήτων. Αξίζει να το αγοράσεις;',
    content: `<p>Η Tesla έφερε επανάσταση στην ελληνική αγορά αυτοκινήτων — και τα νούμερα το αποδεικνύουν. Το 2025, ένα στα οχτώ νέα αυτοκίνητα που πωλούνται στην Ελλάδα είναι ηλεκτρικό.</p>`,
    category: categories[1],
    author: authors.nikos,
    publishedAt: '2025-06-04T09:00:00Z',
    readTime: 4,
    imageUrl:
      'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Tesla', 'EV', 'Αυτοκίνητα', 'Τεχνολογία'],
    views: 8450,
  },
  {
    id: '14',
    slug: 'ellhniki-startup-times-forbes-pws-to-kataferan',
    title: 'Η ελληνική startup που έφτασε στους Times — Η ιστορία πίσω από την επιτυχία',
    excerpt:
      'Η Athena.ai, startup AI για υγεία από την Αθήνα, έγινε πρωτοσέλιδο σε Times και Forbes. Συνάντησα τους ιδρυτές και έμαθα πώς χτίζεται μια παγκόσμια επιχείρηση από Ελλάδα.',
    content: `<p>Όταν η Δήμητρα Λεφάκη και ο Παναγιώτης Στεφάνου ίδρυσαν την Athena.ai το 2021, δεν φανταζόταν ότι τρία χρόνια μετά θα γίνονταν πρωτοσέλιδο σε Times και Forbes.</p>`,
    category: categories[3],
    author: authors.giorgos,
    publishedAt: '2025-06-03T16:00:00Z',
    readTime: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1665686306574-1ace09918530?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['Startup', 'AI', 'Επιτυχία', 'Ελλάδα'],
    views: 13200,
  },
  {
    id: '15',
    slug: 'tiktok-challenge-ellhnikoi-xoroi-viral',
    title: 'Viral challenge: Έλληνες χορεύουν παραδοσιακούς χορούς και "σκίζουν" σε TikTok και Instagram',
    excerpt:
      'Το #GreekDanceChallenge έγινε το νέο παγκόσμιο trend με πάνω από 200 εκατ. views. Από τη Νέα Υόρκη μέχρι την Τόκιο, όλοι θέλουν να μάθουν συρτάκι.',
    content: `<p>Το internet ξέρει να εκπλήσσει. Εν μέσω geopolitical tensions και economic uncertainty, αυτό που κατάφερε να ενώσει τον κόσμο ήταν... ένα ελληνικό χορό.</p>

<p>Το #GreekDanceChallenge ξεκίνησε όταν μια ομάδα Ελλήνων φοιτητών στη Νέα Υόρκη ανέβασε ένα βίντεο χορεύοντας καλαματιανό στο Central Park. Σε μία εβδομάδα, το βίντεο είχε 40 εκατ. views.</p>`,
    category: categories[6],
    author: authors.kostas,
    publishedAt: '2025-06-03T11:00:00Z',
    readTime: 3,
    imageUrl:
      'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    tags: ['TikTok', 'Viral', 'Παράδοση', 'Χορός'],
    views: 31000,
  },
];

export const featuredArticle = articles.find((a) => a.featured) ?? articles[0];

export const trendingTopics = [
  { label: '#ChatGPT5', count: '48K συζητήσεις' },
  { label: '#ΕλληνικήΟικονομία', count: '22K συζητήσεις' },
  { label: '#AppleEvent', count: '19K συζητήσεις' },
  { label: '#Bitcoin100K', count: '35K συζητήσεις' },
  { label: '#RemoteWorkΕλλάδα', count: '14K συζητήσεις' },
  { label: '#EUAIAct', count: '11K συζητήσεις' },
];

export const getArticlesByCategory = (slug: string): Article[] =>
  articles.filter((a) => a.category.slug === slug);

export const getArticleBySlug = (slug: string): Article | undefined =>
  articles.find((a) => a.slug === slug);

export const getRelatedArticles = (article: Article, limit = 3): Article[] =>
  articles
    .filter((a) => a.id !== article.id && a.category.slug === article.category.slug)
    .slice(0, limit);

export const adminArticles: AdminArticle[] = [
  {
    ...articles[0],
    id: 'admin-1',
    status: 'pending',
    aiGenerated: true,
    submittedAt: '2025-06-10T08:30:00Z',
    aiPrompt: 'Γράψε άρθρο για τις επιπτώσεις του ChatGPT-5 στην αγορά εργασίας',
  },
  {
    ...articles[2],
    id: 'admin-2',
    status: 'pending',
    aiGenerated: true,
    submittedAt: '2025-06-10T09:15:00Z',
    aiPrompt: 'Ανάλυση οικονομικών δεδομένων Q1 2025 για Ελλάδα',
  },
  {
    ...articles[5],
    id: 'admin-3',
    status: 'approved',
    aiGenerated: true,
    submittedAt: '2025-06-09T14:00:00Z',
    reviewedAt: '2025-06-09T15:30:00Z',
    reviewedBy: 'Νίκος Παπαδόπουλος',
    aiPrompt: 'Ανάλυση γεωπολιτικής κατάστασης chips ΗΠΑ-Κίνας',
  },
  {
    ...articles[8],
    id: 'admin-4',
    status: 'rejected',
    aiGenerated: true,
    submittedAt: '2025-06-09T10:00:00Z',
    reviewedAt: '2025-06-09T11:00:00Z',
    reviewedBy: 'Μαρία Κωνσταντίνου',
    aiPrompt: 'Σύγκριση Google Gemini 2 vs ChatGPT-5',
  },
  {
    ...articles[11],
    id: 'admin-5',
    status: 'pending',
    aiGenerated: true,
    submittedAt: '2025-06-10T10:00:00Z',
    aiPrompt: 'Ανάλυση EU AI Act και επιπτώσεις στις ελληνικές εταιρείες',
  },
];
