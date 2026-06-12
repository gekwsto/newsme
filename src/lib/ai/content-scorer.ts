import OpenAI from 'openai';
import { logOpenAIUsage } from '@/lib/monitoring/events';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface ArticleInput {
  id: string;
  title: string;
  excerpt: string | null;
}

export interface ArticleScore {
  id: string;
  viralScore: number;
  discussionScore: number;
  businessValueScore: number;
  searchPotentialScore: number;
  controversyScore: number;
  facebookDiscussionScore: number;
  overallScore: number;
  whyThisMatters: string;
  bestFacebookAngle: string;
  reasoning: string;
}

const BATCH_SIZE = 15;

export async function scoreArticles(articles: ArticleInput[]): Promise<ArticleScore[]> {
  if (articles.length === 0) return [];
  const client = getClient();
  const results: ArticleScore[] = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchResults = await scoreBatch(client, batch);
    results.push(...batchResults);
  }
  return results;
}

async function scoreBatch(client: OpenAI, articles: ArticleInput[]): Promise<ArticleScore[]> {
  const list = articles
    .map(
      (a, i) =>
        `${i + 1}. [${a.id}]\nΤίτλος: ${a.title}\nΠερίληψη: ${(a.excerpt ?? '').slice(0, 200) || '(κενή)'}`
    )
    .join('\n\n');

  const systemPrompt = `Είσαι Editorial Director για το ελληνικό news portal ΑΙΣΧΟΛΙΑΣΜΟΣ. Αξιολογείς άρθρα για δημοσίευση με στόχο το Facebook engagement.

Για κάθε άρθρο δίνεις βαθμολογία 0-100 στις εξής διαστάσεις:

viralScore — Πιθανότητα viral στα social media
• Εξετάζεις: συναίσθημα, φόβο/έκπληξη, αντιπαράθεση, περιέργεια, ανθρώπινο ενδιαφέρον
• 0-39: ρουτίνα/institutional  40-69: κάποιο ενδιαφέρον  70-100: υψηλό viral potential

discussionScore — Πιθανότητα engagement και σχολίων
• Εξετάζεις: πόλωση απόψεων, ηθικά ζητήματα, αντικρουόμενα συμφέροντα, τοπική συνάφεια
• 0-39: μονόπλευρη  40-69: κάποιο debate  70-100: έντονη αντιπαράθεση

businessValueScore — Αξία για επιχειρηματικό/επαγγελματικό κοινό
• Εξετάζεις: AI/τεχνολογία, οικονομία/αγορές, επιχειρήσεις/επενδύσεις, νομοθεσία, αγορά εργασίας
• 0-39: lifestyle/πολιτική/αθλητικά  40-69: γενικό  70-100: υψηλή επαγγελματική αξία

searchPotentialScore — SEO και organic traffic δυνατότητες
• Εξετάζεις: evergreen αξία (vs breaking news), αναζητήσιμα keywords, Google Discover, clear search intent
• 0-39: εφήμερη είδηση  40-69: κάποιο SEO  70-100: evergreen ή high-volume keywords

controversyScore — Πιθανότητα να δημιουργήσει polarization και έντονη διαφωνία
• ΔΕΝ ενδιαφέρει αν συμφωνεί κάποιος — ενδιαφέρει αν θα ΣΧΟΛΙΑΣΕΙ
• Υψηλό score: πολιτική, μετανάστευση, πόλεμος, λογοκρισία, AI regulation, απολύσεις, δικαστικές υποθέσεις
• Υψηλό score: Elon Musk, Trump, OpenAI, Apple, Google, κυβερνητικές αποφάσεις, κοινωνικά θέματα
• 0-39: ουδέτερο  40-69: μέτρια τριβή  70-100: αναμένεται έντονη πόλωση

facebookDiscussionScore — Πόσο πιθανό είναι κάποιος να γράψει σχόλιο κάτω από αυτό το post στο Facebook;
• ΔΙΑΦΟΡΕΤΙΚΟ από viral: ένα viral post μπορεί να μη δημιουργεί σχόλια
• Παράδειγμα: SpaceX IPO → viral 90, facebookDiscussion 40 (θαυμασμός, όχι διαφωνία)
• Παράδειγμα: Απαγόρευση social media σε παιδιά → viral 75, facebookDiscussion 95 (όλοι έχουν άποψη)
• 0-39: ελάχιστα σχόλια  40-69: κάποιο discussion  70-100: γεμάτο σχόλια

overallScore — υπολόγισε ακριβώς: round(viralScore*0.30 + discussionScore*0.25 + businessValueScore*0.25 + searchPotentialScore*0.20)

whyThisMatters — Μία πρόταση editorial insight που εξηγεί τη ΒΑΘΥΤΕΡΗ σημασία της είδησης
• ΟΧΙ περίληψη — editorial ανάλυση
• Παράδειγμα: "Η είδηση δεν είναι οι ταραχές. Είναι ότι ο Μασκ μπαίνει βαθύτερα στην πολιτική λίγο πριν το IPO της SpaceX."
• Παράδειγμα: "Η ουσία δεν είναι η ανακοίνωση — είναι ότι η Apple παραδέχεται πλέον ότι έχασε τον αγώνα AI."
• Αν η είδηση είναι ρουτίνα χωρίς βαθύτερη σημασία → επέστρεψε κενό string ""

bestFacebookAngle — Μία ερώτηση που αναγκάζει τον αναγνώστη να πάρει θέση ΓΙΑ ή ΚΑΤΑ
• ΠΡΕΠΕΙ να είναι αντιπαραθετική, να δημιουργεί disagrement
• ΟΧΙ "Τι πιστεύετε;" ή γενικές ερωτήσεις
• Παράδειγμα: "Οι επιχειρηματίες πρέπει να εκφράζουν πολιτικές απόψεις ή να μένουν εκτός πολιτικής;"
• Παράδειγμα: "Ευθύνεται η κυβέρνηση που δεν προστατεύει τους μετανάστες — ή ευθύνονται οι ίδιοι που ήρθαν σε χώρα με 33% ανεργία;"
• Αν δεν υπάρχει καλό angle → επέστρεψε κενό string ""

reasoning — 1 σύντομη πρόταση: αξίζει ή όχι να γίνει άρθρο και γιατί

Επιστρέφεις ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON object (χωρίς markdown, χωρίς code blocks):
{"scores":[{"id":"...","viralScore":72,"discussionScore":65,"businessValueScore":80,"searchPotentialScore":55,"controversyScore":60,"facebookDiscussionScore":70,"overallScore":69,"whyThisMatters":"...","bestFacebookAngle":"...","reasoning":"..."}]}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Αξιολόγησε τα παρακάτω ${articles.length} άρθρα:\n\n${list}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 3500,
  });

  void logOpenAIUsage({
    service: 'scoring',
    model: 'gpt-4o',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    operation: `Batch Scoring (${articles.length} articles)`,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { scores?: unknown[] };
    const arr = parsed.scores;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        id: String(item.id ?? ''),
        viralScore: clamp(Number(item.viralScore) || 0),
        discussionScore: clamp(Number(item.discussionScore) || 0),
        businessValueScore: clamp(Number(item.businessValueScore) || 0),
        searchPotentialScore: clamp(Number(item.searchPotentialScore) || 0),
        controversyScore: clamp(Number(item.controversyScore) || 0),
        facebookDiscussionScore: clamp(Number(item.facebookDiscussionScore) || 0),
        overallScore: clamp(Number(item.overallScore) || 0),
        whyThisMatters: String(item.whyThisMatters ?? ''),
        bestFacebookAngle: String(item.bestFacebookAngle ?? ''),
        reasoning: String(item.reasoning ?? ''),
      }))
      .filter((s) => s.id !== '');
  } catch {
    return [];
  }
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}
