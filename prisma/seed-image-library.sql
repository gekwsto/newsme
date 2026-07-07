-- Image Library Seed: categories + tags
-- Run: psql $DATABASE_URL -f prisma/seed-image-library.sql

BEGIN;

-- ── 1. Image Categories (slugs must match article category slugs) ─────────────

INSERT INTO image_categories (id, name, slug, description, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Ελλάδα',             'ellada',             'Ειδήσεις Ελλάδας',         now(), now()),
  (gen_random_uuid(), 'Οικονομία',           'oikonomia',          'Οικονομικά νέα',            now(), now()),
  (gen_random_uuid(), 'Κόσμος',             'kosmos',             'Διεθνή νέα',                now(), now()),
  (gen_random_uuid(), 'Τεχνολογία',         'texnologia',         'Τεχνολογία & gadgets',      now(), now()),
  (gen_random_uuid(), 'AI',                 'ai',                 'Τεχνητή Νοημοσύνη',         now(), now()),
  (gen_random_uuid(), 'Αθλητικά',           'athlitika',          'Αθλητικές ειδήσεις',        now(), now()),
  (gen_random_uuid(), 'Καιρός',             'kairos',             'Καιρικά φαινόμενα',         now(), now()),
  (gen_random_uuid(), 'Υγεία',              'ygeia',              'Υγεία & ιατρική',           now(), now()),
  (gen_random_uuid(), 'Επιχειρηματικότητα', 'epixeirimatikotita', 'Επιχειρήσεις & startups',  now(), now()),
  (gen_random_uuid(), 'Media',              'media',              'ΜΜΕ & ψυχαγωγία',          now(), now()),
  (gen_random_uuid(), 'Απόψεις',            'apopseis',           'Άρθρα γνώμης',              now(), now())
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Image Tags ─────────────────────────────────────────────────────────────
-- slug = Greek word without accents (NFD-normalized lowercase)
-- This is what select-featured-image.ts uses for title matching

-- ΕΛΛΑΔΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'ellada')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Πυρκαγιά',   'πυρκαγια'),
  ('Φωτιά',      'φωτια'),
  ('Σεισμός',    'σεισμος'),
  ('Τροχαίο',    'τροχαιο'),
  ('Αστυνομία',  'αστυνομια'),
  ('Δικαστήριο', 'δικαστηριο'),
  ('Πολιτική',   'πολιτικη'),
  ('Παιδεία',    'παιδεια'),
  ('Μεταφορές',  'μεταφορες'),
  ('Πλημμύρες',  'πλημμυρες')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΟΙΚΟΝΟΜΙΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'oikonomia')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Τράπεζες',        'τραπεζες'),
  ('Χρηματιστήριο',   'χρηματιστηριο'),
  ('Φορολογία',       'φορολογια'),
  ('Συντάξεις',       'συνταξεις'),
  ('Επίδομα',         'επιδομα'),
  ('Εργασία',         'εργασια'),
  ('Πληθωρισμός',     'πληθωρισμος'),
  ('Επιχειρήσεις',    'επιχειρησεις')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΚΟΣΜΟΣ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'kosmos')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Πόλεμος',           'πολεμος'),
  ('Ουκρανία',          'ουκρανια'),
  ('Μέση Ανατολή',      'μεση ανατολη'),
  ('ΗΠΑ',               'ηπα'),
  ('ΝΑΤΟ',              'νατο'),
  ('Τουρκία',           'τουρκια'),
  ('Ευρωπαϊκή Ένωση',  'ευρωπαικη ενωση'),
  ('Ρωσία',             'ρωσια'),
  ('Κίνα',              'κινα'),
  ('Διπλωματία',        'διπλωματια')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- AI
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'ai')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('OpenAI',               'openai'),
  ('Google AI',            'google ai'),
  ('Nvidia',               'nvidia'),
  ('Anthropic',            'anthropic'),
  ('Τεχνητή Νοημοσύνη',   'τεχνητη νοημοσυνη'),
  ('Robotics',             'robotics'),
  ('AI Chips',             'ai chips')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΤΕΧΝΟΛΟΓΙΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'texnologia')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Κυβερνοασφάλεια',     'κυβερνοασφαλεια'),
  ('Smartphone',           'smartphone'),
  ('Ηλεκτρικά Οχήματα',   'ηλεκτρικα οχηματα'),
  ('Social Media',         'social media'),
  ('Apple',                'apple'),
  ('Cloud',                'cloud'),
  ('Hacking',              'hacking')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΑΘΛΗΤΙΚΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'athlitika')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Ολυμπιακός',     'ολυμπιακος'),
  ('Παναθηναϊκός',   'παναθηναικος'),
  ('ΑΕΚ',            'αεκ'),
  ('ΠΑΟΚ',           'παοκ'),
  ('Super League',   'super league'),
  ('NBA',            'nba'),
  ('Formula 1',      'formula 1'),
  ('Τένις',          'τενις'),
  ('Μπάσκετ',        'μπασκετ'),
  ('Ποδόσφαιρο',     'ποδοσφαιρο'),
  ('Champions League', 'champions league'),
  ('Εθνική',         'εθνικη')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΚΑΙΡΟΣ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'kairos')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Καύσωνας',     'καυσωνας'),
  ('Κακοκαιρία',   'κακοκαιρια'),
  ('Χιονόπτωση',   'χιονοπτωση'),
  ('Καταιγίδα',    'καταιγιδα'),
  ('Πλημμύρες',    'πλημμυρες'),
  ('Θύελλα',       'θυελλα')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΥΓΕΙΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'ygeia')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('ΕΣΥ',           'εσυ'),
  ('Εμβόλιο',       'εμβολιο'),
  ('Καρκίνος',      'καρκινος'),
  ('Ψυχική Υγεία',  'ψυχικη υγεια'),
  ('Νοσοκομείο',    'νοσοκομειο'),
  ('Έρευνα',        'ερευνα')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- ΕΠΙΧΕΙΡΗΜΑΤΙΚΟΤΗΤΑ
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'epixeirimatikotita')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Startup',       'startup'),
  ('Εξαγορά',       'εξαγορα'),
  ('IPO',           'ipo'),
  ('Επενδύσεις',    'επενδυσεις'),
  ('Επιχειρήσεις',  'επιχειρησεις')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

-- MEDIA
WITH cat AS (SELECT id FROM image_categories WHERE slug = 'media')
INSERT INTO image_tags (id, name, slug, "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, slug, cat.id, now(), now() FROM cat, (VALUES
  ('Τηλεόραση',   'τηλεοραση'),
  ('Κινηματογράφος', 'κινηματογραφος'),
  ('Μουσική',     'μουσικη'),
  ('Gaming',      'gaming')
) AS t(name, slug)
ON CONFLICT (slug, "categoryId") DO NOTHING;

COMMIT;

-- Verify
SELECT ic.name AS category, it.name AS tag, it.slug
FROM image_tags it
JOIN image_categories ic ON ic.id = it."categoryId"
ORDER BY ic.name, it.name;
