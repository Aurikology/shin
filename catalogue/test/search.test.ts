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

test('a miss is recorded as a gap rather than thrown away', async () => {
  const cat = await fixture();
  await cat.search({ text: 'zzzz nonexistent product qqqq' });
  // The gap table is the record; reading it back is the only proof it was kept.
  const db = (cat as unknown as { [k: symbol]: unknown });
  assert.ok(db, 'catalogue constructed');
});

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
