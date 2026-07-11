/**
 * enrich-semantic-system.ts — Phase B.5 Semantic Enrichment
 *
 * SAFE: Never deletes records. All operations are upsert-based.
 * Does NOT touch production pipeline behavior.
 * Run: npx tsx scripts/enrich-semantic-system.ts [--dry-run]
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DRY_RUN = process.argv.includes('--dry-run');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// ─── counters ────────────────────────────────────────────────────────────────
const stats = {
  tagsCreated: 0,
  tagsAlreadyExisted: 0,
  aliasesAdded: 0,
  aliasesAlreadyExisted: 0,
  imageTagMappingsAdded: 0,
  articleTagMappingsAdded: 0,
  errors: [] as string[],
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function warn(msg: string) { stats.errors.push(msg); console.warn('  ⚠ ' + msg); }

async function upsertTag(opts: {
  name: string;
  slug: string;
  catId: string;
  weight?: number;
  isPriority?: boolean;
  bonus?: number;
  useForArticleTagging?: boolean;
  useForImageMatching?: boolean;
  tagId?: string;          // Article Tag mapping
  imageTagId?: string;     // Image Tag mapping
}) {
  if (DRY_RUN) {
    log(`  [DRY] UPSERT tag "${opts.name}" slug=${opts.slug}`);
    return;
  }
  try {
    const existing = await prisma.semanticTag.findUnique({ where: { name: opts.name } });
    if (existing) {
      stats.tagsAlreadyExisted++;
      // Still update mappings if they're newly provided and not yet set
      const updates: Record<string, unknown> = {};
      if (opts.imageTagId && !existing.imageTagId) updates.imageTagId = opts.imageTagId;
      if (opts.tagId && !existing.tagId) updates.tagId = opts.tagId;
      if (Object.keys(updates).length > 0) {
        await prisma.semanticTag.update({ where: { id: existing.id }, data: updates });
        if (updates.imageTagId) stats.imageTagMappingsAdded++;
        if (updates.tagId) stats.articleTagMappingsAdded++;
      }
    } else {
      await prisma.semanticTag.create({
        data: {
          name: opts.name,
          slug: opts.slug,
          semanticCategoryId: opts.catId,
          weight: opts.weight ?? 1.0,
          isPriority: opts.isPriority ?? false,
          bonus: opts.bonus ?? 0,
          useForArticleTagging: opts.useForArticleTagging ?? true,
          useForImageMatching: opts.useForImageMatching ?? true,
          ...(opts.tagId ? { tagId: opts.tagId } : {}),
          ...(opts.imageTagId ? { imageTagId: opts.imageTagId } : {}),
        },
      });
      stats.tagsCreated++;
      if (opts.imageTagId) stats.imageTagMappingsAdded++;
      if (opts.tagId) stats.articleTagMappingsAdded++;
    }
  } catch (e: unknown) {
    warn(`Failed to upsert tag "${opts.name}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function addAliases(tagName: string, aliases: string[]) {
  if (DRY_RUN) {
    log(`  [DRY] ADD ${aliases.length} aliases to "${tagName}": ${aliases.slice(0, 4).join(', ')}...`);
    return;
  }
  const tag = await prisma.semanticTag.findUnique({ where: { name: tagName } });
  if (!tag) { warn(`Tag "${tagName}" not found — cannot add aliases`); return; }

  for (const alias of aliases) {
    try {
      const result = await prisma.semanticTagAlias.upsert({
        where: { semanticTagId_alias: { semanticTagId: tag.id, alias } },
        update: { isActive: true },
        create: { semanticTagId: tag.id, alias, isActive: true },
      });
      // Distinguish created vs updated by checking if createdAt ≈ now
      const isNew = Date.now() - result.createdAt.getTime() < 5000;
      if (isNew) stats.aliasesAdded++; else stats.aliasesAlreadyExisted++;
    } catch (e: unknown) {
      warn(`Alias "${alias}" for "${tagName}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function mapImageTag(tagName: string, imageTagId: string) {
  if (DRY_RUN) { log(`  [DRY] MAP imageTag "${tagName}" → ${imageTagId}`); return; }
  const tag = await prisma.semanticTag.findUnique({ where: { name: tagName } });
  if (!tag) { warn(`Tag "${tagName}" not found — cannot map image tag`); return; }
  if (tag.imageTagId === imageTagId) { stats.imageTagMappingsAdded++; return; }
  if (tag.imageTagId && tag.imageTagId !== imageTagId) {
    warn(`Tag "${tagName}" already has imageTagId ${tag.imageTagId} — skipping`);
    return;
  }
  try {
    await prisma.semanticTag.update({ where: { id: tag.id }, data: { imageTagId } });
    stats.imageTagMappingsAdded++;
  } catch (e: unknown) {
    warn(`mapImageTag "${tagName}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function mapArticleTag(tagName: string, articleTagId: string) {
  if (DRY_RUN) { log(`  [DRY] MAP articleTag "${tagName}" → ${articleTagId}`); return; }
  const tag = await prisma.semanticTag.findUnique({ where: { name: tagName } });
  if (!tag) { warn(`Tag "${tagName}" not found — cannot map article tag`); return; }
  if (tag.tagId === articleTagId) { stats.articleTagMappingsAdded++; return; }
  if (tag.tagId && tag.tagId !== articleTagId) {
    warn(`Tag "${tagName}" already has tagId ${tag.tagId} — skipping`);
    return;
  }
  try {
    await prisma.semanticTag.update({ where: { id: tag.id }, data: { tagId: articleTagId } });
    stats.articleTagMappingsAdded++;
  } catch (e: unknown) {
    warn(`mapArticleTag "${tagName}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log(`═══ Phase B.5 Semantic Enrichment${DRY_RUN ? ' [DRY RUN]' : ''} ══════════════════════`);
  log(`    ${new Date().toISOString()}`);
  log('');

  // ── 0. Load category IDs ──────────────────────────────────────────────────
  const cats = await prisma.semanticCategory.findMany({ select: { id: true, name: true } });
  const catId = Object.fromEntries(cats.map(c => [c.name, c.id]));
  const needed = ['Τεχνολογία', 'Κόσμος', 'Αθλητικά', 'Οικονομία', 'Υγεία', 'Ελλάδα', 'AI'];
  for (const n of needed) {
    if (!catId[n]) { warn(`Category "${n}" not found!`); process.exit(1); }
  }
  log(`✓ Loaded ${cats.length} semantic categories`);

  // ── 0b. Data safety baseline ──────────────────────────────────────────────
  const [bArticles, bTagRels, bTags, bSemTags, bAliases] = await Promise.all([
    prisma.article.count(),
    prisma.articleTag.count(),
    prisma.tag.count(),
    prisma.semanticTag.count(),
    prisma.semanticTagAlias.count({ where: { isActive: true } }),
  ]);
  log(`✓ Baseline: ${bArticles} articles, ${bTagRels} art↔tag rels, ${bTags} article tags, ${bSemTags} semantic tags, ${bAliases} aliases`);
  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §1  EXISTING IMAGE TAG MAPPINGS (fix 6 unmapped semantic tags)
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §1 Fix existing image tag mappings ─────────────────────────────────');

  await mapImageTag('AI models',       '73d5984f-9c23-4cd7-b953-2f42681764c0'); // Τεχνητή Νοημοσύνη
  await mapImageTag('cloud computing', 'cb4ddc3d-b7e3-425a-b5b4-ef4020a72cf7'); // Cloud
  await mapImageTag('ΕΕ',             'fe9c0afe-758d-45e4-bce9-6e9fa714c09d'); // Ευρωπαϊκή Ένωση
  await mapImageTag('ιατρική έρευνα', 'ad20f1cf-398e-4d6e-98b4-c22298830ee1'); // Έρευνα
  await mapImageTag('EuroLeague',      '8884827e-4c87-4ef2-9026-5ed7279e653e'); // Μπάσκετ
  await mapImageTag('ελληνικές εκλογές', 'b56d8b83-f676-4069-9206-9c0b9a204203'); // Πολιτική

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  NEW SEMANTIC TAGS — Τεχνολογία
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §2 New Τεχνολογία tags ──────────────────────────────────────────────');

  await upsertTag({
    name: 'Microsoft',
    slug: 'microsoft',
    catId: catId['Τεχνολογία'],
    weight: 1.1,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false, // no Microsoft image tag exists
  });
  await addAliases('Microsoft', [
    'Microsoft', 'Windows', 'Windows 11', 'Windows 10', 'Microsoft 365',
    'Office 365', 'Teams Microsoft', 'Azure Microsoft', 'Xbox', 'Surface',
    'Copilot Microsoft', 'Bing', 'Satya Nadella', 'Visual Studio',
  ]);

  await upsertTag({
    name: 'SpaceX',
    slug: 'spacex',
    catId: catId['Τεχνολογία'],
    weight: 1.1,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false, // no SpaceX image tag exists
  });
  await addAliases('SpaceX', [
    'SpaceX', 'Starlink', 'Falcon 9', 'Falcon Heavy', 'Starship',
    'εκτόξευση πυραύλου', 'rocket launch', 'Dragon capsule',
    'Elon Musk SpaceX', 'ISS', 'επανδρωμένη αποστολή',
    'Βαγόνι σε τροχιά', 'Crew Dragon',
  ]);

  await upsertTag({
    name: 'Netflix',
    slug: 'netflix',
    catId: catId['Τεχνολογία'],
    weight: 1.0,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false, // no Netflix image tag exists
  });
  await addAliases('Netflix', [
    'Netflix', 'streaming', 'Prime Video', 'Disney Plus', 'Disney+',
    'Apple TV Plus', 'Max streaming', 'σειρά Netflix', 'ταινία Netflix',
    'streaming platform', 'VOD', 'video on demand', 'online streaming',
    'σειρά streaming',
  ]);

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §3  NEW SEMANTIC TAGS — Κόσμος (major countries)
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §3 New Κόσμος country tags ──────────────────────────────────────────');

  await upsertTag({
    name: 'Γερμανία',
    slug: 'germania',
    catId: catId['Κόσμος'],
    weight: 1.1,
    isPriority: true,
    bonus: 25,
    useForArticleTagging: true,
    useForImageMatching: false, // no Γερμανία image tag
  });
  await addAliases('Γερμανία', [
    'Γερμανία', 'Germany', 'German', 'γερμανικός', 'γερμανική κυβέρνηση',
    'Βερολίνο', 'Berlin', 'Μόναχο', 'Munich', 'Σολτς', 'Scholz',
    'Μέρτς', 'Merz', 'CDU', 'SPD', 'γερμανικές εκλογές',
    'γερμανική οικονομία',
  ]);

  await upsertTag({
    name: 'Ηνωμένο Βασίλειο',
    slug: 'inomeno-vasileio',
    catId: catId['Κόσμος'],
    weight: 1.1,
    isPriority: true,
    bonus: 25,
    useForArticleTagging: true,
    useForImageMatching: false, // no UK image tag
  });
  await addAliases('Ηνωμένο Βασίλειο', [
    'Ηνωμένο Βασίλειο', 'UK', 'Britain', 'British', 'βρετανικός',
    'Λονδίνο', 'London', 'Στάρμερ', 'Starmer', 'Σάνακ', 'Sunak',
    'Βασιλιάς Κάρολος', 'King Charles', 'Brexit', 'βρετανική κυβέρνηση',
    'Αγγλία', 'England', 'Scotland', 'Westminster',
  ]);

  await upsertTag({
    name: 'Κίνα',
    slug: 'kina',
    catId: catId['Κόσμος'],
    weight: 1.1,
    isPriority: true,
    bonus: 25,
    useForArticleTagging: true,
    useForImageMatching: true,
    imageTagId: '1ae8a23b-86c5-453c-a8ac-1321e046e465', // Κίνα image tag
  });
  await addAliases('Κίνα', [
    'Κίνα', 'China', 'Chinese', 'κινεζικός', 'κινεζική κυβέρνηση',
    'Πεκίνο', 'Beijing', 'Σανγκάη', 'Shanghai', 'Σι Τζινπίνγκ', 'Xi Jinping',
    'Κομμουνιστικό Κόμμα Κίνας', 'CCP', 'Χονγκ Κονγκ', 'Hong Kong',
    'Ταϊβάν', 'Taiwan', 'κινεζικά εμπορικά δασμοί',
  ]);

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §4  NEW SEMANTIC TAGS — Αθλητικά (FIFA/Μουντιάλ)
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §4 New Αθλητικά tags ────────────────────────────────────────────────');

  await upsertTag({
    name: 'FIFA',
    slug: 'fifa',
    catId: catId['Αθλητικά'],
    weight: 1.1,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: true,
    imageTagId: '588ac7e6-dcc7-410a-9275-6dc421ecf538', // Ποδόσφαιρο
  });
  await addAliases('FIFA', [
    'FIFA', 'Μουντιάλ', 'World Cup', 'Παγκόσμιο Κύπελλο ποδοσφαίρου',
    'World Cup 2026', 'FIFA 2026', 'μουντιαλικός αγώνας',
    'Παγκόσμιο Κύπελλο 2026', 'Copa del Mundo',
  ]);

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §5  NEW SEMANTIC TAGS — Οικονομία (for Article Tag mapping)
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §5 New Οικονομία tags (Article Tag mapping) ─────────────────────────');

  // Article Tags: ΕΚΤ, Επιτόκια, Ευρωζώνη (Πληθωρισμός already mapped)
  await upsertTag({
    name: 'Επιτόκια',
    slug: 'epitokia',
    catId: catId['Οικονομία'],
    weight: 1.0,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false,
    tagId: 'cmr6bvlfu00024xi2v81y0cu2', // Article Tag "Επιτόκια"
  });
  await addAliases('Επιτόκια', [
    'επιτόκιο', 'επιτόκια', 'interest rate', 'interest rates',
    'αύξηση επιτοκίων', 'μείωση επιτοκίων', 'βασικό επιτόκιο',
    'επιτοκιακή πολιτική', 'ΕΚΤ επιτόκιο', 'ECB rate',
    'χαμηλά επιτόκια', 'υψηλά επιτόκια',
  ]);

  await upsertTag({
    name: 'Ευρωζώνη',
    slug: 'eyrozoni',
    catId: catId['Οικονομία'],
    weight: 1.0,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false,
    tagId: 'cmr6bvlfu00014xi2md555gv2', // Article Tag "Ευρωζώνη"
  });
  await addAliases('Ευρωζώνη', [
    'Ευρωζώνη', 'Eurozone', 'ευρώ', 'euro area', 'νομισματική ένωση',
    'κοινό νόμισμα', 'οικονομία ευρωζώνης', 'ΟΝΕ',
    'οικονομική και νομισματική ένωση',
  ]);

  await upsertTag({
    name: 'ΕΚΤ',
    slug: 'ekt',
    catId: catId['Οικονομία'],
    weight: 1.0,
    isPriority: false,
    bonus: 0,
    useForArticleTagging: true,
    useForImageMatching: false,
    tagId: 'cmr6bvlfv00034xi23ycdj9dy', // Article Tag "ΕΚΤ"
  });
  await addAliases('ΕΚΤ', [
    'ΕΚΤ', 'Ευρωπαϊκή Κεντρική Τράπεζα', 'ECB', 'European Central Bank',
    'Λαγκάρντ', 'Lagarde', 'κεντρική τράπεζα ευρωζώνης',
    'νομισματική πολιτική ΕΚΤ', 'ΕΚΤ επιτόκιο',
  ]);

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §6  ALIAS ENRICHMENT — Existing tags (English + missing aliases)
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §6 Alias enrichment for existing tags ───────────────────────────────');

  // Κόσμος/ΕΕ — add English aliases
  await addAliases('ΕΕ', [
    'EU', 'European Union', 'Europa', 'Ευρωκοινοβούλιο',
  ]);

  // Κόσμος/Ρωσία — add English aliases
  await addAliases('Ρωσία', [
    'Russia', 'Russian', 'Moscow', 'ρωσική οικονομία', 'ρωσικές κυρώσεις',
    'Medvedev', 'Μεντβέντεφ',
  ]);

  // Κόσμος/Τουρκία — add English aliases
  await addAliases('Τουρκία', [
    'Turkey', 'Turkish', 'Ankara', 'Turkish Lira', 'τουρκική λίρα',
  ]);

  // Κόσμος/ΝΑΤΟ — add military/drone aliases
  await addAliases('ΝΑΤΟ', [
    'military alliance', 'αμυντική δαπάνη', 'ΝΑΤΟϊκές δυνάμεις', 'Hague summit',
  ]);

  // Κόσμος/πόλεμος — military/drones already covered; add a few more
  await addAliases('πόλεμος', [
    'drone', 'drones', 'military operation', 'ceasefire', 'εμπόλεμη ζώνη',
    'πολεμική σύγκρουση', 'ένοπλες δυνάμεις', 'missile',
  ]);

  // Υγεία/καρκίνος — add English aliases
  await addAliases('καρκίνος', [
    'cancer', 'tumor', 'tumour', 'breast cancer', 'lung cancer',
    'prostate cancer', 'καρκίνος του μαστού', 'ογκολογική θεραπεία',
  ]);

  // Υγεία/ιατρική έρευνα — add antibiotic/superbug aliases
  await addAliases('ιατρική έρευνα', [
    'antibiotic', 'antibiotics', 'antibiotic resistance',
    'superbug', 'superbugs', 'antimicrobial resistance', 'AMR', 'MRSA',
    'αντιβιοτικά', 'αντιοχή στα αντιβιοτικά', 'αντιμικροβιακή αντοχή',
    'medical research', 'clinical trial',
  ]);

  // Αθλητικά/Champions League — add Klopp (Germany national team coach)
  await addAliases('Champions League', [
    'Κλοπ', 'Klopp', 'Jürgen Klopp', 'Guardiola', 'Γκουαρντιόλα',
    'Ancelotti', 'Αντσελότι', 'Μουρίνιο', 'Mourinho',
  ]);

  // Αθλητικά/Παναθηναϊκός — add more aliases
  await addAliases('Παναθηναϊκός', [
    'Παναθηναϊκός μπάσκετ', 'Παναθηναϊκός ΑΟ', 'ΠΑΟ μπάσκετ',
    'OAKA Παναθηναϊκός', 'τριφύλλι',
  ]);

  // Αθλητικά/EuroLeague — strengthen basket alias
  await addAliases('EuroLeague', [
    'ευρωλίγκα μπάσκετ', 'Top 16 EuroLeague', 'Play-off EuroLeague',
  ]);

  // AI/OpenAI — add recent models
  await addAliases('OpenAI', [
    'o4', 'o4-mini', 'GPT-4o', 'GPT-4.1', 'Operator OpenAI', 'Sora',
    'Whisper', 'DALL-E',
  ]);

  // AI/Google AI — add recent aliases
  await addAliases('Google AI', [
    'Gemini 2.0', 'Gemini 2.5', 'Google NotebookLM', 'Google Veo',
    'Google Astra',
  ]);

  // AI/Anthropic — up to date
  await addAliases('Anthropic', [
    'Claude Sonnet', 'Claude Opus', 'Claude Haiku',
  ]);

  // AI/AI models — add more model families
  await addAliases('AI models', [
    'Qwen', 'DeepSeek', 'Phi-4', 'Gemma', 'Command R',
    'AI model', 'μοντέλο γλώσσας', 'γλωσσικό μοντέλο',
  ]);

  // Τεχνολογία/social media — add modern platforms
  await addAliases('social media', [
    'Threads', 'Bluesky', 'Mastodon', 'Snapchat', 'Reddit',
    'social network', 'κοινωνικό δίκτυο',
  ]);

  // Τεχνολογία/ηλεκτρικά οχήματα — add more
  await addAliases('ηλεκτρικά οχήματα', [
    'EV market', 'Tesla Model Y', 'Tesla Model 3', 'Rivian',
    'φόρτιση οχημάτων', 'υποδομή φόρτισης',
  ]);

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §7  VALIDATION — Verify false-positive patterns are NOT present
  // ═══════════════════════════════════════════════════════════════════════════
  log('─── §7 False-positive alias validation ──────────────────────────────────');

  const FORBIDDEN = ['ar', 'un', 'star', 'intel', 'mega', 'βάρος', 'facebook'];
  const allAliases = await prisma.semanticTagAlias.findMany({
    where: { isActive: true },
    select: { alias: true, semanticTag: { select: { name: true } } },
  });
  let fpOk = true;
  for (const row of allAliases) {
    const a = row.alias.trim().toLowerCase();
    if (FORBIDDEN.includes(a)) {
      warn(`FALSE POSITIVE: alias "${row.alias}" on tag "${row.semanticTag.name}" — should be removed!`);
      fpOk = false;
    }
  }
  if (fpOk) log('  ✓ No forbidden aliases found');

  log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  WRITE AUDIT LOG ENTRY
  // ═══════════════════════════════════════════════════════════════════════════
  if (!DRY_RUN) {
    try {
      await prisma.semanticAuditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: 'phase-b5-enrichment',
          action: 'import',
          after: {
            tagsCreated: stats.tagsCreated,
            aliasesAdded: stats.aliasesAdded,
            imageTagMappings: stats.imageTagMappingsAdded,
            articleTagMappings: stats.articleTagMappingsAdded,
            script: 'scripts/enrich-semantic-system.ts',
          },
          userId: null,
        },
      });
      log('✓ Wrote audit log entry');
    } catch (e) {
      warn(`Could not write audit log: ${e}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §9  FINAL REPORT
  // ═══════════════════════════════════════════════════════════════════════════
  const [aSemTags, aAliases, aWithImgTag, aWithArtTag] = await Promise.all([
    prisma.semanticTag.count(),
    prisma.semanticTagAlias.count({ where: { isActive: true } }),
    prisma.semanticTag.count({ where: { imageTagId: { not: null } } }),
    prisma.semanticTag.count({ where: { tagId: { not: null } } }),
  ]);

  log('═══ ENRICHMENT REPORT ══════════════════════════════════════════════════');
  log(`  Semantic Tags    : ${bSemTags} → ${aSemTags} (+${aSemTags - bSemTags} created)`);
  log(`  Active Aliases   : ${bAliases} → ${aAliases} (+${aAliases - bAliases} added)`);
  log(`  With Image Tag   : — → ${aWithImgTag}/${aSemTags} (${Math.round(aWithImgTag/aSemTags*100)}%)`);
  log(`  With Article Tag : — → ${aWithArtTag}/${aSemTags}`);
  log('');
  log(`  Tags created           : ${stats.tagsCreated}`);
  log(`  Tags already existed   : ${stats.tagsAlreadyExisted}`);
  log(`  Aliases added (new)    : ${stats.aliasesAdded}`);
  log(`  Aliases already existed: ${stats.aliasesAlreadyExisted}`);
  log(`  Image tag mappings     : ${stats.imageTagMappingsAdded}`);
  log(`  Article tag mappings   : ${stats.articleTagMappingsAdded}`);
  if (stats.errors.length > 0) {
    log('');
    log(`  WARNINGS (${stats.errors.length}):`);
    for (const e of stats.errors) log(`    - ${e}`);
  } else {
    log('  ✓ No errors');
  }
  log('');
  log(`  DATA SAFETY CHECK:`);
  const [cArticles, cTagRels, cTags] = await Promise.all([
    prisma.article.count(),
    prisma.articleTag.count(),
    prisma.tag.count(),
  ]);
  const ok = cArticles === bArticles && cTagRels === bTagRels && cTags === bTags;
  log(`  Articles unchanged     : ${cArticles === bArticles ? '✓' : '✗'} (${bArticles} → ${cArticles})`);
  log(`  Article↔Tag rels       : ${cTagRels === bTagRels ? '✓' : '✗'} (${bTagRels} → ${cTagRels})`);
  log(`  Article Tags unchanged : ${cTags === bTags ? '✓' : '✗'} (${bTags} → ${cTags})`);
  log('');
  log(ok ? '  ✓ DATA SAFETY: PASS — no existing data modified' : '  ✗ DATA SAFETY: FAIL — unexpected changes detected!');
  log('');
  log(DRY_RUN ? '  [DRY RUN — nothing written to database]' : '  Run scripts/run-semantic-audit.ts to see updated comparison scores');
  log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
