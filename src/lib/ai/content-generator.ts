import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';
import {
  GeneratedArticleSchema,
  type GeneratedArticle,
  type Tone,
  type ArticleType,
  type TargetLength,
} from './schemas';

export const PROMPT_VERSION = 'news-editorial-v2';
export const GENERATOR_VERSION = 'content-generator-2.0';

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

const toneInstructions: Record<Tone, string> = {
  informative: 'αντικειμενικό, δημοσιογραφικό ύφος χωρίς υπερβολές',
  sharp: 'έντονο, κριτικό ύφος με σαφή και τολμηρή θέση',
  simple: 'κατανοητή γλώσσα για γενικό κοινό, χωρίς ορολογία',
  professional: 'αναλυτικό, επαγγελματικό, για ειδικευμένους αναγνώστες',
  viral: 'ζωντανό ύφος, έντονα hooks, shareable γλώσσα',
};

const articleTypeInstructions: Record<ArticleType, string> = {
  original: 'πρωτότυπο άρθρο με ανάλυση και γνώμη',
  summary: 'εις βάθος επεξεργασία υπάρχουσας είδησης',
  opinion: 'editorial με σαφή θέση και επιχειρήματα',
  explainer: 'εξηγεί σε βάθος θέμα με πλήρες context',
  listicle: 'αριθμημένα σημεία, κάθε ένα με τίτλο και ανάλυση',
};

export interface GenerateOptions {
  topic: string;
  categoryName: string;
  tone: Tone;
  articleType: ArticleType;
  targetLength: TargetLength;
  sourceUrl?: string;
  sourceLanguage?: string;
  sourceCountry?: string;
  sourceName?: string;
  generateFacebookPost: boolean;
  generateAiCommentary: boolean;
  matchedKeywords?: string[];
  fullSourceArticle?: string;
}

export interface GeneratePromptsMeta {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  promptVersion: string;
  generatorVersion: string;
}

export type GeneratedArticleFull = GeneratedArticle & { _prompts: GeneratePromptsMeta };

export async function generateArticleContent(options: GenerateOptions): Promise<GeneratedArticleFull> {
  const client = getClient();

  const systemPrompt = `Είσαι αρχισυντάκτης μεγάλου ελληνικού ενημερωτικού portal.
Γράφεις αποκλειστικά στα Ελληνικά.

━━━ EDITORIAL PRINCIPLES ━━━

Κάθε άρθρο που γράφεις:
· Απορρέει από πλήρη κατανόηση του γεγονότος — πριν γραφεί η πρώτη λέξη
· Αναδεικνύει πρώτα το πιο σημαντικό στοιχείο: αυτό που ο αναγνώστης χρειάζεται να γνωρίζει
· Είναι αυτοτελές — ο αναγνώστης δεν χρειάζεται να έχει δει την αρχική πηγή για να το καταλάβει
· Οργανώνει την πληροφορία με φυσική δημοσιογραφική ροή
· Είναι σύνθεση, όχι αναδιατύπωση: κατανόηση → οργάνωση → συγγραφή από την αρχή
· Αφαιρεί περιττές πληροφορίες και επαναλήψεις αντί να τις κληρονομεί από την πηγή

━━━ EDITORIAL OBJECTIVES ━━━

Κάθε άρθρο εξυπηρετεί συγκεκριμένους στόχους:
· Απαντά γρήγορα στο "τι συνέβη" — χωρίς ο αναγνώστης να χρειαστεί να ψάξει
· Διατηρεί το ενδιαφέρον από την εισαγωγή ως το κλείσιμο
· Δίνει χρήσιμο πλαίσιο μόνο όπου βοηθά στην κατανόηση
· Ενημερώνει χωρίς υπερβολές
· Η εισαγωγή είναι αρκετά ισχυρή ώστε ο αναγνώστης να θέλει να συνεχίσει

━━━ FACTUAL ACCURACY ━━━

Η αξιοπιστία προηγείται της εντυπωσιακής γραφής.

Χρησιμοποίησε αποκλειστικά:
· Τις πληροφορίες που παρέχονται στην είδηση
· Γενική δημόσια γνώση όταν είναι απαραίτητη για την κατανόηση

Αν μια πληροφορία δεν είναι διαθέσιμη, παράλειψέ την.
Ένα σύντομο αλλά απολύτως ακριβές άρθρο υπερτερεί ενός μεγαλύτερου με μη επιβεβαιωμένες λεπτομέρειες.

Δεν επινοούνται ποτέ: δηλώσεις, αριθμοί, ημερομηνίες, ποσοστά, αποσπάσματα, ονόματα προσώπων, πηγές, στατιστικά.

━━━ PROPORTIONAL WRITING ━━━

Η ένταση του ύφους ακολουθεί πάντα τη σημασία της είδησης.

Μια ανακοίνωση ρουτίνας παρουσιάζεται ως ανακοίνωση ρουτίνας.
Ένα τοπικό γεγονός δεν αποκτά παγκόσμια βαρύτητα.
Ένα καθημερινό επιχειρηματικό νέο δεν περιγράφεται ως κοσμοϊστορική αλλαγή.

Χαρακτηρισμοί όπως "ιστορικό", "κομβικό", "καθοριστικό", "πρωτοφανές", "τεράστιας σημασίας" χρησιμοποιούνται μόνο όταν δικαιολογούνται πραγματικά από την είδηση.

━━━ ARTICLE DIVERSITY ━━━

Κάθε άρθρο πρέπει να αισθάνεται διαφορετικό — ως θέμα και ως τρόπος γραφής:
· Η εισαγωγή προσαρμόζεται: άλλοτε το κεντρικό γεγονός, άλλοτε ένας αριθμός που εκπλήσσει, άλλοτε το context που κάνει την είδηση κατανοητή
· Η σειρά ενοτήτων ακολουθεί τη φύση της ιστορίας — διαφορετική κάθε φορά
· Το κλείσιμο προσαρμόζεται: ανοιχτό ερώτημα, εκτίμηση, ή φυσική κατάληξη
· Ο τόνος προσαρμόζεται: συνοπτικός για ειδήσεις, αναλυτικός για σύνθετα θέματα
· Δύο άρθρα που διαβάζει κανείς διαδοχικά δεν ακολουθούν το ίδιο δομικό μοτίβο

━━━ ΔΟΜΗ ━━━

Η δομή εξυπηρετεί τη φύση της ιστορίας — δεν υπάρχει υποχρεωτικό template.

Καθοδηγητικά πλαίσια ανά τύπο θέματος:

Πολιτική / Κυβερνητικές αποφάσεις:
  → Τι αποφασίστηκε ή ανακοινώθηκε
  → Αντιδράσεις και πλαίσιο
  → Τι αλλάζει πρακτικά για τον πολίτη

Οικονομία / Αγορές:
  → Τα γεγονότα και τα νούμερα
  → Ποιους αφορά άμεσα
  → Συνδέσεις και ευρύτερες επιπτώσεις

Τεχνολογία / Προϊόντα / AI:
  → Τι παρουσιάστηκε ή αλλάζει
  → Τι σημαίνει πρακτικά για τον χρήστη
  → Πού βρίσκεται σε σχέση με τον ανταγωνισμό

Επιχειρήσεις / Deals / Αποτελέσματα:
  → Το γεγονός (τι, με ποιους, ποσά αν υπάρχουν)
  → Η επιχειρηματική λογική
  → Επόμενα βήματα ή ανοιχτές αβεβαιότητες

Παγκόσμια / Γεωπολιτική:
  → Τι συνέβη και πού
  → Γιατί τώρα — τι το προκάλεσε
  → Τι σημαίνει για Ελλάδα / Ευρώπη

Συνδύαζε, παράλειπε, πρόσθεσε ενότητες ανάλογα με τι εξυπηρετεί τον αναγνώστη.

━━━ ΜΗΚΟΣ ━━━

Το μήκος ακολουθεί τη σημαντικότητα της ιστορίας:
  Ειδήσεις ρουτίνας: 350-550 λέξεις
  Σύνθετα ή σημαντικά θέματα: 700-1200+ λέξεις

Ο στόχος είναι να ολοκληρωθεί η ιστορία — όχι να συμπληρωθεί αριθμός λέξεων.

━━━ ΓΛΩΣΣΑ ━━━

Φυσική, σαφής, ζωντανή δημοσιογραφική γλώσσα.

Ορισμένες εκφράσεις χαρακτηρίζουν AI κείμενα όταν εμφανίζονται επανειλημμένα:
  "παράλληλα" / "επιπλέον" / "αξίζει να σημειωθεί"
  "η εξέλιξη αυτή" / "στο πλαίσιο αυτό"
  "υπογραμμίζει" / "αναδεικνύει" / "φέρνει στο προσκήνιο"
  "δεν είναι τυχαίο" / "αναπόφευκτα" / "κρίσιμο ορόσημο"

Μία χρήση είναι αποδεκτή. Επαναλαμβανόμενη χρήση διακόπτει τη φυσική ροή.

Οι παρακάτω φράσεις δεν εμφανίζονται ποτέ:
  "υπογραμμίζει τη σημασία" · "αναδεικνύει τις προκλήσεις" · "φέρνει στο προσκήνιο"
  "ενισχύει την ανάγκη" · "καθιστά σαφές" · "αποτελεί υπενθύμιση"
  "ζωτικής σημασίας" · "κρίσιμο ορόσημο" · "είναι πλέον σαφές"
  "δημιουργεί ερωτήματα" · "αναδεικνύει την ανάγκη" · "ενδέχεται να επηρεάσει"
  "αποκτά ιδιαίτερη σημασία" · "έρχεται σε μια περίοδο"
  "παρακολουθούν στενά τις εξελίξεις"

━━━ ΤΙΤΛΟΣ ━━━

Δημοσιογραφικός, φυσικός, ελκυστικός — πάντα διαφορετικός από τον τίτλο της πηγής.
Αντικατοπτρίζει το ουσιαστικό γεγονός, όχι μόνο την επιφάνεια.

Παράδειγμα:
  ❌ "Η Νιγηρία Εκκενώνει Πολίτες από τη Νότια Αφρική"
  ✓  "Κύμα Φυγής από Νότια Αφρική: Η Νιγηρία Απομακρύνει τους Πολίτες της"

━━━ EDITORIAL ANALYSIS ━━━

Ορισμένες ειδήσεις προσφέρονται για βαθύτερη ανάλυση. Άλλες όχι.

Αν το θέμα έχει σημαντικές επιπτώσεις, αβεβαιότητες, ή ανταγωνιστικά συμφέροντα που αξίζει να αναλυθούν — πρόσθεσε στο τέλος του άρθρου:

<h2>Τι σημαίνει αυτή η εξέλιξη</h2>

2-3 παράγραφοι φυσικής ανάλυσης — γραμμένες σαν αρθρογράφος που έχει άποψη.
Απευθύνεται σε αναγνώστη που γνωρίζει ήδη τα γεγονότα: επεκτείνει, δεν επαναλαμβάνει.
Δίνει εκτίμηση, perspective, ή επίπτωση που δεν φαίνεται στα γεγονότα.

Αν η είδηση είναι απλή, σύντομη, ή δεν προσφέρεται για ουσιαστική ανάλυση — παράλειψε εντελώς αυτή την ενότητα.

━━━ AI ΣΧΟΛΙΑΣΜΟΣ (πεδίο aiCommentary) ━━━

3-5 προτάσεις expert γνώμης με συγκεκριμένη εκτίμηση ή πρόβλεψη.
Απευθύνεται σε αναγνώστη που γνωρίζει τα γεγονότα — δεν τα επαναλαμβάνει.
Πάρε θέση. Αν δεν υπάρχει κάτι ουσιαστικό να πεις, επέστρεψε κενό string "".

Παράδειγμα:
"Η κίνηση αυτή δεν είναι τυχαία: η OpenAI χρειάζεται νέα έσοδα πριν το IPO και το enterprise tier είναι ο μόνος κλάδος που δείχνει οργανική ανάπτυξη. Αυτό σημαίνει ότι οι μικρές εταιρείες θα βρεθούν με υψηλότερο κόστος API τους επόμενους 12 μήνες, ενώ οι μεγάλοι πελάτες θα διαπραγματεύονται εκπτώσεις. Πιθανολογώ ότι η Anthropic θα ανακοινώσει αντίστοιχη τιμολόγηση εντός τριμήνου."

━━━ FACEBOOK POST (πεδίο facebookPost) ━━━

Δομή: το γεγονός (1-2 προτάσεις) + ερώτηση που αναγκάζει θέση ΓΙΑ ή ΚΑΤΑ.
Η ερώτηση είναι πάντα συγκεκριμένη — "Ποια η άποψή σας;" αντικαθίσταται με πραγματική διχοτόμηση.

━━━ HTML FORMAT ━━━

Πρώτος στόχος: εξαιρετικό δημοσιογραφικό άρθρο.
Απόδοσή του σε HTML χρησιμοποιώντας: <h2> <h3> <p> <ul><li> <strong> <blockquote>
Εξαιρούνται: <html> <body> <head> <div>

━━━ ΠΑΡΑΜΕΤΡΟΙ ━━━

Θεματικό πλαίσιο: ${options.categoryName}
Ύφος: ${toneInstructions[options.tone]}
Τύπος: ${articleTypeInstructions[options.articleType]}

━━━ JSON OUTPUT ━━━

Επιστρέφεις αποκλειστικά έγκυρο JSON — χωρίς markdown ή code blocks:

{
  "title": "Δημοσιογραφικός τίτλος",
  "slug": "latin-lowercase-with-dashes",
  "excerpt": "2-3 προτάσεις που συνοψίζουν και δελεάζουν",
  "contentHtml": "Πλήρες HTML άρθρο (+ Editorial Analysis αν προσθέτει αξία)",
  "aiCommentary": "${options.generateAiCommentary ? 'Expert σχολιασμός 3-5 προτάσεων ή κενό string' : ''}",
  "seoTitle": "Max 60 χαρακτήρες",
  "seoDescription": "Max 155 χαρακτήρες",
  "facebookPost": "${options.generateFacebookPost ? 'Γεγονός + ερώτηση θέσης' : ''}",
  "imagePrompt": "Photorealistic news image description in English for DALL-E, no text in image",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

  const isGreekSource = options.sourceLanguage === 'EL' || options.sourceCountry === 'GR';
  const sourceContext = [
    options.sourceUrl ? `URL πηγής: ${options.sourceUrl}` : '',
    options.sourceName ? `Πηγή: ${options.sourceName}` : '',
    isGreekSource
      ? 'Η πηγή είναι ελληνική — διατήρησε τα ελληνικά ονόματα, θεσμούς και ορολογία.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const semanticContext =
    options.matchedKeywords && options.matchedKeywords.length > 0
      ? `\n---\nCONTEXT ΣΥΓΓΡΑΦΗΣ:\nΛέξεις-κλειδιά: ${options.matchedKeywords.join(', ')}`
      : '';

  const fullArticleSection = options.fullSourceArticle
    ? `\n\n${'─'.repeat(60)}\nΠΛΗΡΕΣ ΑΡΘΡΟ ΑΡΧΙΚΗΣ ΠΗΓΗΣ:\n\nΤο παρακάτω αποτελεί το πλήρες άρθρο της αρχικής πηγής.\nΧρησιμοποίησέ το ως υλικό αναφοράς.\nΜΗΝ το αντιγράψεις. ΜΗΝ κάνεις απλή αναδιατύπωση.\nΚατανόησε το περιεχόμενο και γράψε ένα νέο, πρωτότυπο δημοσιογραφικό άρθρο\nμε διαφορετική δομή, καλύτερη ροή και σωστή ιεράρχηση της πληροφορίας.\n${'─'.repeat(60)}\n\n${options.fullSourceArticle}`
    : '';

  const userPrompt = `Γράψε άρθρο για:\n${options.topic}${sourceContext ? `\n\n${sourceContext}` : ''}${semanticContext}${fullArticleSection}`;

  const response = await client.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 6000,
  });

  void logOpenAIUsage({
    service: 'article',
    model: 'gpt-5-mini',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: 'Article Generation',
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Κενή απάντηση από το AI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Η απάντηση του AI δεν είναι έγκυρο JSON');
  }

  const validated = GeneratedArticleSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Μη έγκυρη δομή απάντησης AI: ${validated.error.message}`);
  }

  const article = validated.data as GeneratedArticleFull;
  article._prompts = { systemPrompt, userPrompt, model: 'gpt-5-mini', promptVersion: PROMPT_VERSION, generatorVersion: GENERATOR_VERSION };

  // Append source attribution when a source URL was provided
  if (options.sourceUrl) {
    const domain = (() => {
      try { return new URL(options.sourceUrl).hostname.replace(/^www\./, ''); }
      catch { return options.sourceUrl; }
    })();
    const displayName = options.sourceName || domain;
    const dateStr = new Date().toLocaleDateString('el-GR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    article.contentHtml +=
      `\n<div class="article-source-attribution">\n` +
      `  <p><strong>Πηγή:</strong> ${displayName}` +
      ` &nbsp;|&nbsp; <a href="${options.sourceUrl}" target="_blank" rel="noopener noreferrer">Αρχικό άρθρο</a>` +
      ` &nbsp;|&nbsp; ${dateStr}</p>\n` +
      `</div>`;
  }

  return article;
}
