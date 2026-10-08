/**
 * Tests for routing.ts: the fading function, the three safety rules
 * (barcode never restricted, empty restriction falls back, confidence only
 * goes down), and the source/tag narrowing itself.
 *
 * Same house pattern as search.test.ts: a tiny hand-built catalogue with a
 * deterministic stand-in embedder, so what's checked is the LOGIC, not
 * retrieval quality against real data (that is gate 3-6 in the report,
 * against the real catalogue).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, toVecBlob, EMBED_DIM } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { Catalogue } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';
import { decideRoute, restrictedSearch, type Route, type ScanEvent } from '../src/routing.ts';

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

/**
 * A mixed catalogue: a few grocery rows (source openfoodfacts) and a few
 * electronics rows (source icecat) that share vocabulary with a grocery row,
 * so a restriction has something real to prove it filtered.
 */
async function fixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // code, name, brands, quantity, size_value, size_unit, category_path, leaf_category, sold_in_canada, source
  const rows = [
    ['1100000000001', 'Apple Juice', 'Kraft', '1 L', 1000, 'ml', '["en:beverages","en:juices"]', 'en:juices', 1, 'openfoodfacts'],
    ['1100000000002', 'Apple Sauce', 'Kraft', '500 g', 500, 'g', '["en:snacks","en:sauces"]', 'en:sauces', 1, 'openfoodfacts'],
    ['1100000000003', 'Apple MacBook Charger', 'Apple', '1 ea', null, null, '["en:computers-peripherals","en:chargers"]', 'en:chargers', 1, 'icecat'],
    ['1100000000004', 'Apple Watch Band', 'Apple', '1 ea', null, null, '["en:computers-peripherals","en:accessories"]', 'en:accessories', 1, 'icecat'],
    ['1100000000005', 'Fresh Oranges', null, '1 kg', 1000, 'g', '["en:fruits","en:fresh-oranges"]', 'en:fresh-oranges', 1, 'openfoodfacts'],
  ];

  for (const r of rows) {
    insert.run(r[0], r[1], r[1], null, r[2], r[3], r[4], r[5], r[6], r[7], '[]', r[8], r[9]);
  }
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as unknown as {
    rowid: number;
    name: string;
    brands: string | null;
  }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  return new Catalogue(db, embedder);
}

// --- decideRoute: the fading function ---------------------------------

test('no setup answer and no history routes to everything at confidence 0', () => {
  const route = decideRoute({});
  assert.equal(route.categories.length, 5);
  assert.equal(route.confidence, 0);
});

test('a setup answer alone is enough to restrict', () => {
  const route = decideRoute({ setupAnswer: 'grocery' });
  assert.deepEqual(route.categories, ['grocery']);
  assert.ok(route.confidence >= 0.6, `expected confidence >= 0.6, got ${route.confidence}`);
});

test('one contrary scan does not flip a setup answer', () => {
  const history: ScanEvent[] = [{ category: 'tech' }];
  const route = decideRoute({ setupAnswer: 'grocery', history });
  assert.deepEqual(route.categories, ['grocery']);
});

test('nine scans of a different category outweigh the setup answer (the brief\'s own example)', () => {
  const history: ScanEvent[] = Array.from({ length: 9 }, () => ({ category: 'tech' as const }));
  const route = decideRoute({ setupAnswer: 'grocery', history });
  assert.deepEqual(route.categories, ['tech'], 'nine laptops should stop being routed as a grocery shopper');
});

test('a few contrary scans (not yet nine) are not enough to act on, so it searches everything', () => {
  const history: ScanEvent[] = Array.from({ length: 3 }, () => ({ category: 'tech' as const }));
  const route = decideRoute({ setupAnswer: 'grocery', history });
  assert.equal(route.categories.length, 5, 'weak, ambiguous evidence should not narrow the search');
});

// --- restrictedSearch: the safety rules --------------------------------

test('a barcode is never restricted, even when routed hard to another category', async () => {
  const cat = await fixture();
  const route = decideRoute({ setupAnswer: 'grocery', history: Array.from({ length: 9 }, () => ({ category: 'grocery' as const })) });
  assert.deepEqual(route.categories, ['grocery']);

  // A real electronics barcode, routed hard to grocery.
  const routed = await restrictedSearch(cat, { gtin: '1100000000003' }, route);
  assert.equal(routed.restricted, false);
  assert.equal(routed.confidenceAdjustment, 1);
  assert.equal(routed.result.matchedBy, 'gtin');
  assert.equal(routed.result.candidates[0]?.code, '1100000000003');
});

test('a route to everything never restricts', async () => {
  const cat = await fixture();
  const everything = decideRoute({});
  const routed = await restrictedSearch(cat, { text: 'apple', limit: 5 }, everything);
  assert.equal(routed.restricted, false);
  assert.equal(routed.confidenceAdjustment, 1);
});

test('a grocery route narrows an ambiguous text query to grocery rows', async () => {
  const cat = await fixture();
  const route = decideRoute({ setupAnswer: 'grocery' });
  const routed = await restrictedSearch(cat, { text: 'apple', limit: 5 }, route);

  assert.ok(routed.result.candidates.length > 0, 'expected at least one grocery candidate for "apple"');
  for (const c of routed.result.candidates) {
    assert.equal(c.source, 'openfoodfacts', `expected only grocery rows, got source ${c.source}`);
  }
});

test('a restricted search that would find nothing falls back to the whole catalogue', async () => {
  const cat = await fixture();
  // "MacBook Charger" only exists under icecat; routing hard to grocery must
  // still find it via the fallback rather than reporting a miss.
  const route = decideRoute({ setupAnswer: 'grocery', history: Array.from({ length: 9 }, () => ({ category: 'grocery' as const })) });
  assert.deepEqual(route.categories, ['grocery']);

  // Vectors off: this fixture has only five rows, so a k=60 KNN would return
  // all of them regardless of relevance and mask the fallback this test is
  // proving. Real-catalogue behaviour is proven separately, against the real
  // catalogue, in the report.
  const routed = await restrictedSearch(cat, { text: 'MacBook Charger', limit: 5, vectors: false }, route);
  assert.equal(routed.restricted, false);
  assert.equal(routed.fellBack, true);
  assert.equal(routed.confidenceAdjustment, 1);
  assert.ok(
    routed.result.candidates.some((c) => c.code === '1100000000003'),
    'the grocery-restricted search must still surface the electronics row via fallback',
  );
});

test('confidence adjustment is below 1 only when a restriction actually narrowed the result', async () => {
  const cat = await fixture();
  const grocery = decideRoute({ setupAnswer: 'grocery' });
  const everything = decideRoute({});

  const routedRestricted = await restrictedSearch(cat, { text: 'apple', limit: 5 }, grocery);
  const routedUnrestricted = await restrictedSearch(cat, { text: 'apple', limit: 5 }, everything);

  assert.ok(routedRestricted.confidenceAdjustment < 1, 'a routed, narrowed search should carry a downward adjustment');
  assert.equal(routedUnrestricted.confidenceAdjustment, 1, 'an unrouted search should carry no adjustment');
});

test('produce is recognised by tag even though it shares a source with grocery', async () => {
  const cat = await fixture();
  const route = decideRoute({ setupAnswer: 'produce' });
  assert.deepEqual(route.categories, ['produce']);

  const routed = await restrictedSearch(cat, { text: 'fresh oranges', limit: 5 }, route);
  assert.ok(routed.result.candidates.length > 0, 'expected the fresh-tagged row to be found');
  assert.ok(
    routed.result.candidates.every((c) => c.leafCategory === 'en:fresh-oranges'),
    'produce route should only keep the produce-tagged row',
  );
});

test('a route to "used" alone always falls back, since the catalogue carries no signal for it', async () => {
  const cat = await fixture();
  const route = decideRoute({ setupAnswer: 'used' });
  assert.deepEqual(route.categories, ['used']);

  const routed = await restrictedSearch(cat, { text: 'apple', limit: 5 }, route);
  assert.equal(routed.restricted, false);
  assert.equal(routed.fellBack, true);
  assert.ok(routed.result.candidates.length > 0);
});

// --- narrowing the query, not just the result -------------------------

/**
 * The case the old result-only narrowing could not survive, in miniature.
 *
 * Seventy electronics rows named "Apple" outrank two grocery rows on bm25 and
 * fill the entire 60-row retrieval window, which is the shape of the real
 * catalogue: 4,972,252 of 5,182,591 rows are electronics. Filtering that pool
 * down to grocery leaves nothing, and the old code then fell back to the whole
 * catalogue and handed the shopper the chargers it was trying to avoid.
 */
async function drownedFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (let i = 0; i < 70; i += 1) {
    insert.run(`120000000${String(i).padStart(4, '0')}`, 'Apple', 'Apple', null, 'Apple', '1 ea',
      null, null, '["en:computers-peripherals","en:accessories"]', 'en:accessories', '[]', 1, 'icecat');
  }
  // One electronics row carrying a word no grocery row has, so a grocery route
  // can be made to find genuinely nothing and take the fallback.
  insert.run('1200000000999', 'Thunderbolt Dock', 'Thunderbolt Dock', null, 'Apple', '1 ea',
    null, null, '["en:computers-peripherals","en:accessories"]', 'en:accessories', '[]', 1, 'icecat');

  const groceries: [string, string][] = [
    ['1300000000001', 'Apple Juice Concentrate Bottle Drink'],
    ['1300000000002', 'Apple Sauce Unsweetened Jar Snack'],
  ];
  for (const [code, name] of groceries) {
    insert.run(code, name, name, null, 'Kraft', '1 L', 1000, 'ml',
      '["en:beverages","en:juices"]', 'en:juices', '[]', 1, 'openfoodfacts');
  }
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as unknown as {
    rowid: number; name: string; brands: string | null;
  }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  return new Catalogue(db, embedder);
}

const GROCERY_ROUTE: Route = { categories: ['grocery'], confidence: 1, why: 'test' };

test('a grocery route reaches rows the electronics rows had crowded out of the pool', async () => {
  const catalogue = await drownedFixture();

  // The premise: unrestricted, the shopper sees nothing but chargers.
  const unrestricted = await catalogue.search({ text: 'apple', vectors: false, limit: 5 });
  assert.ok(
    unrestricted.candidates.every((c) => c.source === 'icecat'),
    'the fixture only tests anything if the electronics really do drown the grocery rows',
  );

  const out = await restrictedSearch(catalogue, { text: 'apple', vectors: false, limit: 5 }, GROCERY_ROUTE);
  assert.equal(out.restricted, true);
  assert.equal(out.fellBack, false);
  assert.ok(out.result.candidates.length > 0, 'the grocery rows are reachable by naming the source');
  for (const c of out.result.candidates) {
    assert.equal(c.source, 'openfoodfacts', `${c.name} is not grocery`);
  }
});

test('the whole-catalogue fallback is genuinely unrestricted, not the narrowed pool relabelled', async () => {
  // The bug this guards: once the query itself is narrowed, reusing the pool
  // for the fallback returns a narrowed list while reporting restricted:false
  // and no confidence penalty. A narrowed answer wearing an unnarrowed label is
  // worse than either behaviour on its own, because the caller cannot tell.
  const catalogue = await drownedFixture();

  // "thunderbolt" exists only in an electronics row, so a grocery route narrows
  // the query, retrieves nothing at all, and has to fall back. Reusing the
  // narrowed pool would hand back an empty list here and call it a miss.
  const out = await restrictedSearch(catalogue, { text: 'thunderbolt', vectors: false, limit: 3 }, GROCERY_ROUTE);

  assert.ok(out.result.candidates.length > 0, 'the fallback found the row the narrowed query could not see');
  assert.equal(out.result.candidates[0]?.source, 'icecat');
  assert.equal(out.restricted, false, 'nothing survived the restriction, so this answer is not a restricted one');
  assert.equal(out.fellBack, true);
  assert.equal(out.confidenceAdjustment, 1, 'a fallback answer carries no restriction penalty');
});

test('a route with produce in it is never narrowed by source, because produce hides inside other sources', async () => {
  // sourcesForRoute returns undefined for any route carrying produce,
  // furniture or used. If it did not, the tag check downstream would be looking
  // for rows the query had already thrown away.
  const catalogue = await fixture();
  const out = await restrictedSearch(
    catalogue,
    { text: 'oranges', vectors: false, limit: 5 },
    { categories: ['produce'], confidence: 1, why: 'test' },
  );
  assert.ok(out.result.candidates.length > 0, 'the produce row is still reachable');
  assert.equal(out.result.candidates[0]?.source, 'openfoodfacts');
});

test('a caller that names its own sources keeps them, routing does not overwrite', async () => {
  const catalogue = await fixture();
  const out = await restrictedSearch(
    catalogue,
    { text: 'apple', vectors: false, limit: 5, sources: ['icecat'] },
    GROCERY_ROUTE,
  );
  // The route says grocery, the caller said icecat. The caller wins on
  // retrieval; the route's own category filter then runs on top, finds no
  // grocery row among the electronics, and falls back rather than inventing one.
  assert.equal(out.restricted, false);
  assert.equal(out.fellBack, true);
});

/**
 * The plan's own test for this lane is that a shopper flagged as buying
 * groceries can still find a laptop. "laptop" always passed it, because it
 * matches nothing in grocery and fell back. "macbook pro" failed it, because it
 * matched SOMETHING: the word "pro" is a real grocery word, so a restricted
 * search returned PROTEIN2O and reported it as a legitimate hit carrying only a
 * 0.85 penalty. A bad narrowed answer is not an empty one, and the fallback
 * used to fire only on empty.
 */
async function twoWordFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // Grocery rows carrying ONE of the two words a shopper types, and never both.
  const groceries = ['Protein Pro Shake', 'Pro Whey Powder', 'Chocolate Mouse Cake', 'Mini Mouse Biscuit'];
  groceries.forEach((name, i) => {
    insert.run(`140000000${String(i).padStart(4, '0')}`, name, name, null, 'Bar Co', '500 g', 500, 'g',
      '["en:snacks"]', 'en:snacks', '[]', 1, 'openfoodfacts');
  });
  // The rows the shopper actually meant, in the source a grocery route excludes.
  const gadgets = ['Macbook Pro Laptop', 'Wireless Mouse Receiver'];
  gadgets.forEach((name, i) => {
    insert.run(`150000000${String(i).padStart(4, '0')}`, name, name, null, 'Apple', '1 ea', null, null,
      '["en:computers-peripherals"]', 'en:accessories', '[]', 1, 'icecat');
  });
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as unknown as {
    rowid: number; name: string; brands: string | null;
  }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  return new Catalogue(db, embedder);
}

test('a grocery route that matched only some of the words falls back instead of answering', async () => {
  const catalogue = await twoWordFixture();

  for (const text of ['macbook pro', 'wireless mouse']) {
    const out = await restrictedSearch(catalogue, { text, vectors: false, limit: 3 }, GROCERY_ROUTE);
    assert.equal(out.restricted, false, `"${text}" was answered as a restricted hit`);
    assert.equal(out.fellBack, true, `"${text}" did not fall back`);
    assert.ok(out.result.candidates.length > 0, `"${text}" returned nothing at all`);
    assert.equal(
      out.result.candidates[0]?.source,
      'icecat',
      `"${text}" led with a grocery row that matched only one of the two words`,
    );
  }
});

test('matching every word keeps a narrowed answer narrowed', async () => {
  // The other side of the same rule: it must not send genuine grocery hits to
  // the fallback. Without this, "words matched" would look like a fix while
  // quietly turning restriction off.
  const catalogue = await twoWordFixture();
  const out = await restrictedSearch(catalogue, { text: 'pro whey', vectors: false, limit: 3 }, GROCERY_ROUTE);
  assert.equal(out.restricted, true, 'both words are present in a grocery row, so this is a real restricted hit');
  assert.equal(out.fellBack, false);
  assert.equal(out.result.candidates[0]?.source, 'openfoodfacts');
});

test('a one-word query is never treated as a partial match', async () => {
  // One word means the strict and loose passes are the same search, so
  // wordsMatched is 'n/a' and the fallback must not fire on it. Reporting
  // 'some' here would send every one-word grocery query to the whole catalogue.
  const catalogue = await twoWordFixture();
  const out = await restrictedSearch(catalogue, { text: 'chocolate', vectors: false, limit: 3 }, GROCERY_ROUTE);
  assert.equal(out.result.wordsMatched, 'n/a');
  assert.equal(out.restricted, true, 'a one-word grocery query still gets a restricted answer');
  assert.equal(out.result.candidates[0]?.source, 'openfoodfacts');
});

test('a restricted result carries no ring, because the pool ring was drawn at the wrong row', async () => {
  /*
   * The ring is the field a "not this?" list renders as its heading, and it was
   * inherited from the unrestricted pool -- drawn at the POOL leader's category,
   * which the route may have just filtered away. `band` gets a downgrade at the
   * callers; nothing compensated for `ring`, and this function cannot recompute
   * it against a duck-typed catalogue. Null is a screen with no neighbour
   * heading; the inherited value was a heading that lied.
   *
   * THE ROUTE HAS TO BE ONE STAGE 1 CANNOT NARROW BY SOURCE. A grocery route
   * narrows the QUERY to openfoodfacts, so the pool is already grocery-only and
   * its ring is honestly null -- two earlier versions of this test used grocery
   * and passed with the defect restored. Produce and furniture live inside other
   * sources and are filtered by tag over a whole-catalogue pool, which is where
   * the pool leader and the kept rows can disagree.
   */
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Two chargers under one leaf, so the pool leader has a sibling and a ring is
  // drawn at `en:chargers`; one produce row the route will keep.
  insert.run('2200000000001', 'Apple MagSafe Charger', 'Apple MagSafe Charger', null, 'Apple', '1 ea', null, null,
    '["en:computers-peripherals","en:chargers"]', 'en:chargers', '[]', 1, 'icecat');
  insert.run('2200000000002', 'Apple USB-C Charger 20 W', 'Apple USB-C Charger 20 W', null, 'Apple', '1 ea', null, null,
    '["en:computers-peripherals","en:chargers"]', 'en:chargers', '[]', 1, 'icecat');
  insert.run('2200000000003', 'Fresh Apples 1 kg', 'Fresh Apples 1 kg', null, null, '1 kg', 1000, 'g',
    '["en:fruits","en:fresh-apples"]', 'en:fresh-apples', '[]', 1, 'openfoodfacts');
  rebuildFts(db);
  rebuildCategories(db);
  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as unknown as { rowid: number; name: string; brands: string | null }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));
  const cat = new Catalogue(db, embedder);

  // Precondition: the whole-catalogue search draws a ring. If this fails the
  // fixture no longer produces one and the assertions below prove nothing.
  const wide = await restrictedSearch(cat, { text: 'apple', limit: 5 }, decideRoute({}));
  assert.equal(wide.restricted, false);
  assert.notEqual(wide.result.ring, null, 'the unrestricted search drew no ring, so this fixture cannot test inheritance');

  // Routed to produce: stage 1 cannot narrow by source, so the pool is the
  // whole catalogue with a charger on top; stage 2 keeps only the apples. The
  // ring drawn at the chargers' tag must not survive onto them.
  const routed = await restrictedSearch(cat, { text: 'apple', limit: 5 }, decideRoute({ setupAnswer: 'produce' }));
  assert.equal(routed.restricted, true, 'the produce route did not narrow; the fixture needs a produce row matching "apple"');
  assert.ok(routed.result.candidates.every((c) => c.code === '2200000000003'));
  assert.equal(routed.result.ring, null);
});
