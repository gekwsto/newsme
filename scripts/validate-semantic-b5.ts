/**
 * validate-semantic-b5.ts — Phase B.5 Validation (12 test scenarios)
 * Tests NEW DB-backed system against specific scenarios.
 * Usage: npx tsx scripts/validate-semantic-b5.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// ─── inline semantic analysis (mirrors semantic-service-db.ts, no server-only) ──

const TITLE_SCORE = 30;
const EXCERPT_SCORE = 15;
const CONFIDENCE_BONUS_PER_ALIAS = 8;
const MAX_CONFIDENCE_ALIASES = 4;
const MULTI_TAG_BONUS_PER_TAG = 10;
const MULTI_TAG_BONUS_CAP = 30;
const MIN_SEMANTIC_SCORE = 35;

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ωά-ώ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

type Cfg = Awaited<ReturnType<typeof loadConfig>>;

async function loadConfig() {
  const cats = await prisma.semanticCategory.findMany({
    where: { isActive: true },
    include: {
      category: { select: { name: true, slug: true } },
      tags: {
        where: { isActive: true },
        include: { aliases: { where: { isActive: true }, select: { alias: true } } },
      },
    },
  });
  return cats;
}

function analyzeText(text: { title: string; excerpt?: string; body?: string }, cfg: Cfg) {
  const titleNorm = normalize(text.title);
  const excerptNorm = normalize(text.excerpt ?? '');
  const bodyNorm = normalize(text.body ?? '');

  const catScores = new Map<string, number>();
  const catNames = new Map<string, string>();
  const matchedTags: Array<{ tag: string; cat: string; score: number; aliases: string[] }> = [];

  for (const cat of cfg) {
    let catScore = 0;
    let multiTagCount = 0;
    catNames.set(cat.id, cat.name);

    for (const tag of cat.tags) {
      let tagScore = 0;
      let hitAliases = 0;
      const hitAliasList: string[] = [];

      for (const { alias } of tag.aliases) {
        const aliasNorm = normalize(alias);
        let hit = false;
        if (titleNorm.includes(aliasNorm)) { tagScore += TITLE_SCORE; hit = true; }
        else if (excerptNorm.includes(aliasNorm)) { tagScore += EXCERPT_SCORE; hit = true; }
        else if (bodyNorm && bodyNorm.includes(aliasNorm)) { tagScore += 5; hit = true; }
        if (hit) { hitAliases++; hitAliasList.push(alias); }
        if (hitAliases >= MAX_CONFIDENCE_ALIASES) break;
      }

      if (tagScore > 0) {
        const bonus = Math.min(hitAliases * CONFIDENCE_BONUS_PER_ALIAS, MAX_CONFIDENCE_ALIASES * CONFIDENCE_BONUS_PER_ALIAS);
        const priorityBonus = tag.isPriority ? (tag.bonus ?? 0) : 0;
        const effectiveScore = Math.round((tagScore + bonus + priorityBonus) * (tag.weight ?? 1));
        matchedTags.push({ tag: tag.name, cat: cat.name, score: effectiveScore, aliases: hitAliasList });
        catScore += effectiveScore;
        multiTagCount++;
      }
    }

    if (catScore > 0) {
      const multiBonus = Math.min((multiTagCount - 1) * MULTI_TAG_BONUS_PER_TAG, MULTI_TAG_BONUS_CAP);
      catScore = Math.round(catScore * (cat.weight ?? 1)) + multiBonus;
      catScores.set(cat.id, catScore);
    }
  }

  if (catScores.size === 0) return { pass: false, score: 0, category: null, matchedTags: [] };

  let bestId = '', bestScore = 0;
  for (const [id, score] of catScores) {
    if (score > bestScore) { bestScore = score; bestId = id; }
  }

  const category = cfg.find(c => c.id === bestId);
  const catName = category?.name ?? null;

  return {
    pass: bestScore >= MIN_SEMANTIC_SCORE,
    score: bestScore,
    category: catName,
    matchedTags: matchedTags.filter(t => t.cat === catName),
  };
}

// ─── test runner ──────────────────────────────────────────────────────────────

type TestCase = {
  id: string;
  desc: string;
  input: { title: string; excerpt?: string };
  expect: {
    pass?: boolean;
    category?: string;
    notMatchAlias?: string;  // alias that must NOT be the reason for matching
    minScore?: number;
  };
};

const TESTS: TestCase[] = [
  // 1. Φωτιά → Ελλάδα
  {
    id: 'T01', desc: 'Φωτιά → Ελλάδα, PASS',
    input: { title: 'Φωτιά στην Αττική: Καίγεται το δάσος κοντά στη Βαρυμπόμπη', excerpt: 'Πυρκαγιά ξέσπασε στη Βαρυμπόμπη. Τα εναέρια μέσα επιχειρούν.' },
    expect: { pass: true, category: 'Ελλάδα' },
  },

  // 2. SpaceX → Τεχνολογία
  {
    id: 'T02', desc: 'SpaceX → Τεχνολογία, PASS',
    input: { title: 'SpaceX launches Starship on 10th test flight over the Gulf of Mexico', excerpt: 'The Falcon 9 rocket carried a Crew Dragon capsule to orbit.' },
    expect: { pass: true, category: 'Τεχνολογία' },
  },

  // 3. Microsoft/Windows → Τεχνολογία
  {
    id: 'T03', desc: 'Microsoft Windows → Τεχνολογία, PASS',
    input: { title: 'Microsoft announces Windows 12 with built-in Copilot AI assistant', excerpt: 'The new Windows version integrates Azure AI services.' },
    expect: { pass: true, category: 'Τεχνολογία' },
  },

  // 4. Netflix/streaming → Τεχνολογία
  {
    id: 'T04', desc: 'Netflix streaming → Τεχνολογία, PASS',
    input: { title: 'Netflix now requires every user profile to be tied to unique email address', excerpt: 'The streaming platform is cracking down on password sharing across its 300M subscribers.' },
    expect: { pass: true, category: 'Τεχνολογία' },
  },

  // 5. Cancer/antibiotic → Υγεία
  {
    id: 'T05a', desc: 'Cancer article → Υγεία, PASS',
    input: { title: 'Νέα θεραπεία για καρκίνο του μαστού έδειξε 90% αποτελεσματικότητα', excerpt: 'Κλινικές δοκιμές επιβεβαίωσαν ότι η καινούρια αντικαρκινική θεραπεία μειώνει τον όγκο.' },
    expect: { pass: true, category: 'Υγεία' },
  },
  {
    id: 'T05b', desc: 'Superbug/antibiotic resistance → Υγεία, PASS',
    input: { title: 'New superbug resistant to all antibiotics detected in European hospitals', excerpt: 'Scientists warn of antimicrobial resistance and MRSA spread in ICUs.' },
    expect: { pass: true, category: 'Υγεία' },
  },

  // 6. Germany/UK/China → Κόσμος
  {
    id: 'T06a', desc: 'Germany/Berlin → Κόσμος, PASS',
    input: { title: 'Γερμανία: Ο Μέρτς κερδίζει εκλογές με CDU — Συνομιλίες για κυβέρνηση ξεκίνησαν στο Βερολίνο', excerpt: 'Γερμανικές εκλογές: ο Friedrich Merz θα σχηματίσει κυβέρνηση.' },
    expect: { pass: true, category: 'Κόσμος' },
  },
  {
    id: 'T06b', desc: 'UK/Starmer → Κόσμος, PASS',
    input: { title: 'UK Prime Minister Starmer announces new economic plan for British growth', excerpt: 'London: Keir Starmer met with King Charles at Westminster to discuss Brexit aftermath.' },
    expect: { pass: true, category: 'Κόσμος' },
  },
  {
    id: 'T06c', desc: 'China/Xi Jinping → Κόσμος, PASS',
    input: { title: 'Κίνα: Ο Σι Τζινπίνγκ επισκέπτεται Ευρώπη για εμπορικές συνομιλίες', excerpt: 'Η κινεζική κυβέρνηση στέλνει αντιπροσωπεία στο Πεκίνο για διαπραγματεύσεις.' },
    expect: { pass: true, category: 'Κόσμος' },
  },

  // 7. FIFA/Μουντιάλ → Αθλητικά
  {
    id: 'T07', desc: 'FIFA World Cup 2026 → Αθλητικά, PASS',
    input: { title: 'FIFA World Cup 2026: Η Ελλάδα στο Παγκόσμιο Κύπελλο ποδοσφαίρου;', excerpt: 'Το Μουντιάλ 2026 θα διεξαχθεί σε ΗΠΑ, Καναδά και Μεξικό.' },
    expect: { pass: true, category: 'Αθλητικά' },
  },

  // 8. Παναθηναϊκός → Αθλητικά
  {
    id: 'T08', desc: 'Παναθηναϊκός → Αθλητικά, PASS',
    input: { title: 'Παναθηναϊκός: Νέος προπονητής για την ομάδα μπάσκετ πριν το Final Four', excerpt: 'Ο Παναθηναϊκός ΑΟ ξεκινά τις προετοιμασίες για τον αγώνα στο OAKA.' },
    expect: { pass: true, category: 'Αθλητικά' },
  },

  // 9. OpenAI → AI
  {
    id: 'T09', desc: 'OpenAI/GPT-5 → AI, PASS',
    input: { title: 'OpenAI releases GPT-5 with dramatically improved reasoning', excerpt: 'Sam Altman announced the new model at the San Francisco event. ChatGPT gets the update.' },
    expect: { pass: true, category: 'AI' },
  },

  // 10. Celebrity gossip → REJECT
  {
    id: 'T10', desc: 'Celebrity gossip → FAIL (score < 35)',
    input: {
      title: 'Η Πάμελα Άντερσον χόρεψε ξυπόλυτη στον γάμο του γιου της',
      excerpt: 'Η ηθοποιός εντυπωσίασε με το φόρεμά της στην τελετή γάμου στη Μαλιμπού.',
    },
    expect: { pass: false },
  },

  // 11. megacluster → must NOT trigger via "mega" substring
  {
    id: 'T11', desc: 'megacluster technical text → no false MEGA match',
    input: {
      title: 'AWS deploys new megacluster for GPU AI workloads across data centers',
      excerpt: 'The megacluster infrastructure enables massive scale for cloud computing.',
    },
    expect: { notMatchAlias: 'mega' },
  },

  // 12. "Intellectually" → must NOT trigger via "intel" substring
  {
    id: 'T12', desc: '"Intellectually" → no false intel match',
    input: {
      title: 'Intellectually stimulating games help reduce cognitive decline in seniors',
      excerpt: 'A new study shows intellectually demanding activities delay dementia.',
    },
    expect: { notMatchAlias: 'intel' },
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  PHASE B.5 VALIDATION — 12 Test Scenarios');
  console.log('════════════════════════════════════════════════════════════\n');

  const cfg = await loadConfig();
  console.log(`Loaded ${cfg.length} semantic categories, ${cfg.reduce((s,c) => s + c.tags.length, 0)} tags\n`);

  let passed = 0;
  let failed = 0;

  // Check forbidden aliases are not in DB at all
  const forbiddenAliases = ['ar', 'un', 'star', 'intel', 'mega', 'βάρος', 'facebook'];
  const allAliasRows = await prisma.semanticTagAlias.findMany({
    where: { alias: { in: forbiddenAliases }, isActive: true },
    select: { alias: true, semanticTag: { select: { name: true } } },
  });
  if (allAliasRows.length > 0) {
    console.log('⚠  FORBIDDEN ALIASES IN DB:');
    for (const r of allAliasRows) console.log(`   "${r.alias}" → tag "${r.semanticTag.name}"`);
  } else {
    console.log('✓ No forbidden aliases (ar, un, star, intel, mega, βάρος, facebook) found in DB\n');
  }

  for (const test of TESTS) {
    const result = analyzeText(test.input, cfg);
    let ok = true;
    const notes: string[] = [];

    if (test.expect.pass !== undefined) {
      if (result.pass !== test.expect.pass) {
        ok = false;
        notes.push(`expected pass=${test.expect.pass}, got pass=${result.pass} score=${result.score}`);
      }
    }
    if (test.expect.category) {
      if (result.category !== test.expect.category) {
        ok = false;
        notes.push(`expected category="${test.expect.category}", got "${result.category}"`);
      }
    }
    if (test.expect.minScore !== undefined && result.score < test.expect.minScore) {
      ok = false;
      notes.push(`score ${result.score} < min ${test.expect.minScore}`);
    }
    if (test.expect.notMatchAlias) {
      // Verify the alias is not in DB (already checked above, but double-check in matched context)
      const forbidden = test.expect.notMatchAlias.toLowerCase();
      const hasIt = allAliasRows.some(r => r.alias.toLowerCase() === forbidden);
      if (hasIt) { ok = false; notes.push(`Forbidden alias "${forbidden}" is in DB`); }
    }

    const icon = ok ? '✓' : '✗';
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`${icon} [${test.id}] ${test.desc}`);
    if (ok) {
      if (test.expect.pass !== false) {
        console.log(`      → score=${result.score} cat="${result.category}" tags=[${result.matchedTags.map(t => t.tag).join(', ')}]`);
      } else {
        console.log(`      → score=${result.score} (correctly rejected)`);
      }
      if (test.expect.notMatchAlias) console.log(`      → alias "${test.expect.notMatchAlias}" correctly absent from DB`);
      passed++;
    } else {
      console.log(`      → ${status}: ${notes.join(' | ')}`);
      console.log(`      → actual: score=${result.score} cat="${result.category}" pass=${result.pass}`);
      if (result.matchedTags.length > 0) {
        console.log(`      → matched: ${result.matchedTags.map(t => `${t.tag}(${t.score})`).join(', ')}`);
      }
      failed++;
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${TESTS.length} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
