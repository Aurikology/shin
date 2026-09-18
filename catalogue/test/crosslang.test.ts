/*
 * Tests for cross-language retrieval (src/crosslang.ts and the columns it adds).
 *
 * Three things have to hold, and each of them is a thing that has already gone
 * wrong somewhere in this repo in a different form:
 *
 *   1. A DERIVED NAME MUST NEVER REACH A SHOPPER. It is a machine alignment, not
 *      the product's name. It is allowed to make a row findable and nothing else.
 *      This is the test that matters most; the rest is plumbing.
 *
 *   2. THE FTS MIGRATION MUST ACTUALLY MIGRATE. `CREATE VIRTUAL TABLE IF NOT
 *      EXISTS` does nothing to a database that already has the table, so a
 *      column added to the definition never reaches any existing catalogue and
 *      nothing says so. A migration that silently no-ops is the defect class
 *      this repo logs most often, so it gets its own test.
 *
 *   3. TRANSLATION MUST BE GATED AND MUST NOT TOUCH BRANDS. Translating a brand
 *      turns "Yoplait" into a different word and loses the one token most likely
 *      to identify the row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogue, openCatalogueReadOnly, rebuildFts, migrateFts, FTS_COLUMNS } from '../src/schema.ts';
import { Catalogue } from '../src/search.ts';
import { LanguageModel, derive, brandTokens, contentTokens, type Lexicon } from '../src/crosslang.ts';
import { loadLexicon, backfillDerived } from '../src/backfill-derived.ts';
import { buildLexicon } from '../src/build-lexicon.ts';

function tempPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-xlang-')), name);
}

/** Nothing in this package may embed during a test; the vector arm is off everywhere below. */
const NO_EMBEDDER = {
  embedQuery(): never { throw new Error('no embedding in tests'); },
  embedPassage(): never { throw new Error('no embedding in tests'); },
} as never;

/** A language model that calls exactly the tokens it is given, with no corpus behind it. */
function fakeLm(fr: readonly string[], en: readonly string[] = []): LanguageModel {
  const df = new Map<string, { en: number; fr: number }>();
  for (const t of fr) df.set(t, { en: 0, fr: 100 });
  for (const t of en) df.set(t, { en: 100, fr: 0 });
  return new LanguageModel(df, 1000, 1000);
}

const LEX: Lexicon = { fr2en: { fromage: ['cheese'], chocolat: ['chocolate'] }, en2fr: { cheese: ['fromage'] } };

// ---------------------------------------------------------------------------
// 1. The derived name is searchable and is NOT displayable.
// ---------------------------------------------------------------------------

test('a row reachable only through name_derived comes back, and the derived text is not in the response', async () => {
  const path = tempPath('cat.db');
  const db = openCatalogue(path);
  db.exec(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity,
      category_path, leaf_category, allergens, sold_in_canada, source,
      name_derived, derived_source)
    VALUES ('111', 'Fromage bleu Zpqx', NULL, 'Fromage bleu Zpqx', 'Zpqx', '200 g',
      '[]', NULL, '[]', 1, 'test', 'bluecheesewidget', 'lexicon-fr2en')`);
  rebuildFts(db);
  db.close();

  const ro = openCatalogueReadOnly(path);
  const cat = new Catalogue(ro, NO_EMBEDDER);
  const res = await cat.search({ text: 'bluecheesewidget', limit: 5, vectors: false });
  const hit = res.candidates.find((c) => c.code === '111');
  assert.ok(hit, 'the derived token must be able to retrieve the row -- that is what it is for');

  // And now the part that actually matters: it must not be anywhere in what
  // comes back. Walk the whole candidate, not a list of fields somebody has to
  // remember to update when a field is added.
  const serialised = JSON.stringify(hit);
  assert.ok(
    !serialised.toLowerCase().includes('bluecheesewidget'),
    `derived text leaked into a user-facing candidate: ${serialised}`,
  );
  assert.ok(!('nameDerived' in (hit as object)), 'Candidate must not carry a derived name field');
  assert.ok(!('derivedSource' in (hit as object)), 'Candidate must not carry the derivation provenance');
  ro.close();
});

test('name_derived is indexed but is not one of the columns a candidate is built from', () => {
  const path = tempPath('cols.db');
  const db = openCatalogue(path);
  const ftsCols = (db.prepare('PRAGMA table_info(product_fts)').all() as unknown as { name: string }[]).map((r) => r.name);
  assert.ok(ftsCols.includes('name_derived'), 'the derived column must be in the index or it buys nothing');
  db.close();

  // The display side is asserted behaviourally above; this pins the intent so a
  // future reader adding a column to SELECT_COLS sees why name_derived is absent.
  assert.deepEqual([...FTS_COLUMNS], ['name_en', 'name_fr', 'brands', 'leaf_category', 'name_derived']);
  // `name` stays OUT: it is a verbatim copy of a language column on 184,302
  // rows and distinct text on none, so indexing it duplicates far more than it
  // rescues. The rows it would have rescued go through name_derived instead.
  assert.ok(!(FTS_COLUMNS as readonly string[]).includes('name'));
});

test('a row whose only name is `name` becomes searchable, through name_derived not through an FTS column', () => {
  const path = tempPath('nameonly.db');
  const db = openCatalogue(path);
  db.exec(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity,
      category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES ('333','Qwertzuiop Gadget',NULL,NULL,NULL,'1 kg','[]',NULL,'[]',1,'test')`);
  rebuildFts(db);
  const miss = db.prepare(`SELECT count(*) AS n FROM product_fts WHERE product_fts MATCH ?`)
    .get('"qwertzuiop"') as unknown as { n: number };
  assert.equal(Number(miss.n), 0, 'precondition: with no language name, the row is invisible to text search');

  const rep = backfillDerived(db, { en2fr: {}, fr2en: {} });
  assert.equal(rep.nameOnly, 1);
  rebuildFts(db);
  const hit = db.prepare(`SELECT count(*) AS n FROM product_fts WHERE product_fts MATCH ?`)
    .get('"qwertzuiop"') as unknown as { n: number };
  assert.equal(Number(hit.n), 1, 'after the backfill the row must be reachable by its own name');
  const prov = db.prepare(`SELECT derived_source AS s FROM product WHERE code='333'`).get() as unknown as { s: string };
  assert.equal(prov.s, 'name-only', 'provenance must say this was copied verbatim, not translated');
  db.close();
});

// ---------------------------------------------------------------------------
// 2. The migration is real.
// ---------------------------------------------------------------------------

test('migrateFts rebuilds an index left on the old column list, and is a no-op the second time', () => {
  const path = tempPath('old.db');
  // A catalogue as it existed before this change: four FTS columns, no derived one.
  const w = new DatabaseSync(path);
  w.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT, name_en TEXT, name_fr TEXT,
    brands TEXT, leaf_category TEXT) STRICT`);
  w.exec(`CREATE VIRTUAL TABLE product_fts USING fts5(name_en, name_fr, brands, leaf_category,
    content='product', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2")`);
  w.exec(`INSERT INTO product VALUES ('1','Old Row','Old Row',NULL,'Acme',NULL)`);
  w.exec(`ALTER TABLE product ADD COLUMN name_derived TEXT`);
  w.exec(`ALTER TABLE product ADD COLUMN derived_source TEXT`);

  const before = (w.prepare('PRAGMA table_info(product_fts)').all() as unknown as { name: string }[]).map((r) => r.name);
  assert.equal(before.length, 4, 'precondition: this database is on the old index');

  assert.equal(migrateFts(w), true, 'a stale index must be reported as migrated, not silently skipped');
  const after = (w.prepare('PRAGMA table_info(product_fts)').all() as unknown as { name: string }[]).map((r) => r.name);
  assert.deepEqual(after, [...FTS_COLUMNS]);
  // Rebuilt, not just recreated empty.
  const n = w.prepare(`SELECT count(*) AS n FROM product_fts WHERE product_fts MATCH ?`).get('"old"') as unknown as { n: number };
  assert.equal(Number(n.n), 1, 'the migrated index must contain the existing rows');

  assert.equal(migrateFts(w), false, 'a current index must not be dropped and rebuilt on every open');
  w.close();
});

test('bm25 weights follow the index that is actually there, not a hardcoded count', async () => {
  // The hazard being pinned: bm25() accepts any number of weights without
  // error, so a four-weight literal against a six-column index scores the last
  // two at 1.0 forever and nothing reports it. A search over a non-default
  // column list must still run and still rank.
  const path = tempPath('weights.db');
  const db = openCatalogue(path);
  db.exec(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity,
      category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES ('222','Widget Alpha','Widget Alpha',NULL,'Acme','1 kg','[]',NULL,'[]',1,'test')`);
  db.exec('DROP TABLE IF EXISTS product_fts');
  db.exec(`CREATE VIRTUAL TABLE product_fts USING fts5(name_en, brands,
    content='product', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2")`);
  rebuildFts(db);
  db.close();

  const ro = openCatalogueReadOnly(path);
  const res = await new Catalogue(ro, NO_EMBEDDER).search({ text: 'widget alpha', limit: 5, vectors: false });
  assert.equal(res.candidates[0]?.code, '222');
  ro.close();
});

// ---------------------------------------------------------------------------
// 3. The gate, and the brands rule.
// ---------------------------------------------------------------------------

test('a name carrying no marker of its own language is not derived from at all', () => {
  const lm = fakeLm(['fromage']);
  // "Trojan Ultra Thin Condoms" is a real row stored in name_fr. It is English,
  // it needs no translation, and FTS5 already finds it from an English query
  // because MATCH does not filter by column.
  assert.equal(derive({ name: 'Trojan Ultra Thin Condoms', brands: 'Trojan' }, 'fr', LEX, lm), null);
});

test('a genuinely French name yields its translated tokens and only those', () => {
  const lm = fakeLm(['fromage', 'chocolat']);
  const d = derive({ name: 'Fromage au chocolat Yoplait', brands: 'Yoplait' }, 'fr', LEX, lm);
  assert.ok(d);
  const out = d.text.split(' ').sort();
  assert.deepEqual(out, ['cheese', 'chocolate']);
  assert.equal(d.source, 'lexicon-fr2en');
  // "au" and "Yoplait" are absent: one has no entry, the other is the brand.
  assert.ok(!d.text.includes('yoplait'));
  assert.equal(d.untranslated, 1, 'the untranslated remainder is counted, not emitted');
});

test('a brand token is never translated even when the lexicon has an entry for it', () => {
  const lm = fakeLm(['fromage']);
  const lex: Lexicon = { fr2en: { fromage: ['cheese'] }, en2fr: {} };
  // The row's brand IS the word "Fromage". Translating it would replace the one
  // token most likely to identify this row.
  const d = derive({ name: 'Fromage Original', brands: 'Fromage' }, 'fr', lex, lm);
  assert.equal(d, null, 'with the only French token claimed by the brand there is nothing left to derive');
});

test('brand tokens are taken from the row, not from a catalogue-wide set', () => {
  // Measured consequence of getting this wrong: a global set of every token that
  // has ever appeared in a brands field is 26,930 wide, swallows ordinary nouns,
  // and cut lexicon coverage from 40% to 9%.
  assert.deepEqual([...brandTokens('Dr. Bronner')], ['dr', 'bronner']);
  assert.deepEqual([...brandTokens(null)], []);
  assert.deepEqual(contentTokens('Crème 2% de Marrons'), ['creme', 'de', 'marrons']);
});

// ---------------------------------------------------------------------------
// The shipped lexicon.
// ---------------------------------------------------------------------------

test('the shipped lexicon loads, is non-trivial, and is symmetric in shape', () => {
  const lex = loadLexicon();
  assert.ok(Object.keys(lex.fr2en).length > 200, 'a lexicon this small would not be worth an index column');
  assert.ok(Object.keys(lex.en2fr).length > 200);
  for (const table of [lex.fr2en, lex.en2fr]) {
    for (const [k, v] of Object.entries(table)) {
      assert.ok(k === k.toLowerCase() && !/[̀-ͯ]/.test(k.normalize('NFD')), `key not folded: ${k}`);
      assert.ok(Array.isArray(v) && v.length > 0 && v.length <= 3, `bad entry for ${k}`);
    }
  }
});

test('buildLexicon is deterministic and honours its holdout', () => {
  const pairs = [
    { rowid: 1, en: 'blue cheese', fr: 'fromage bleu', brands: null },
    { rowid: 2, en: 'white cheese', fr: 'fromage blanc', brands: null },
    { rowid: 3, en: 'goat cheese', fr: 'fromage chevre', brands: null },
    { rowid: 4, en: 'fresh cheese', fr: 'fromage frais', brands: null },
  ];
  const opt = { holdout: 0, minCo: 3, minDice: 0.2, topK: 2 };
  const a = buildLexicon(pairs, opt);
  const b = buildLexicon(pairs, opt);
  assert.deepEqual(a, b, 'same input must give a byte-identical lexicon or the shipped file churns');
  assert.deepEqual(a.fr2en.fromage, ['cheese']);
  // Hold out every row and there is nothing left to learn from.
  assert.deepEqual(buildLexicon(pairs, { ...opt, holdout: 1 }), { en2fr: {}, fr2en: {} });
});
