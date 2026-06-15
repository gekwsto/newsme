import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';
import {
  GeneratedEvergreenSchema,
  type GeneratedEvergreen,
  type EvergreenArticleType,
  type EvergreenLength,
} from './evergreen-schemas';

const EVERGREEN_MODEL = 'gpt-5';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export interface EvergreenGenerateOptions {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  categoryName: string;
  targetLength: EvergreenLength;
  articleType: EvergreenArticleType;
  estimatedDifficulty: number;
  generateFaq: boolean;
  generateInternalLinks: boolean;
  generateSocialPosts: boolean;
  generateImagePrompt: boolean;
  relatedArticles?: Array<{ title: string; slug: string; keyword: string }>;
}

const articleTypeStructure: Record<EvergreenArticleType, string> = {
  'what-is': `
ΔΟΜΗ ΓΙΑ "ΤΙ ΕΙΝΑΙ" ΑΡΘΡΟ:
<h2>Τι Είναι {primaryKeyword}</h2> — Σαφής ορισμός, παρομοίωση για non-experts, γιατί υπάρχει
<h2>Πώς Λειτουργεί στην Πράξη</h2> — Βήμα-βήμα με <ol>, real-world αναλογία, διάγραμμα σε HTML table αν βοηθά
<h2>Παραδείγματα που Γνωρίζεις Ήδη</h2> — 3-4 συγκεκριμένα παραδείγματα από καθημερινή ζωή/γνωστές εταιρείες
<h2>Πότε και Πού Χρησιμοποιείται</h2> — Use cases σε διαφορετικά contexts (επιχείρηση, καθημερινή ζωή, ειδικοί)
<h2>Πλεονεκτήματα και Δυνατότητες</h2> — Συγκεκριμένα οφέλη, με νούμερα και δεδομένα
<h2>Περιορισμοί και Κίνδυνοι</h2> — Τι δεν μπορεί να κάνει, παρανοήσεις, κίνδυνοι
<h2>Συχνά Λάθη και Παρεξηγήσεις</h2> — Τι πιστεύει λάθος ο κόσμος, πώς να το ξεφύγεις
<h2>Βέλτιστες Πρακτικές</h2> — Actionable συμβουλές για να το χρησιμοποιήσεις σωστά
<h2>Γιατί Έχει Σημασία Σήμερα</h2> — Σύνδεση με σύγχρονες τάσεις, γιατί τώρα και όχι πριν 5 χρόνια
<h2>Συμπέρασμα</h2> — Key takeaway, επόμενα βήματα για τον αναγνώστη`,

  guide: `
ΔΟΜΗ ΓΙΑ GUIDE:
<h2>Εισαγωγή: Γιατί Χρειάζεσαι Αυτόν τον Οδηγό</h2> — Το πρόβλημα που λύνει, τι θα μάθεις
<h2>Πριν Ξεκινήσεις: Τι Χρειάζεσαι</h2> — Prerequisites, εργαλεία, γνώσεις
<h2>Βήμα 1: {συγκεκριμένο βήμα}</h2> με <ol> — κάθε βήμα ΛΕΠΤΟΜΕΡΩΣ με παράδειγμα
<h2>Βήμα 2 έως N</h2> — Τόσα βήματα όσα χρειάζονται (min 4 βήματα)
<h2>Παραδείγματα Εφαρμογής</h2> — 2-3 πλήρη παραδείγματα/σενάρια
<h2>Συχνά Λάθη που Κάνουν οι Αρχάριοι</h2> — Pitfalls, πώς να τα αποφύγεις
<h2>Προχωρημένες Τεχνικές</h2> — Για όσους θέλουν να πάνε παρακάτω
<h2>Εργαλεία και Πόροι</h2> — Recommended tools, links, resources
<h2>Συμπέρασμα</h2> — Σύνοψη βημάτων, επόμενα βήματα`,

  comparison: `
ΔΟΜΗ ΓΙΑ ΣΥΓΚΡΙΣΗ:
<h2>Σύντομη Εισαγωγή</h2> — Γιατί αυτή η σύγκριση έχει νόημα
<h2>Επισκόπηση: {Επιλογή Α} vs {Επιλογή Β}</h2> — Σε 2-3 προτάσεις η ουσία κάθε μίας
<h2>Συγκριτικός Πίνακας</h2> — HTML <table> με 6-10 κριτήρια
<h2>Ανάλυση Ανά Κριτήριο</h2> — Κάθε κριτήριο ως <h3>, με λεπτομέρεια και winner
<h2>Πότε να Επιλέξεις {Α}</h2> — Συγκεκριμένα use cases, target audience
<h2>Πότε να Επιλέξεις {Β}</h2> — Συγκεκριμένα use cases, target audience
<h2>Κόστος και ROI</h2> — Αν υπάρχει pricing/value angle
<h2>Τελική Ετυμηγορία</h2> — Σαφής σύσταση, not "εξαρτάται" — πάρε θέση`,

  tutorial: `
ΔΟΜΗ ΓΙΑ TUTORIAL:
<h2>Τι θα Φτιάξεις/Κάνεις</h2> — End result, screenshots ή περιγραφή
<h2>Τι Χρειάζεσαι</h2> — Requirements, tools, accounts
<h2>Βήμα 1: {τίτλος}</h2> με <ol><li> — ΛΕΠΤΟΜΕΡΩΣ, ακριβείς οδηγίες, τι να δεις
Επανάληψη για κάθε βήμα (min 5 βήματα)
<h2>Αντιμετώπιση Προβλημάτων</h2> — Top 5 errors με λύσεις
<h2>Επόμενα Βήματα</h2> — Τι μπορείς να κάνεις μετά`,

  explainer: `
ΔΟΜΗ ΓΙΑ EXPLAINER:
<h2>Το Πρόβλημα που Λύνει</h2> — Ξεκίνα από το γιατί υπάρχει το concept
<h2>Η Απλή Εξήγηση</h2> — Αναλογία που καταλαβαίνει ο herunder, χωρίς ορολογία
<h2>Πώς Λειτουργεί Τεχνικά</h2> — Για όσους θέλουν βάθος, με <h3> για κάθε component
<h2>Πραγματικά Παραδείγματα</h2> — 3-4 cases από πραγματικές εταιρείες/καταστάσεις
<h2>Συχνές Παρεξηγήσεις</h2> — Τι πιστεύει λάθος ο κόσμος
<h2>Σύγκριση με Παρόμοια Concepts</h2> — Table ή bullets
<h2>Γιατί Έχει Σημασία</h2> — Practical implications, τι αλλάζει για τον αναγνώστη
<h2>Συμπέρασμα</h2>`,

  'best-of': `
ΔΟΜΗ ΓΙΑ BEST-OF:
<h2>Πώς Επιλέξαμε</h2> — Κριτήρια αξιολόγησης, ποιον αφορά η λίστα
<h2>Συγκριτικός Πίνακας</h2> — HTML <table> με τα βασικά χαρακτηριστικά/τιμές
<h2>1. {Όνομα} — {Tagline}</h2> ανά επιλογή:
  • Τι είναι, για ποιον ταιριάζει, πλεονεκτήματα, μειονεκτήματα, τιμή
<h2>Πώς να Επιλέξεις</h2> — Decision tree ή bullets ανά ανάγκη
<h2>Συμπέρασμα</h2> — Τελική σύσταση, best overall vs best value`,

  analysis: `
ΔΟΜΗ ΓΙΑ ANALYSIS:
<h2>Executive Summary</h2> — Κύρια συμπεράσματα upfront (3-5 bullets)
<h2>Το Τοπίο Σήμερα</h2> — Με δεδομένα, αριθμούς, τάσεις
<h2>Ανάλυση: {Κύριο Θέμα Α}</h2> — Βάθος ανάλυσης με <h3>
<h2>Ανάλυση: {Κύριο Θέμα Β}</h2>
<h2>Σύγκριση και Benchmark</h2> — Table ή visual comparison
<h2>Τι Σημαίνει για Εσένα</h2> — Actionable insights
<h2>Προβλέψεις και Τάσεις</h2> — Τι έρχεται, why
<h2>Συμπέρασμα</h2> — Τεκμηριωμένο verdict`,

  faq: `
ΔΟΜΗ ΓΙΑ FAQ:
<h2>Εισαγωγή</h2> — Γιατί αυτές οι ερωτήσεις, ποιον αφορά
Κάθε ερώτηση ως <h2> με πλήρη απάντηση 150-250 λέξεις:
— αρχίζει με direct answer
— ακολουθεί εξήγηση με παράδειγμα
— τελειώνει με practical tip
Min 8 ερωτήσεις, max 12
<h2>Σύνοψη</h2> — Top 5 takeaways`,
};

function buildSystemPrompt(options: EvergreenGenerateOptions): string {
  const structure = articleTypeStructure[options.articleType];
  const contentKeywords = options.secondaryKeywords.filter((k) => !k.startsWith('cluster:'));
  const hasRelated = (options.relatedArticles ?? []).length > 0;

  const internalLinksSection = hasRelated
    ? `━━━ ΕΣΩΤΕΡΙΚΑ LINKS (ΥΠΟΧΡΕΩΤΙΚΟ: 3-5 links) ━━━

Ενσωμάτωσε 3-5 εσωτερικά links ΦΥΣΙΚΑ μέσα στο κείμενο — ΟΧΙ ως ξεχωριστή ενότητα.
Σχετικά άρθρα για linking:
${options.relatedArticles!.map((a) => `  • "${a.title}" → /article/${a.slug}`).join('\n')}

Format: <a href="/article/{slug}">{φυσικό anchor text}</a>
Παράδειγμα: "...όπως εξηγούμε αναλυτικά στο <a href="/article/ti-einai-llm">άρθρο για τα LLMs</a>..."
ΚΑΝΟΝΕΣ:
✓ Anchor text = φυσική περιγραφή του linked θέματος
✓ Links μέσα σε παραγράφους, ΟΧΙ σε headings
✓ Φυσική ροή — σαν editorial αναφορά
✗ ΜΗΝ κάνεις copy-paste τον τίτλο ως anchor text`
    : `━━━ ΕΣΩΤΕΡΙΚΑ LINKS ━━━

Δεν υπάρχουν ακόμα σχετικά δημοσιευμένα άρθρα. Παράλειψε εσωτερικά links.`;

  return `Είσαι κορυφαίος ελληνόφωνος συντάκτης long-form SEO περιεχομένου. Γράφεις evergreen άρθρα που ανταγωνίζονται το top-3 της Google και παραμένουν relevant για χρόνια.

━━━ ΓΛΩΣΣΑ ━━━

ΠΑΝΤΑ Ελληνικά. Ύφος: εγκυκλοπαίδεια + αναλυτής. Τεχνικά θέματα: εξήγησέ τα σαν να μιλάς σε έναν έξυπνο φίλο που δεν είναι ειδικός — όχι σαν documentation.

━━━ WORD COUNT: ΥΠΟΧΡΕΩΤΙΚΟ ━━━

MINIMUM 1800 λέξεις στο contentHtml. ΣΤΟΧΟΣ 2000-2500 λέξεις.
Κάθε ενότητα ΤΟΥΛΑΧΙΣΤΟΝ 150-300 λέξεις. ΜΗΝ σταματήσεις νωρίς.
ΑΝ το άρθρο είναι κάτω από 1800 λέξεις, απέτυχες.

━━━ FEATURED SNIPPET: ΓΡΗΓΟΡΗ ΑΠΑΝΤΗΣΗ (ΥΠΟΧΡΕΩΤΙΚΟ) ━━━

Αμέσως μετά την πρώτη παράγραφο εισαγωγής, ΥΠΟΧΡΕΩΤΙΚΑ:

<div class="quick-answer"><p><strong>Γρήγορη Απάντηση:</strong> [40-60 λέξεις — direct answer στο βασικό ερώτημα. Απλή γλώσσα, χωρίς τεχνικούς όρους.]</p></div>

Στόχος: Position 0 (Featured Snippet) στην Google. ΜΗΝ βάλεις H2 — μόνο div.

━━━ ΥΠΟΧΡΕΩΤΙΚΕΣ ΑΠΑΙΤΗΣΕΙΣ ΠΟΙΟΤΗΤΑΣ ━━━

Κάθε ενότητα ΠΡΕΠΕΙ να περιέχει ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από:
  • Πραγματικό παράδειγμα (συγκεκριμένη εταιρεία, προϊόν, ή κατάσταση)
  • Use case / σενάριο χρήσης με λεπτομέρεια
  • Αριθμό, στατιστικό ή σύγκριση
  • HTML <table> για comparisons/specs (τουλάχιστον 1 φορά στο άρθρο)
  • Βήμα-βήμα <ol> για processes
  • <blockquote> για key insights

━━━ ΤΙ ΑΠΑΓΟΡΕΥΕΤΑΙ ━━━

✗ "υπογραμμίζει τη σημασία" • "αναδεικνύει τις προκλήσεις" • "ζωτικής σημασίας"
✗ "κρίσιμο ορόσημο" • "σε αυτό το πλαίσιο" • "δεν είναι τυχαίο" • "φέρνει στο προσκήνιο"
✗ Γενικόλογες περιγραφές χωρίς παράδειγμα
✗ Filler: "Όπως είδαμε", "Συμπερασματικά", "Αξίζει να σημειωθεί"
✗ Επαναλήψεις — κάθε παράγραφος ΝΕΕΣ πληροφορίες
✗ Μικρές παράγραφοι 1-2 προτάσεων χωρίς ουσία

━━━ ΔΟΜΗ ΑΡΘΡΟΥ ━━━

${structure}

${internalLinksSection}

━━━ SEO TITLE: CTR-OPTIMIZED (max 60 χαρακτήρες — χωρίς brand) ━━━

ΟΧΙ: "Τι είναι [keyword]" (too generic, low CTR)
ΟΧΙ: "[keyword] | ΑΙΣΧΟΛΙΑΣΜΟΣ" (brand προστίθεται αυτόματα)
ΝΑΙ (διάλεξε το καλύτερο για το θέμα):
  • "[Primary Keyword]: Πλήρης Οδηγός 2025"
  • "Τι είναι [Keyword] και Πώς Λειτουργεί — Εξήγηση"
  • "[Keyword] για Αρχάριους: Βήμα Βήμα Οδηγός"
  • "Πώς Λειτουργεί [Keyword]: Παραδείγματα & Χρήσεις"
  • "[Keyword] vs [Εναλλακτικό]: Τι Διαφέρει"

━━━ META DESCRIPTION (140-160 χαρακτήρες ΑΚΡΙΒΩΣ) ━━━

Δομή: Focus keyword + κύριο όφελος + CTA σε active voice
✓ "Μάθετε τι είναι [keyword], πώς λειτουργεί και πού χρησιμοποιείται. Πλήρης οδηγός με παραδείγματα από τον πραγματικό κόσμο."
✗ "Στο άρθρο αυτό εξετάζουμε..."
✗ Κάτω από 140 χαρακτήρες — κόβεις potential CTR

━━━ SEO ΚΑΝΟΝΕΣ ━━━

H1: ΑΚΡΙΒΩΣ ΕΝΑΣ — ξεκινά το contentHtml — περιέχει primary keyword
H2: 8-10 ενότητες
H3: Για sub-topics, παραδείγματα, tips
Primary keyword density: 1-1.5% — φυσική χρήση, ΟΧΙ stuffing
Keyword στις πρώτες 100 λέξεις

━━━ FAQ: ΥΠΟΧΡΕΩΤΙΚΟ (min 5, στόχος 7) ━━━

Ερωτήσεις που ΠΡΑΓΜΑΤΙΚΑ αναζητά ο κόσμος στη Google.
Κάθε απάντηση: Direct answer → Εξήγηση με παράδειγμα → Practical tip (80-150 λέξεις)
Οι απαντήσεις πρέπει να είναι self-contained (featured snippet ready).

━━━ HTML ━━━

Χρησιμοποίησε: <h1>, <h2>, <h3>, <p>, <ul><li>, <ol><li>, <strong>, <em>, <blockquote>, <table><thead><tbody><tr><th><td>, <div class="quick-answer">
ΟΧΙ: <html>, <body>, <head>, <script>, <style>
ΥΠΟΧΡΕΩΤΙΚΑ: Ξεκίνα με <h1> που περιέχει primary keyword

━━━ ΠΑΡΑΜΕΤΡΟΙ ━━━

Primary Keyword: "${options.primaryKeyword}"
Secondary Keywords: ${contentKeywords.length ? contentKeywords.join(', ') : 'auto-generate'}
Κατηγορία: ${options.categoryName}
Τύπος Άρθρου: ${options.articleType}
Δυσκολία Θέματος (1-100): ${options.estimatedDifficulty} ${options.estimatedDifficulty > 60 ? '→ εξήγησε απλά, παραδείγματα από καθημερινή ζωή' : '→ balanced depth, συγκεκριμένα παραδείγματα'}

━━━ JSON OUTPUT FORMAT ━━━

{
  "title": "H1 τίτλος — SEO-optimized, περιέχει primary keyword",
  "slug": "primary-keyword-in-latin-lowercase-with-dashes",
  "excerpt": "2-3 προτάσεις που summary + hook. Περιέχει keyword.",
  "contentHtml": "ΠΛΗΡΕΣ HTML 2000-2500 λέξεις — ξεκινά με <h1>, μετά εισαγωγή, μετά <div class=\\"quick-answer\\">, μετά H2 ενότητες",
  "seoTitle": "CTR-optimized τίτλος max 60 χαρακτήρες — χωρίς brand",
  "seoDescription": "140-160 χαρακτήρες ΑΚΡΙΒΩΣ: keyword + benefit + CTA",
  "searchIntent": "Informational|Commercial|Navigational|Transactional",
  "faqItems": [{"question": "Ερώτηση που κάνει κόσμος στη Google;", "answer": "Direct answer. Εξήγηση. Παράδειγμα. Tip."}, ...],
  "internalLinkSuggestions": [],
  "contentCluster": {"relatedTopics": ["5 σχετικά θέματα"], "futureArticles": ["5 μελλοντικοί τίτλοι"]},
  "socialPosts": {"facebook": "", "linkedin": "", "newsletter": ""},
  "imagePrompt": "Photorealistic editorial photo in English for DALL-E. No text in image. Specific scene that represents '${options.primaryKeyword}'.",
  "imageAltText": "${options.primaryKeyword} — [σύντομη περιγραφή εικόνας, 100-120 χαρακτήρες]",
  "imageTitle": "${options.primaryKeyword} [60-80 χαρακτήρες]",
  "tags": ["5 ακριβείς SEO keywords"]
}`;
}

export async function generateEvergreenContent(
  options: EvergreenGenerateOptions,
): Promise<GeneratedEvergreen> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(options);
  const userPrompt = `Γράψε ${options.articleType} evergreen άρθρο για: "${options.topic}"

Primary Keyword: "${options.primaryKeyword}"
Secondary Keywords: ${options.secondaryKeywords.filter((k) => !k.startsWith('cluster:')).join(', ')}

ΥΠΕΝΘΥΜΙΣΗ: Minimum 1800 λέξεις, στόχος 2000-2500. Κάθε ενότητα με πραγματικό παράδειγμα. FAQ minimum 5 ερωτήσεις.`;

  const response = await client.chat.completions.create({
    model: EVERGREEN_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 14000,
  });

  void logOpenAIUsage({
    service: 'evergreen',
    model: EVERGREEN_MODEL,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: `Evergreen Generation — ${options.topic}`,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Κενή απάντηση από το AI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Η απάντηση του AI δεν είναι έγκυρο JSON');
  }

  const validated = GeneratedEvergreenSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Μη έγκυρη δομή απάντησης AI: ${validated.error.message}`);
  }

  return validated.data;
}

export async function optimizeEvergreenContent(
  original: GeneratedEvergreen,
  issues: string[],
  primaryKeyword: string,
): Promise<GeneratedEvergreen> {
  const client = getClient();

  const systemPrompt = `Είσαι SEO content optimizer. Βελτίωσε το παρακάτω evergreen άρθρο.

━━━ ΠΡΟΒΛΗΜΑΤΑ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΔΙΟΡΘΩΣΕΙΣ ━━━
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

━━━ ΚΑΝΟΝΕΣ ━━━
- Primary keyword "${primaryKeyword}" να εμφανίζεται στο H1 και στις πρώτες 150 λέξεις
- SEO Title: 30-60 χαρακτήρες, περιέχει keyword
- Meta Description: 120-155 χαρακτήρες, περιέχει keyword και CTA
- H2: τουλάχιστον 8 H2 ενότητες
- Min 1800 λέξεις
- Επέστρεψε ΑΚΡΙΒΩΣ το ίδιο JSON format`;

  const response = await client.chat.completions.create({
    model: EVERGREEN_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(original) },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 14000,
  });

  void logOpenAIUsage({
    service: 'evergreen',
    model: EVERGREEN_MODEL,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: 'Evergreen Optimization',
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return original;

  try {
    const validated = GeneratedEvergreenSchema.safeParse(JSON.parse(raw));
    if (validated.success) return validated.data;
  } catch {
    // keep original
  }

  return original;
}
