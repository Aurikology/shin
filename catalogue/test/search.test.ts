/**
 * Tests for the parts of retrieval that must hold regardless of what is loaded.
 *
 * These run against a tiny hand-built catalogue with a deterministic stand-in
 * embedder, so they check the LOGIC: the three bands, the ring widening and its
 * naming, barcode normalisation, and the query escaping that decides whether an
 * apostrophe in a product name is a bad match or a crash in front of a user.
 *
 * They deliberately do not check retrieval QUALITY. That cannot be asserted
 * against a fixture the same commit wrote; it is checked by asking the real
 * catalogue real questions from the command line, which is stage 1's own
 * done-when.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, rebuildCategories, toVecBlob, EMBED_DIM } from '../src/schema.ts';
import { openGapLog } from '../src/gaps.ts';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Catalogue, labelForTag } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';

/**
 * A stand-in embedder with no model behind it.
 *
 * Hashes tokens into a fixed space and normalises, so identical text is
 * identical, similar text is near, and everything is deterministic across runs
 * and machines. Enough to exercise fusion and banding without downloading 400 MB
 * of weights inside a unit test.
 */
class HashEmbedder implements Embedder {
  readonly id = 'test:hash';
  readonly dim = EMBED_DIM;

  #vec(text: string): Float32Array {
    const v = new Float32Array(this.dim);
    for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i += 1) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      v[Math.abs(h) % this.dim] += 1;
    }
    let sum = 0;
    for (const x of v) sum += x * x;
    const n = Math.sqrt(sum) || 1;
    for (let i = 0; i < v.length; i += 1) v[i] /= n;
    return v;
  }

  async embedPassages(texts: string[]) {
    return texts.map((t) => this.#vec(t));
  }

  async embedQuery(text: string) {
    return this.#vec(text);
  }
}

const ORANGE_PATH = ['en:plant-based-foods', 'en:fruits', 'en:citrus', 'en:oranges'];

async function fixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const rows = [
    ['0068100084245', 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Beurre d arachide cremeux', 'Kraft', '1kg', 1000, 'g', '["en:spreads","en:peanut-butters"]', 'en:peanut-butters', 1],
    ['0068100084276', 'Smooth Peanut Butter', 'Smooth Peanut Butter', null, 'Kraft', '2 kg', 2000, 'g', '["en:spreads","en:peanut-butters"]', 'en:peanut-butters', 1],
    ['1000000000001', 'Navel Orange', 'Navel Orange', 'Orange navel', 'Sunkist', '1 ea', null, null, JSON.stringify(ORANGE_PATH), 'en:oranges', 1],
    ['1000000000002', 'Blood Orange', 'Blood Orange', 'Orange sanguine', null, '1 ea', null, null, JSON.stringify(ORANGE_PATH), 'en:oranges', 1],
    ['1000000000003', 'Valencia Orange', 'Valencia Orange', 'Orange Valencia', null, '1 ea', null, null, JSON.stringify(ORANGE_PATH), 'en:oranges', 1],
    ['1000000000004', "Nature's Path Granola", "Nature's Path Granola", null, "Nature's Path", '750 g', 750, 'g', '["en:cereals","en:granolas"]', 'en:granolas', 1],
    ['1000000000005', 'Imported Biscuit', 'Imported Biscuit', null, 'Lotus', '250 g', 250, 'g', '["en:snacks","en:biscuits"]', 'en:biscuits', 0],
  ];
  for (const r of rows) {
    insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], '[]', r[10], 'test');
  }
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as {
    rowid: number; name: string; brands: string | null;
  }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  return new Catalogue(db, embedder);
}

test('a barcode short-circuits everything and is matched by itself', async () => {
  const cat = await fixture();
  const r = await cat.search({ gtin: '0068100084245' });
  assert.equal(r.matchedBy, 'gtin');
  assert.equal(r.band, 'confident');
  assert.equal(r.candidates[0].code, '0068100084245');
  assert.equal(r.ring, null);
});

test('a UPC-A read reaches its EAN-13 row rather than reporting a gap', async () => {
  const cat = await fixture();
  // Same product, leading zero stripped the way a UPC-A scanner reports it.
  const r = await cat.search({ gtin: '68100084245' });
  assert.equal(r.matchedBy, 'gtin');
  assert.equal(r.candidates[0].code, '0068100084245');
});

test('a product we do not have returns a ring named at the right level', async () => {
  const cat = await fixture();
  const ring = cat.ring(ORANGE_PATH, 3, '1000000000002');
  assert.ok(ring, 'expected a ring');
  assert.equal(ring.tag, 'en:oranges');
  assert.equal(ring.label, 'Oranges');
  assert.equal(ring.distanceOut, 0);
  assert.equal(ring.members.length, 2);
  assert.ok(!ring.members.some((m) => m.code === '1000000000002'), 'excluded item leaked in');
});

test('the ring widens when the leaf is too thin, and says how far it went', async () => {
  const cat = await fixture();
  // Nothing else shares en:biscuits, so it must climb to en:snacks -- and there
  // is nothing there either, so an honest null beats a ring drawn at "food".
  const ring = cat.ring(['en:snacks', 'en:biscuits'], 3, '1000000000005');
  assert.equal(ring, null, 'a ring with nothing in it must not be invented');
});

test('an apostrophe is a product name, not a syntax error', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: "Nature's Path granola" });
  assert.ok(r.candidates.length > 0, 'query with an apostrophe returned nothing');
  assert.equal(r.candidates[0].code, '1000000000004');
});

/*
 * The confident band, after the measurement in src/search.ts replaced a cosine
 * threshold with an agreement rule. These four are the whole rule, and they are
 * the tests that were missing when the old thresholds were in place: nothing
 * asserted that a text search could ever be confident, so a band that had become
 * unreachable against the real catalogue broke nothing here.
 */

test('a brand and a size the leader alone matches is confident', async () => {
  const cat = await fixture();
  const r = await cat.search({
    text: 'granola',
    brand: "Nature's Path",
    sizeValue: 750,
    sizeUnit: 'g',
  });
  assert.equal(r.band, 'confident');
  assert.equal(r.candidates[0].code, '1000000000004');
});

test('two rows matching the pinned brand equally well is not confident', async () => {
  // Both Kraft jars carry the brand. Whatever their cosines are, the user has a
  // choice to make and the app does not get to make it for them.
  const cat = await fixture();
  const r = await cat.search({ text: 'smooth peanut butter', brand: 'Kraft' });
  assert.notEqual(r.band, 'confident');
});

test('a leader that contradicts the brand on the label is never confident', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'granola', brand: 'Kelloggs' });
  assert.notEqual(r.band, 'confident');
});

test('a query that pinned nothing down can never be confident', async () => {
  // A typed search with no brand and no size. Someone asking for granola is
  // asking to see the granolas.
  const cat = await fixture();
  const r = await cat.search({ text: "Nature's Path Granola" });
  assert.notEqual(r.band, 'confident');
  assert.ok(r.candidates.length >= 1);
});

test('two identical products of different sizes are never one confident answer', async () => {
  const cat = await fixture();
  // Kraft Smooth Peanut Butter exists at 1kg and 2kg with the same name. This is
  // decision 19: size is identity, and a query that cannot tell them apart must
  // not auto-proceed.
  const r = await cat.search({ text: 'Kraft Smooth Peanut Butter' });
  assert.notEqual(r.band, 'confident');
  assert.ok(r.candidates.length >= 2);
});

test('size agreement is reported when the query carries a size', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Kraft Smooth Peanut Butter', sizeValue: 1000, sizeUnit: 'g' });
  const oneKg = r.candidates.find((c) => c.code === '0068100084245');
  const twoKg = r.candidates.find((c) => c.code === '0068100084276');
  assert.equal(oneKg?.signals.sizeAgrees, true);
  assert.equal(twoKg?.signals.sizeAgrees, false);
});

test('brand agreement is reported, and disagreement is not silent', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'granola', brand: 'Kraft' });
  const np = r.candidates.find((c) => c.code === '1000000000004');
  assert.equal(np?.signals.brandAgrees, false);
});

test('a non-Canadian product stays reachable rather than being filtered away', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Imported Biscuit' });
  assert.ok(r.candidates.some((c) => c.code === '1000000000005'), 'decision 28 violated');
});

test('a miss is recorded as a gap, and the record is read back rather than assumed', async () => {
  /*
   * This test used to construct the catalogue, run a search, and assert that
   * the catalogue object existed. It was green while proving nothing about the
   * gap it is named for. The gap table is the record; reading it back is the
   * only proof it was kept.
   */
  const log = openGapLog(join(mkdtempSync(join(tmpdir(), 'shin-gap-')), 'gaps.db'));
  const cat = await fixture();
  await cat.search({ text: 'zzzz nonexistent product qqqq' });
  const rows = log.db!.prepare('SELECT query_text, gtin FROM gap').all() as { query_text: string | null; gtin: string | null }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query_text, 'zzzz nonexistent product qqqq');
});

test('a barcode we have never seen is a gap even when the words resolve', async () => {
  /*
   * The camera reads a code and the label gives words. When the words resolved
   * to something plausible the search banded `ambiguous`, nothing was written,
   * and the single most actionable miss the log can hold -- a real product with
   * a real code that is not in the catalogue -- went unlogged. `what-to-price`
   * reads this log.
   */
  const log = openGapLog(join(mkdtempSync(join(tmpdir(), 'shin-gap-')), 'gaps.db'));
  const db = openCatalogue(':memory:');
  db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('9000000000002', 'Navel Oranges', 'Navel Oranges', null, null, null, null, null, '[]', null, '[]', 1, 'test');
  rebuildFts(db);
  rebuildCategories(db);
  const cat = new Catalogue(db, new HashEmbedder());

  const out = await cat.search({ gtin: '9999999999990', text: 'navel oranges' });
  assert.ok(out.candidates.length > 0, 'the words should still resolve; that is the case under test');

  const gaps = log.db!.prepare('SELECT gtin FROM gap WHERE gtin IS NOT NULL').all() as { gtin: string }[];
  assert.equal(gaps.length, 1, 'the unseen barcode was not recorded because the text arm answered');
  assert.equal(gaps[0].gtin, '9999999999990');
});
  // The gap table is the record; reading it back is the only proof it was kept.

test('the ring comes from the best candidate that has a category, not only the leader', async () => {
  // Duplicate listings of the same product are everywhere in the catalogue and
  // only a quarter of rows arrived with a category, so the leader is often an
  // uncategorised twin of a row below it that knows exactly what it is. Reading
  // the leader alone is why a kind of orange we do not stock came back with no
  // other oranges when the catalogue held 367 of them.
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // The twin with no category ranks first on text; the labelled ones follow.
  insert.run('9000000000001', 'Cara cara oranges', 'Cara cara oranges', null, null, null, null, null, '[]', null, '[]', 1, 'test');
  insert.run('9000000000002', 'Navel Oranges', 'Navel Oranges', null, null, null, null, null, JSON.stringify(ORANGE_PATH), 'en:oranges', '[]', 1, 'test');
  insert.run('9000000000003', 'Blood Orange', 'Blood Orange', null, null, null, null, null, JSON.stringify(ORANGE_PATH), 'en:oranges', '[]', 1, 'test');
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name FROM product').all() as { rowid: number; name: string }[];
  const vecs = await embedder.embedPassages(all.map((r) => r.name));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  const cat = new Catalogue(db, embedder);
  const r = await cat.search({ text: 'cara cara oranges' });
  assert.equal(r.candidates[0].code, '9000000000001', 'fixture no longer puts the twin first');
  assert.ok(r.ring, 'the leader had no category, so no ring was drawn');
  assert.equal(r.ring.tag, 'en:oranges');
});

test('a category too big to be a kind of thing is not a ring', async () => {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // One umbrella tag with more members than the ceiling, and nothing narrower.
  for (let i = 0; i < 1200; i += 1) {
    insert.run(`8${String(i).padStart(12, '0')}`, `Thing ${i}`, `Thing ${i}`, null, null, null,
      null, null, '["en:beverages"]', 'en:beverages', '[]', 1, 'test');
  }
  rebuildCategories(db);
  const cat = new Catalogue(db, new HashEmbedder());

  // Three rows from a shelf of 1,200 unrelated things is not "here are other
  // ones like it", it is the app having lost the plot.
  assert.equal(cat.ring(['en:beverages'], 3), null);
});

test('a mixed-case tag whose combined size crosses the cap is skipped by both probes', () => {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Two spellings of the same tag, each under the cap alone (600 < 1000) but
  // over it once rebuildCategories folds them into one row (1200 > 1000).
  // This is the shape the fold is FOR: en:Beverages/en:beverages sat at
  // 2/4,114 in the real catalogue. If the ring's size check (#tagSize) and
  // its membership SELECT ever read different casings of `tag`, this tag
  // would pass the size check on the small half and come back as a
  // 1,200-member "ring" -- the exact failure MAX_RING_TAG exists to stop.
  for (let i = 0; i < 600; i += 1) {
    insert.run(`7${String(i).padStart(12, '0')}`, `Thing ${i}`, `Thing ${i}`, null, null, null,
      null, null, '["en:beverages"]', 'en:beverages', '[]', 1, 'test');
  }
  for (let i = 0; i < 600; i += 1) {
    insert.run(`6${String(i).padStart(12, '0')}`, `Other ${i}`, `Other ${i}`, null, null, null,
      null, null, '["en:Beverages"]', 'en:Beverages', '[]', 1, 'test');
  }
  rebuildCategories(db);
  const cat = new Catalogue(db, new HashEmbedder());

  // A product whose own path carries the capitalised spelling must still be
  // refused a ring here: the fold means there are really 1,200 members, not
  // 600, and no arbitrary three of them are "other beverages".
  assert.equal(cat.ring(['en:Beverages'], 3), null);
});

test('tag labels are readable by a person, first letter capitalised, not every word', () => {
  assert.equal(labelForTag('en:creamy-peanut-butters'), 'Creamy peanut butters');
  assert.equal(labelForTag('fr:oranges-sanguines'), 'Oranges sanguines');
});

test('a stray capital inside a stored tag does not leak into the label', () => {
  // Case is a typo signal in this data, not a presentation choice (522 tags
  // exist under more than one spelling). labelForTag lower-cases before
  // capitalising, so an odd source casing like "En:Snacks-And-Treats" comes
  // out the same as the common spelling would, not title-cased.
  assert.equal(labelForTag('En:Snacks-And-Treats'), 'Snacks and treats');
});

/* ------------------------------------------------------------------------ *
 * Restricting the word arm to named upstream databases.
 * ------------------------------------------------------------------------ */

/**
 * Its own fixture, because the shared one gives every row the source "test",
 * and a filter cannot be observed against a table with one source in it.
 *
 * The shape here is the real one in miniature: a large source of the wrong KIND
 * of thing (appliances) sitting beside a small source of the right kind, and a
 * word that means something in both. In the live catalogue that is 4,972,252
 * icecat rows against 122,154 openfoodfacts rows, and the word is "mixer".
 */
async function twoSourceFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // Six drink mixers and six appliances. Six matters: RETRIEVE_N is larger than
  // the fixture, so if the filter were applied to the RESULT rather than inside
  // the query the drink list could not grow past the four that outranked the
  // appliances. It has to be able to reach the fifth and sixth.
  const drinks = ['Margarita Mixer', 'Bloody Mary Mixer', 'Pina Colada Mixer',
    'Mojito Mixer', 'Daiquiri Mixer', 'Sangria Mixer'];
  const gadgets = ['Stand Mixer', 'Hand Mixer', 'Audio Mixer',
    'Cement Mixer', 'Planetary Mixer', 'Immersion Mixer'];

  let n = 0;
  for (const name of drinks) {
    insert.run(`900000000000${n++}`, name, name, null, 'Bar Co', '750 ml', 750, 'ml',
      '["en:beverages"]', 'en:beverages', '[]', 1, 'drinksdb');
  }
  for (const name of gadgets) {
    insert.run(`900000000000${n++}`, name, name, null, 'Appliance Co', '1 ea', null, null,
      '["en:appliances"]', 'en:appliances', '[]', 1, 'gadgetsdb');
  }
  rebuildFts(db);
  rebuildCategories(db);
  // The embedder is required even though every test below passes vectors:false
  // and never reaches it. Leaving it off still ran green and only the typecheck
  // caught it, which is worth knowing: a passing test here does not prove the
  // fixture is well formed.
  return new Catalogue(db, new HashEmbedder());
}

test('naming sources keeps the word arm inside them', async () => {
  const cat = await twoSourceFixture();

  const whole = await cat.search({ text: 'mixer', vectors: false, limit: 12 });
  const wholeSources = new Set(whole.candidates.map((c) => c.source));
  assert.ok(wholeSources.has('gadgetsdb'), 'unrestricted search should reach the appliances');

  const narrowed = await cat.search({ text: 'mixer', vectors: false, limit: 12, sources: ['drinksdb'] });
  assert.ok(narrowed.candidates.length > 0, 'restricting to a source that has matches returns them');
  for (const c of narrowed.candidates) {
    assert.equal(c.source, 'drinksdb', `${c.name} came from ${c.source}, which was not asked for`);
  }
});

/**
 * The same idea again, but with the wrong source big enough to fill the whole
 * retrieval window. This is the case that decides where the filter has to live,
 * and the smaller fixture above cannot show it: with twelve rows, RETRIEVE_N
 * fetches all of them, so filtering the result and filtering the query give the
 * same answer and either one would look correct. That is how a test passes
 * without testing anything.
 *
 * Seventy appliances all named "Mixer" outrank three long drink names on bm25,
 * so the unrestricted retrieval is appliances the whole way down.
 */
async function drownedFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (let i = 0; i < 70; i += 1) {
    insert.run(`8000000000${String(i).padStart(3, '0')}`, 'Mixer', 'Mixer', null, 'Appliance Co',
      '1 ea', null, null, '["en:appliances"]', 'en:appliances', '[]', 1, 'gadgetsdb');
  }
  const drinks = ['Margarita Cocktail Drink Mixer Bottle', 'Bloody Mary Cocktail Drink Mixer Bottle',
    'Pina Colada Cocktail Drink Mixer Bottle'];
  drinks.forEach((name, i) => {
    insert.run(`900000000${String(i).padStart(4, '0')}`, name, name, null, 'Bar Co', '750 ml', 750,
      'ml', '["en:beverages"]', 'en:beverages', '[]', 1, 'drinksdb');
  });
  rebuildFts(db);
  rebuildCategories(db);
  // The embedder is required even though every test below passes vectors:false
  // and never reaches it. Leaving it off still ran green and only the typecheck
  // caught it, which is worth knowing: a passing test here does not prove the
  // fixture is well formed.
  return new Catalogue(db, new HashEmbedder());
}

test('a source drowned out of the retrieval window is still reachable by naming it', async () => {
  const cat = await drownedFixture();

  const whole = await cat.search({ text: 'mixer', vectors: false, limit: 5 });
  assert.ok(
    whole.candidates.every((c) => c.source === 'gadgetsdb'),
    'the fixture is only interesting if the wrong source really does drown the right one',
  );

  const narrowed = await cat.search({ text: 'mixer', vectors: false, limit: 5, sources: ['drinksdb'] });
  assert.equal(narrowed.candidates.length, 3, 'every drink in the fixture comes back');

  // The whole point, stated as an assertion: filtering the returned list would
  // have produced nothing at all here, because nothing in it was a drink.
  const wholeCodes = new Set(whole.candidates.map((c) => c.code));
  assert.equal(
    narrowed.candidates.filter((c) => !wholeCodes.has(c.code)).length,
    3,
    'all three were absent from the unrestricted result, so post-filtering could not have found them',
  );
});

test('an empty or absent source list means the whole catalogue', async () => {
  const cat = await twoSourceFixture();

  const absent = await cat.search({ text: 'mixer', vectors: false, limit: 12 });
  const empty = await cat.search({ text: 'mixer', vectors: false, limit: 12, sources: [] });
  assert.deepEqual(
    empty.candidates.map((c) => c.code),
    absent.candidates.map((c) => c.code),
    'an empty list is not a filter that matches nothing, it is no filter',
  );
});

test('asking for a source with no match returns a miss, not another source', async () => {
  const cat = await twoSourceFixture();
  const out = await cat.search({ text: 'mixer', vectors: false, sources: ['nosuchdb'] });
  assert.equal(out.candidates.length, 0);
});

test('a row that matched some of the words is never a confident answer, however well it agrees on brand and size', async () => {
  /*
   * `#band` scores how far the leader agrees with what the caller pinned and
   * used to ignore `wordsMatched`. The loose OR pass sets that to `some` when
   * the strict pass found nothing, and it is documented in two files as a
   * signal the band cannot see. With brand and size pinned, a 225 g Kraft
   * ANYTHING alone in agreeing on both read `confident` against a query it
   * matched one word of.
   */
  const db = openCatalogue(':memory:');
  db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('0068100084245', 'Kraft Dinner Original 225 g', 'Kraft Dinner Original 225 g', null, 'Kraft', '225 g', 225, 'g',
      '["en:pasta"]', 'en:pasta', '[]', 1, 'openfoodfacts');
  rebuildFts(db);
  rebuildCategories(db);
  const cat = new Catalogue(db, new HashEmbedder());
  const pins = { brand: 'Kraft', sizeValue: 225, sizeUnit: 'g', vectors: false };

  // "zebra" matches nothing, so strict finds nothing and loose finds the row on
  // "kraft" alone: a one-word match wearing a perfect brand-and-size agreement.
  const partial = await cat.search({ text: 'kraft zebra', ...pins });
  assert.equal(partial.wordsMatched, 'some', 'the fixture no longer produces a subset match');
  assert.equal(partial.candidates[0]?.code, '0068100084245');
  assert.equal(partial.band, 'ambiguous', 'a subset match read as confident');

  // Every word present: the same pins earn the confident band they deserve.
  const full = await cat.search({ text: 'kraft dinner', ...pins });
  assert.equal(full.wordsMatched, 'all');
  assert.equal(full.band, 'confident');
});

/*
 * D-018 and D-019, written from the rows' own examples.
 *
 * The fixture is the live "wireless headphones" answer in miniature. On the
 * real catalogue that query filled slots three to five with a lavalier
 * microphone, a "Florence Wireless Comvo" and an Xbox controller, while the two
 * rows that are BOTH headphones and sold here sat at word ranks 24 and 34 where
 * nothing would ever show them. Here the same shape is built out of headphone
 * ACCESSORIES: ten short rows that say the rare word in the field that scores
 * highest and are not headphones at all, against five rows that are.
 *
 * The two Canadian rows carry no query word in their names, exactly as Jabra's
 * "Evolve 65e Link 370" and AfterShokz's "aeropex" do not. They reach the pool
 * only through the leaf category, which `product_fts` weights at 1.0 against a
 * name's 4.0, which is why they rank where they do.
 *
 * The ring is drawn at `en:headphones` on every one of these searches. Before
 * this fix it was drawn and then thrown away.
 */
const HEADPHONE_PATH = ['en:electronics', 'en:audio', 'en:audio-components', 'en:headphones-headsets', 'en:headphones'];

/** The five rows in the fixture that are headphones, two of them sold here. */
const HEADPHONE_CODES = ['5054903785729', '6931474757357', '0017817861083', '0811071032162', '5706991021974'];

async function headphoneFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const rows: [string, string, string, readonly string[], string | null, number][] = [
    ['5054903785729', 'Headphones P507075', 'Kappa', HEADPHONE_PATH, 'en:headphones', 0],
    ['6931474757357', 'True Stereo Headset EW11', 'hoco', HEADPHONE_PATH, 'en:headphones', 0],
    ['0017817861083', 'Quietcomfort Ultra Earbuds Gen 2', 'Bose', HEADPHONE_PATH, 'en:headphones', 0],
    ['0811071032162', 'Aeropex Bone Conduction Open Ear Sport Bluetooth Titanium Headset for Running and Cycling Lunar Grey', 'AfterShokz', HEADPHONE_PATH, 'en:headphones', 1],
    ['5706991021974', 'Evolve 65e Link 370 MS Unified Communications Certified In Ear Corded Neckband Professional Headset', 'Jabra', HEADPHONE_PATH, 'en:headphones', 1],
  ];
  for (const [code, name, brand, path, leaf, canada] of rows) {
    insert.run(code, name, name, null, brand, null, null, null, JSON.stringify(path), leaf, '[]', canada, 'icecat');
  }

  // Ten accessories. Not headphones, no category, and they own the answer:
  // two-word names carrying the rare word in the highest-weighted field.
  const accessories = ['Splitter', 'Stand', 'Case', 'Cable', 'Pouch', 'Hook', 'Amplifier', 'Cushion', 'Bag', 'Clip'];
  accessories.forEach((thing, i) => {
    insert.run(`600000000000${i}`, `Headphones ${thing}`, `Headphones ${thing}`, null, 'Generic',
      null, null, null, '[]', null, '[]', 0, 'icecat');
  });

  /*
   * More filler, because POOL DEPTH is half of D-019. A preference worth nine
   * rank positions carries a row from the bottom of an eleven-row pool to the
   * top of it and carries it nowhere at all in a pool of sixty, and sixty is
   * what the live "wireless headphones" pool is.
   */
  const other = ['Charger', 'Speaker', 'Doorbell', 'Keyboard', 'Adapter', 'Camera', 'Printer', 'Thermometer'];
  other.forEach((thing, i) => {
    insert.run(`700000000000${i}`, `Wireless ${thing}`, `Wireless ${thing}`, null, 'Generic',
      null, null, null, '[]', null, '[]', 0, 'icecat');
  });

  rebuildFts(db);
  rebuildCategories(db);
  // 95% of the electronics rows in the live catalogue have no vector, so this
  // path is the word arm alone. Every search below passes vectors:false to say so.
  return new Catalogue(db, new HashEmbedder());
}

test('D-018: the ring the search already drew decides what a result is a kind of', async () => {
  const cat = await headphoneFixture();
  const r = await cat.search({ text: 'wireless headphones', limit: 5, vectors: false });

  assert.ok(r.ring, 'the search drew no ring at all, so there was nothing to rank with');
  assert.equal(r.ring.tag, 'en:headphones');

  // A splitter, a stand, a case and a cable are not headphones, and the ring is
  // the field that already knew it.
  const leaked = r.candidates.filter((c) => !HEADPHONE_CODES.includes(c.code)).map((c) => c.name);
  assert.deepEqual(leaked, [], `rows outside the ring outranked rows inside it: ${leaked.join(', ')}`);
});

test('D-019: the Canada preference fires on a pool whose whole top is not Canadian', async () => {
  const cat = await headphoneFixture();
  const r = await cat.search({ text: 'wireless headphones', limit: 5, vectors: false });

  const canadian = r.candidates.filter((c) => c.soldInCanada).map((c) => c.code);
  assert.equal(
    canadian.length,
    2,
    'both Canadian headphone rows should surface, got: ' +
      r.candidates.map((c) => `${c.code}${c.soldInCanada ? ' CA' : ''}`).join(', '),
  );
  // Preferred, never required. Decision 28 asks for a preference, not a filter,
  // and the three non-Canadian headphones are still in the answer.
  assert.ok(r.candidates.some((c) => !c.soldInCanada), 'the preference became a filter');
});

test('D-019: the same product listed three times takes one slot, not three', async () => {
  // "kraft dinner" spent three of six slots on rows all named "Kraft Dinner"
  // with distinct barcodes, no brand and no size. The barcodes differ, so the
  // code alone cannot tell them apart; brand, name and size can.
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insert.run('0068100894332', 'Kraft Dinner', 'Kraft Dinner', null, null, null, null, null, '[]', null, '[]', 1, 'openfoodfacts');
  insert.run('0068100145120', 'Kraft dinner', 'Kraft dinner', null, null, null, null, null, '[]', null, '[]', 1, 'openfoodfacts');
  insert.run('58575857', 'Kraft Dinner', 'Kraft Dinner', null, null, null, null, null, '[]', null, '[]', 1, 'openfoodfacts');
  insert.run('0068100902426', 'Kraft Dinner', 'Kraft Dinner', null, 'Kraft', '4080 g', 4080, 'g', '[]', null, '[]', 1, 'openfoodfacts');
  insert.run('0068100903249', 'Kraft dinner buffalo wings', 'Kraft dinner buffalo wings', null, null, null, null, null, '[]', null, '[]', 1, 'openfoodfacts');
  rebuildFts(db);
  rebuildCategories(db);

  const cat = new Catalogue(db, new HashEmbedder());
  const r = await cat.search({ text: 'kraft dinner', limit: 5, vectors: false });

  const bare = r.candidates.filter((c) => c.brands === null && c.name.toLowerCase() === 'kraft dinner');
  assert.equal(bare.length, 1, `the same unbranded listing came back ${bare.length} times`);

  // Deduping must not eat the rows that are genuinely different products.
  const codes = r.candidates.map((c) => c.code);
  assert.ok(codes.includes('0068100902426'), 'the branded 4080 g box is a different product');
  assert.ok(codes.includes('0068100903249'), 'buffalo wings is a different product');
});

test('a UPC-A row and its EAN-13 twin are one product, not two results', async () => {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // The same barcode published twice: once padded to EAN-13, once as the UPC-A
  // a scanner reports. `byGtin` has treated these as one product since the day
  // it was written; the ranked list did not.
  insert.run('0012345678905', 'Void Elite Wireless Headset', 'Void Elite Wireless Headset', null, 'Corsair', null, null, null, '[]', null, '[]', 0, 'icecat');
  insert.run('12345678905', 'Void Elite Wireless Headset Black', 'Void Elite Wireless Headset Black', null, 'Corsair Gaming', null, null, null, '[]', null, '[]', 0, 'icecat');
  insert.run('0999999999999', 'Wireless Headset Stand', 'Wireless Headset Stand', null, 'Generic', null, null, null, '[]', null, '[]', 0, 'icecat');
  rebuildFts(db);
  rebuildCategories(db);

  const cat = new Catalogue(db, new HashEmbedder());
  const r = await cat.search({ text: 'wireless headset', limit: 5, vectors: false });
  const twins = r.candidates.filter((c) => c.code === '0012345678905' || c.code === '12345678905');
  assert.equal(twins.length, 1, 'the same barcode came back in two forms');
});
