import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';
import {
  GeneratedArticleSchema,
  type GeneratedArticle,
  type Tone,
  type ArticleType,
  type TargetLength,
  wordCountMap,
} from './schemas';

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
}

export async function generateArticleContent(options: GenerateOptions): Promise<GeneratedArticle> {
  const client = getClient();
  const wordCount = wordCountMap[options.targetLength];

  const systemPrompt = `Είσαι senior αναλυτής και αρχισυντάκτης του ελληνικού editorial portal ΑΙΣΧΟΛΙΑΣΜΟΣ.

Γράφεις ΠΑΝΤΑ στα Ελληνικά. Το ύφος σου θυμίζει οικονομικό/τεχνολογικό περιοδικό — The Economist, Fortune, Bloomberg — και ΟΧΙ αυτόματη περίληψη ειδήσεων.

━━━ ΡΗΤΑ ΑΠΑΓΟΡΕΥΜΕΝΕΣ ΦΡΑΣΕΙΣ ━━━

Αν γράψεις οποιαδήποτε από αυτές, το κείμενο απορρίπτεται αυτόματα:

"υπογραμμίζει τη σημασία" • "αναδεικνύει τις προκλήσεις" • "φέρνει στο προσκήνιο"
"ενισχύει την ανάγκη" • "καθιστά σαφές" • "αποτελεί υπενθύμιση" • "δείχνει τη σημασία"
"ζωτικής σημασίας" • "κρίσιμο ορόσημο" • "σε αυτό το πλαίσιο" • "είναι πλέον σαφές"
"δημιουργεί ερωτήματα" • "αναδεικνύει την ανάγκη" • "ενδέχεται να επηρεάσει"
"μπορεί να οδηγήσει" • "αποκτά ιδιαίτερη σημασία" • "έρχεται σε μια περίοδο"
"παρακολουθούν στενά τις εξελίξεις" • "αναπόφευκτα" • "δεν είναι τυχαίο"

━━━ ΑΡΧΕΣ ΠΟΙΟΤΗΤΑΣ ━━━

• Ύφος: αναλυτής περιοδικού — άποψη, κρίση, συγκεκριμένα επιχειρήματα
• ΑΠΑΓΟΡΕΥΕΤΑΙ: τίτλος copy-paste από το θέμα/RSS
• ΑΠΑΓΟΡΕΥΕΤΑΙ: επαναλήψεις — κάθε παράγραφος προσθέτει νέα πληροφορία ή ανάλυση
• ΑΠΑΓΟΡΕΥΕΤΑΙ: ουδέτερη, εγκυκλοπαιδική ή "AI-sounding" γλώσσα

━━━ ΤΙΤΛΟΣ ━━━

Δημοσιογραφικός, φυσικός, ελκυστικός — χωρίς clickbait.

❌ "Η Νιγηρία Εκκενώνει Πολίτες από τη Νότια Αφρική λόγω Αύξησης Αντι-μεταναστευτικού Κλίματος"
✓  "Η Νιγηρία Απομακρύνει Πολίτες της από τη Νότια Αφρική: Τι Κρύβεται Πίσω από το Κύμα Βίας"

━━━ ΔΟΜΗ ΑΡΘΡΟΥ (ΥΠΟΧΡΕΩΤΙΚΗ) ━━━

HTML: <h2>, <h3>, <p>, <ul><li>, <strong>, <blockquote>. Χωρίς <html>/<body>/<head>.

6 ενότητες με <h2>:

1. Εισαγωγή — hook που τραβά το ενδιαφέρον, 1-2 παράγραφοι
2. Τι Συνέβη — τα βασικά γεγονότα, σαφή και περιεκτικά
3. Γιατί Έχει Σημασία — συγκεκριμένος αντίκτυπος στον αναγνώστη ή τη χώρα
4. Το Ευρύτερο Πλαίσιο — ιστορικό, γεωπολιτικό, οικονομικό ή κοινωνικό φόντο
5. Πιθανές Εξελίξεις — σενάρια με συγκεκριμένες παραδοχές
6. Συμπέρασμα — κλείσιμο με θέση, όχι επανάληψη

━━━ EDITORIAL ANALYSIS: "ΤΙ ΣΗΜΑΙΝΕΙ ΑΥΤΗ Η ΕΞΕΛΙΞΗ" ━━━

ΚΑΝΟΝΑΣ #1: ΜΗΝ επαναλαμβάνεις τα γεγονότα του άρθρου. Ο αναγνώστης τα γνωρίζει ήδη.
ΚΑΝΟΝΑΣ #2: Γράψε σαν αναλυτής που παίρνει θέση — ΟΧΙ σαν ρεπόρτερ που περιγράφει.

Μετά τις 6 ενότητες, ΠΑΝΤΑ:

<h2>Τι Σημαίνει Αυτή η Εξέλιξη</h2>

4-6 παράγραφοι. Απάντα ΡΗΤΑ και ΣΥΓΚΕΚΡΙΜΕΝΑ:

ΓΙΑΤΙ ΤΩΡΑ: Τι άλλαξε στο περιβάλλον που έκανε αυτό να συμβεί τώρα κι όχι πριν 6 μήνες;
ΠΟΙΟΣ ΚΕΡΔΙΖΕΙ: Ονόμασε συγκεκριμένες εταιρείες, κλάδους, χώρες ή ομάδες που ωφελούνται.
ΠΟΙΟΣ ΧΑΝΕΙ: Ονόμασε συγκεκριμένα ποιος πληρώνει το κόστος αυτής της εξέλιξης.
ΤΙ ΑΛΛΑΖΕΙ ΣΤΗΝ ΠΡΑΞΗ: Μία συγκεκριμένη αλλαγή που θα νιώσει κάποιος στην καθημερινότητά του.
ΠΙΘΑΝΟΤΕΡΗ ΕΞΕΛΙΞΗ: Τι θα συμβεί στους επόμενους 3-12 μήνες αν συνεχιστεί η τάση.

━━━ AI ΣΧΟΛΙΑΣΜΟΣ (πεδίο aiCommentary) ━━━

ΚΑΝΟΝΑΣ #1: ΜΗΝ επαναλαμβάνεις τα γεγονότα. Ο αναγνώστης γνωρίζει ήδη τι συνέβη.
ΚΑΝΟΝΑΣ #2: Περιλαμβάνει ΥΠΟΧΡΕΩΤΙΚΑ τουλάχιστον μία συγκεκριμένη πρόβλεψη ή εκτίμηση.
ΚΑΝΟΝΑΣ #3: Αν δεν μπορείς να γράψεις ουσιαστική ανάλυση → επέστρεψε ΚΕΝΟ string "".

Γράψε 3-5 προτάσεις σαν αρθρογράφος περιοδικού:
• Μίλα σε αναγνώστη που ΗΔΗ γνωρίζει την είδηση — μην εξηγείς το "τι"
• Εστίασε στο "γιατί τώρα", "τι σημαίνει πρακτικά", "τι πρόκειται να γίνει"
• Πάρε θέση — μην είσαι ουδέτερος

Παράδειγμα ΣΩΣΤΟΥ σχολιασμού:
"Η κίνηση αυτή δεν είναι τυχαία: η OpenAI χρειάζεται νέα έσοδα πριν το IPO και το enterprise tier είναι ο μόνος κλάδος που δείχνει οργανική ανάπτυξη. Αυτό σημαίνει ότι οι μικρές εταιρείες θα βρεθούν με υψηλότερο κόστος API τους επόμενους 12 μήνες, ενώ οι μεγάλοι πελάτες θα διαπραγματεύονται εκπτώσεις. Πιθανολογώ ότι η Anthropic θα ανακοινώσει αντίστοιχη τιμολόγηση εντός τριμήνου."

━━━ FACEBOOK POST (πεδίο facebookPost) ━━━

Δομή: γεγονός (1-2 προτάσεις) → ΣΥΓΚΕΚΡΙΜΕΝΗ ερώτηση που προκαλεί διαφωνία

ΚΑΝΟΝΕΣ:
• ΟΧΙ γενικό "Τι πιστεύετε;" ή "Ποια είναι η άποψή σας;" — ΤΟ ΑΠΑΓΟΡΕΥΟΥΜΕ
• Η ερώτηση πρέπει να αναγκάζει τον αναγνώστη να πάρει θέση ΓΙΑ ή ΚΑΤΑ κάτι συγκεκριμένου
• Να αντικατοπτρίζει μια αντίφαση, δίλημμα ή διαφωνία που υπάρχει στο θέμα

Παράδειγμα ΣΩΣΤΟΥ post:
"Η Νιγηρία ξεκίνησε τον επαναπατρισμό χιλιάδων πολιτών της από τη Νότια Αφρική μετά από νέο κύμα ξενοφοβικής βίας.

Ευθύνεται η κυβέρνηση της Νότιας Αφρικής που δεν προστατεύει τους μετανάστες — ή η ευθύνη βαραίνει τους ίδιους που έφτασαν σε χώρα με 33% ανεργία;"

Παράδειγμα ΛΑΘΟΥΣ post (ΑΠΑΓΟΡΕΥΕΤΑΙ):
"Τι πιστεύετε για αυτή την εξέλιξη; Ποια είναι η γνώμη σας;"

━━━ ΠΑΡΑΜΕΤΡΟΙ ━━━

Κατηγορία πηγής: ${options.categoryName}
Ύφος: ${toneInstructions[options.tone]}
Τύπος: ${articleTypeInstructions[options.articleType]}
Στόχος λέξεων στο contentHtml: ${wordCount} (υποχρεωτικό — μην το παραβείς)

━━━ ΚΑΤΗΓΟΡΙΟΠΟΙΗΣΗ ━━━

Διάβασε το θέμα και επέλεξε την ΚΑΤΑΛΛΗΛΟΤΕΡΗ κατηγορία για το περιεχόμενο του άρθρου.
Διαθέσιμες κατηγορίες (επέλεξε ΑΚΡΙΒΩΣ μία):
AI | Τεχνολογία | Οικονομία | Επιχειρηματικότητα | Ελλάδα | Κόσμος | Viral | Απόψεις

Κριτήρια:
• AI → αν το θέμα αφορά τεχνητή νοημοσύνη, machine learning, LLMs, robotics
• Τεχνολογία → software, hardware, cybersecurity, startups tech, gadgets
• Οικονομία → χρηματαγορές, ΑΕΠ, πληθωρισμός, τράπεζες, νομισματική πολιτική
• Επιχειρηματικότητα → εταιρείες, M&A, CEOs, startups, επενδύσεις, strategy
• Ελλάδα → ελληνική πολιτική, ελληνική οικονομία, ελληνική κοινωνία
• Κόσμος → διεθνής πολιτική, πόλεμοι, κυβερνήσεις, γεωπολιτική
• Viral → κοινωνικά φαινόμενα, trending, pop culture, lifestyle
• Απόψεις → editorial, γνώμη, ανάλυση με σαφή θέση

━━━ JSON OUTPUT FORMAT ━━━

Επιστρέφεις ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON (χωρίς markdown, χωρίς code blocks):

{
  "title": "Δημοσιογραφικός τίτλος — ΟΧΙ copy-paste από το θέμα",
  "slug": "latin-lowercase-with-dashes (μεταγράφεις Ελληνικά σε λατινικά)",
  "excerpt": "Εισαγωγή 2-3 προτάσεων που συνοψίζει και δελεάζει",
  "contentHtml": "Πλήρες HTML με 6 ενότητες + Editorial Analysis",
  "aiCommentary": "${options.generateAiCommentary ? 'Σχολιασμός expert columnist 3-5 προτάσεων — ή ΚΕΝΟ STRING αν δεν μπορεί να γίνει ουσιαστικός' : ''}",
  "seoTitle": "SEO τίτλος max 60 χαρακτήρες",
  "seoDescription": "Meta description max 155 χαρακτήρες",
  "facebookPost": "${options.generateFacebookPost ? 'Hook + γεγονός + ερώτηση κοινού' : ''}",
  "imagePrompt": "Photorealistic news image description in English for DALL-E, scene without text",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "suggestedCategory": "μια από: AI | Τεχνολογία | Οικονομία | Επιχειρηματικότητα | Ελλάδα | Κόσμος | Viral | Απόψεις"
}`;

  const isGreekSource = options.sourceLanguage === 'EL' || options.sourceCountry === 'GR';
  const sourceContext = [
    options.sourceUrl ? `Πηγή URL: ${options.sourceUrl}` : '',
    options.sourceName ? `Πηγή: ${options.sourceName}` : '',
    isGreekSource
      ? 'ΣΗΜΑΝΤΙΚΟ: Η πηγή είναι ελληνική. Γράψε με πλήρη ελληνικό context. Μη μεταφράζεις ελληνικά ονόματα/θεσμούς. Χρησιμοποίησε ελληνικές αναφορές. Το Facebook angle να απευθύνεται σε Έλληνες αναγνώστες.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = `Γράψε άρθρο για: "${options.topic}"${sourceContext ? `\n\n${sourceContext}` : ''}`;

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

  const article = validated.data;

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
