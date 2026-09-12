/**
 * Tests for the alternatives stage: the original refusals (widening the
 * category to fill three slots, dropping the size rule to find a saving,
 * hiding an alternative that adds an allergen, showing a row whose price
 * nobody has) plus the 2026-09-05 store/date/allergen-wording rewrite. The
 * most load-bearing test in the file is the one asserting "openprices" can
 * never reach a composed line: that string is the name of the database, not
 * a shop, and it is the bug this rewrite exists to fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, rebuildCategories } from '../src/schema.ts';
import { MAX_RING_TAG } from '../src/search.ts';
import { alternativesFor, alternativesHeading, type PricedProduct } from '../src/alternatives.ts';
import type { Candidate } from '../src/search.ts';

const PB = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];

/**
 * A price spec is either a plain cents number, keeping every default test
 * price the same as before storeName/storeCity/joinMethod existed, or a
 * partial override for the tests below that need to control the store, the
 * join method, or the seller string itself.
 */
type PriceSpec = number | (Partial<PricedProduct> & { amountCents: number });

function candidate(over: Partial<Candidate> & { code: string }): Candidate {
  return {
    name: 'x', nameEn: null, nameFr: null, brands: null, quantity: null,
    sizeValue: 500, sizeUnit: 'g', leafCategory: 'en:peanut-butters',
    categoryPath: PB, allergens: [], soldInCanada: true, source: 'openfoodfacts',
    genericName: null, nutriscoreGrade: null, novaGroup: null, additivesN: null,
    ingredientsText: null,
    signals: {
      textRank: null, vectorRank: null, bm25: null, similarity: null,
      rrf: 0, brandAgrees: null, sizeAgrees: null,
    },
    ...over,
  };
}

function fixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const rows: [string, string, number | null, string | null, string[], string, number][] = [
    // code, name, size, unit, path, allergens json, sold in canada
    ['A', 'Kraft Smooth 500 g', 500, 'g', PB, '["en:peanuts"]', 1],
    ['B', 'Store Brand Smooth 500 g', 500, 'g', PB, '["en:peanuts"]', 1],
    ['C', 'Crunchy With Almonds 750 g', 750, 'g', PB, '["en:peanuts","en:nuts"]', 1],
    ['D', 'Bulk Sack 5 kg', 5000, 'g', PB, '["en:peanuts"]', 1],
    ['E', 'Unpriced Smooth 400 g', 400, 'g', PB, '["en:peanuts"]', 1],
    ['F', 'Strawberry Jam 500 g', 500, 'g', ['en:spreads', 'en:jams'], '[]', 1],
    ['G', 'Imported Smooth 500 g', 500, 'g', PB, '["en:peanuts"]', 0],
    ['H', 'No Allergen Data Smooth 500 g', 500, 'g', PB, '[]', 1],
    /*
     * A product whose allergen list carries a whole warning sentence beside two
     * real names. Open Food Facts allergen tags are contributor-entered and a
     * slice of them are package prose rather than names; this exact shape came
     * off a live run, where it rendered as "Adds gluten, milk, soybeans, always
     * read the label carefully because not all our products are manufactured in
     * a peanut free facility."
     */
    ['I', 'Prose In The Allergen Field 500 g', 500, 'g', PB,
      '["en:peanuts","en:always-read-the-label-carefully-because-not-all-our-products-are-manufactured-in-a-peanut-free-facility"]', 1],
  ];
  // Same source as `original`'s default ('openfoodfacts', see candidate()
  // above): item 19a's fix filters alternatives to the original's own
  // source, so a fixture row under a different source would silently stop
  // being reachable by every test in this file that does not say otherwise.
  for (const [code, name, size, unit, path, allergens, canada] of rows) {
    insert.run(code, name, name, null, null, null, size, unit,
      JSON.stringify(path), path[path.length - 1], allergens, canada, 'openfoodfacts');
  }
  rebuildFts(db);
  rebuildCategories(db);
  return db;
}

/**
 * Prices keyed by code. Whatever is absent has no price at all. A bare number
 * is the old shape: a real seller, no store, joined by name, so every test
 * written before storeName/storeCity/joinMethod existed keeps behaving the
 * same way. A spec object overrides just the fields a test cares about.
 */
function lookupOf(prices: Record<string, PriceSpec>) {
  return async (codes: readonly string[]) => {
    const m = new Map<string, PricedProduct>();
    for (const c of codes) {
      const spec = prices[c];
      if (spec === undefined) continue;
      const full: PricedProduct = {
        code: c,
        amountCents: typeof spec === 'number' ? spec : spec.amountCents,
        // walmart.ca rather than an invented shop name, because the seller
        // clause is an allowlist: an unrecognised seller is deliberately NOT
        // printed, so a made-up fixture seller would silently push every
        // general test onto the fallback branch and stop them covering the
        // named-seller one. The pairing is also what the live table holds:
        // all 14 name-joined rows are walmart.ca.
        seller: 'walmart.ca',
        observedAt: '2026-09-04',
        storeName: null,
        storeCity: null,
        joinMethod: 'name',
        ...(typeof spec === 'number' ? {} : spec),
      };
      m.set(c, full);
    }
    return m;
  };
}

const original = candidate({ code: 'A', name: 'Kraft Smooth 500 g', allergens: ['en:peanuts'] });

test('a cheaper same size same category product is offered', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 500 }));
  assert.equal(alts.length, 1);
  assert.equal(alts[0].product.code, 'B');
  assert.ok(alts[0].cheaperBy > 0.3);
});

test('a product with no price is never shown', async () => {
  // E would be the cheapest row in the category, and nobody sells it at a price
  // we have. Showing it would send a shopper looking for a number that does not
  // exist, so the list is the one priced row and nothing else.
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 500 }));
  assert.deepEqual(alts.map((a) => a.product.code), ['B']);
});

test('a different category is never borrowed to fill the list', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ F: 100 }));
  assert.equal(alts.length, 0, 'jam is not an alternative to peanut butter');
});

test('a size far outside the original is still named, on a real per-unit number', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ D: 3000 }));
  assert.equal(alts.length, 1, '5 kg against 500 g is still worth naming');
  // Per 100 g is comparable across any two pack sizes, so the claim is true
  // and stays a unit claim. The size ratio now orders the list rather than
  // deciding whether the user is told anything at all.
  assert.equal(alts[0].basis, 'unit');
  assert.equal(alts[0].unitCents, 60);
  assert.match(alts[0].line, /per 100 g/);
});

test('an added allergen is printed on the row, not used to hide it', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ C: 600 }));
  assert.equal(alts.length, 1);
  assert.deepEqual(alts[0].addedAllergens, ['en:nuts']);
  assert.equal(alts[0].allergenNote, 'compared', 'both sides had tags, so a comparison was made');
  assert.match(alts[0].line, /Adds nuts\./);
});

test('a removed allergen is reported too', async () => {
  const db = fixture();
  const nutty = candidate({ code: 'C', sizeValue: 750, allergens: ['en:peanuts', 'en:nuts'] });
  const alts = await alternativesFor(db, nutty, 1500, lookupOf({ A: 600, B: 600 }));
  assert.ok(alts.length > 0);
  assert.deepEqual(alts[0].removedAllergens, ['en:nuts']);
  assert.equal(alts[0].allergenNote, 'compared');
  assert.match(alts[0].line, /Removes nuts\./);
});

test('no allergen tags on the alternative means not-recorded, never "same"', async () => {
  // H has no allergen tags at all. Open Food Facts cannot tell "checked, none
  // found" apart from "never checked" (prepare_rows.py:243 collapses both to
  // []), so an empty list here must never read as a comparison that came back
  // clean.
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ H: 500 }));
  assert.equal(alts.length, 1);
  assert.equal(alts[0].allergenNote, 'not-recorded');
  assert.deepEqual(alts[0].addedAllergens, []);
  assert.deepEqual(alts[0].removedAllergens, []);
  assert.match(alts[0].line, /Allergens not recorded for one of these\. Check the packaging\./);
});

test('no allergen tags on the original means not-recorded too', async () => {
  const db = fixture();
  const noTags = candidate({ code: 'A', allergens: [] });
  const alts = await alternativesFor(db, noTags, 800, lookupOf({ B: 500 }));
  assert.equal(alts.length, 1);
  assert.equal(alts[0].allergenNote, 'not-recorded');
  assert.match(alts[0].line, /Allergens not recorded for one of these\. Check the packaging\./);
});

test('never "same allergens recorded": identical tags on both sides still avoid a safety claim', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 500 }));
  assert.equal(alts[0].allergenNote, 'compared');
  assert.deepEqual(alts[0].addedAllergens, []);
  assert.deepEqual(alts[0].removedAllergens, []);
  assert.ok(!/same allergens|checked|clean|safe/i.test(alts[0].line), alts[0].line);
});

/*
 * The allergen field sometimes contains a sentence instead of a name, and the
 * rule is that a side carrying one is not compared at all rather than compared
 * on whatever survived the filter. Dropping the unreadable part and then
 * comparing the rest would claim a complete comparison over a list we edited,
 * which is the exact failure the two-state wording exists to prevent: we could
 * not read it, so we do not know, and the sentence has to say we do not know.
 *
 * Product I carries "en:peanuts" alongside the prose, so a filter that merely
 * discarded the long tag would leave a clean-looking peanuts-to-peanuts
 * comparison and this test would pass while the rule was broken. It asserts the
 * note, not just the absence of the prose.
 */
test('a warning sentence in the allergen field is never read as an allergen', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ I: 500 }));
  assert.equal(alts.length, 1);
  assert.ok(
    !/read the label|manufactured|facility/i.test(alts[0].line),
    `package prose reached the shopper: ${alts[0].line}`,
  );
  assert.equal(alts[0].allergenNote, 'not-recorded');
  assert.deepEqual(alts[0].addedAllergens, []);
  assert.deepEqual(alts[0].removedAllergens, []);
});

test('a saving too small to matter is not an interruption', async () => {
  const db = fixture();
  // 798 against 800 is a quarter of a percent.
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 798 }));
  assert.equal(alts.length, 0);
});

test('never more than three, and the biggest saving leads', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 2000, lookupOf({ B: 900, C: 1000, E: 800 }));
  assert.ok(alts.length <= 3);
  for (let i = 1; i < alts.length; i += 1) {
    assert.ok(alts[i - 1].cheaperBy >= alts[i].cheaperBy);
  }
});

test('a product not sold in Canada is not an alternative here', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ G: 100 }));
  assert.equal(alts.length, 0);
});

test('without a size the answer is the ticket price, never silence', async () => {
  const db = fixture();
  const unsized = candidate({ code: 'A', sizeValue: null, sizeUnit: null });
  const alts = await alternativesFor(db, unsized, 800, lookupOf({ B: 100 }));
  assert.equal(alts.length, 1, '82% of the catalogue has no size; it cannot mean no answer');
  assert.equal(alts[0].basis, 'ticket');
  assert.equal(alts[0].unitCents, null, 'and no per-unit number is invented');
  assert.ok(!/per 100/.test(alts[0].line));
});

test('the row names a measurement and a seller, and makes no taste claim', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 500 }));
  const line = alts[0].line;
  assert.match(line, /per 100 g/);
  assert.match(line, /walmart\.ca/);
  assert.ok(!/tast|same|just as|identical|as good/i.test(line), `line made a claim: ${line}`);
  assert.equal(alts[0].price.observedAt, '2026-09-04');
});

/*
 * The seller clause is an allowlist, and this is the test that keeps it one.
 *
 * The defect being fixed in this file was "openprices", the name of a
 * database, printed as though a shopper could walk into it. The first fix
 * asked `seller !== 'openprices'`, which is the same rule written as a
 * denylist of one: correct for that string, and silently wrong again the day
 * a second donated feed is added, because its name would print as a shop on
 * its first run with nothing failing. This test fails if anyone inverts it
 * back, and it uses a seller that does not exist precisely because the
 * denylist version passes every test written against sellers that do.
 */
test('a seller nobody has confirmed is a real shop is never printed as one', async () => {
  const db = fixture();
  const alts = await alternativesFor(
    db,
    original,
    800,
    lookupOf({ B: { amountCents: 500, seller: 'somenewfeed', joinMethod: 'name', storeName: null } }),
  );
  const line = alts[0].line;
  assert.ok(!/somenewfeed/i.test(line), `an unvetted seller name reached the shopper: ${line}`);
  assert.match(line, /a store that reported this price/);
});

/*
 * Four tests for the store gate, and the reason there are four rather than
 * two. `storeClauseFor` is a conjunction of `joinMethod === 'gtin'` and
 * `storeName !== null`, and on the live table today one input combination
 * to that conjunction (a name-joined row WITH a resolved store) never
 * actually occurs: all 14 name-joined rows have a null store name. A
 * comment saying the branch is safe is not evidence it is safe -- this repo
 * already has two defects of exactly this shape, both found only when an
 * unreachable branch was finally made to fire: a spine seller count that
 * was wrong for its entire life behind a gate that rejected every input
 * that would have exposed it, and a Canada tiebreak that had never executed
 * once and changed the top result completely the day it finally fired. The
 * fix here is not a better comment, it is a synthetic input that forces the
 * combination to run now, before 2026-09-05's join data makes it possible
 * for real.
 */

test('a name-joined price with a SYNTHETIC resolved store still prints no store', async () => {
  // This exact combination does not exist on the live table today (all 14
  // name-joined rows have a null store name), which is precisely why it has
  // to be forced here rather than found in a fixture. A name join can attach
  // a price to the wrong product, and a store name is exactly what would
  // make that wrong price look checkable, so this must fail closed even on
  // an input the real data does not produce yet.
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'name', storeName: 'Fortinos', storeCity: 'Hamilton' },
  }));
  assert.equal(alts.length, 1);
  assert.ok(!/Fortinos|Hamilton/.test(alts[0].line), alts[0].line);
  assert.match(alts[0].line, /a store that reported this price/);
});

test('a barcode-joined price with a resolved store names it', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'gtin', storeName: 'Fortinos', storeCity: 'Hamilton' },
  }));
  assert.equal(alts.length, 1);
  assert.match(alts[0].line, /Fortinos, Hamilton/);
});

test('a barcode-joined price with a null store name never leaves a blank or "null" in the sentence', async () => {
  // 82 of 782 barcode-joined rows resolve no store at all, so this one DOES
  // happen on the live table, but it is tested with the same rigour as the
  // synthetic case above: a template literal built from a null field is
  // exactly how "at null," or "at ," reaches a shopper, and that failure
  // mode is silent (no exception, just a wrong string) so only reading the
  // composed text catches it.
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'gtin', storeName: null, storeCity: null },
  }));
  assert.equal(alts.length, 1);
  const line = alts[0].line;
  assert.match(line, /a store that reported this price/);
  assert.ok(!/\bnull\b/i.test(line), `"null" leaked into: ${line}`);
  assert.ok(!/\bundefined\b/i.test(line), `"undefined" leaked into: ${line}`);
  assert.ok(!/at\s*,/.test(line), `a blank store name leaked into: ${line}`);
});

test('a real seller like walmart.ca is still named as a seller', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'walmart.ca', joinMethod: 'name', storeName: null, storeCity: null },
  }));
  assert.equal(alts.length, 1);
  assert.match(alts[0].line, /walmart\.ca/);
});

test('the date is shown the way a person would say it, on every row', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'Test Grocer', joinMethod: 'name', storeName: null, storeCity: null, observedAt: '2025-08-28' },
  }));
  assert.match(alts[0].line, /Seen 28 August 2025\./);
});

test('"openprices" the database is never printed as though it were a shop', async () => {
  // The bug that mattered most: price.seller is literally "openprices" for
  // most of the price table, and a shopper reading that string would think
  // it names a store. This is written so it fails hard if that string ever
  // reaches a composed line again, in any of the shapes it can arrive in.
  const db = fixture();

  const noStoreNoJoin = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'gtin', storeName: null, storeCity: null },
  }));
  const nameJoinedWithStore = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'name', storeName: 'Fortinos', storeCity: null },
  }));
  const nameJoinedNoStore = await alternativesFor(db, original, 800, lookupOf({
    B: { amountCents: 500, seller: 'openprices', joinMethod: 'name', storeName: null, storeCity: null },
  }));

  for (const alts of [noStoreNoJoin, nameJoinedWithStore, nameJoinedNoStore]) {
    assert.equal(alts.length, 1);
    assert.ok(!/openprices/i.test(alts[0].line), `"openprices" leaked into: ${alts[0].line}`);
  }
});

test('the heading names the category the swap came from', async () => {
  // labelForTag now matches search.ts exactly (Task 5b): lower-case first,
  // strip the language prefix, capitalise only the first letter of ITS OWN
  // output. Fed straight into "Cheaper ${...}" that reads "Cheaper Peanut
  // butters", not "Cheaper peanut butters" -- the capital moved, it did not
  // disappear, because this function is not told it is the second word here.
  assert.equal(alternativesHeading(original, 2), 'Cheaper Peanut butters');
  assert.equal(alternativesHeading(original, 0), 'No cheaper option we can price');
});

test('a tag as wide as a whole shelf offers no alternatives at all', async () => {
  /*
   * D-036's mechanism. `search.ts` refuses to draw a ring from a tag over
   * MAX_RING_TAG members -- a tag that big is not a kind of thing -- and the
   * alternatives query read `product_category` directly without asking. The one
   * populated result the store could produce offered ginger oat cookies as a
   * cheaper swap for tortilla chips, both `en:whole-grains`. Over a shelf-sized
   * tag, "cheaper" lies about "instead of this".
   */
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const SHELF = ['en:groceries', 'en:whole-grains'];
  for (let i = 0; i <= MAX_RING_TAG; i++) {
    insert.run(`S${i}`, `Shelf item ${i} 500 g`, `Shelf item ${i} 500 g`, null, null, null, 500, 'g',
      JSON.stringify(SHELF), 'en:whole-grains', '[]', 1, 'test');
  }
  const NARROW = ['en:groceries', 'en:tortilla-chips'];
  for (const code of ['T1', 'T2', 'T3']) {
    insert.run(code, `Tortilla ${code} 300 g`, `Tortilla ${code} 300 g`, null, null, null, 300, 'g',
      JSON.stringify(NARROW), 'en:tortilla-chips', '[]', 1, 'test');
  }
  rebuildFts(db);
  rebuildCategories(db);
  const row = (code: string) =>
    db.prepare('SELECT * FROM product WHERE code = ?').get(code) as Record<string, unknown>;
  const asOriginal = (r: Record<string, unknown>) => ({
    code: String(r.code), name: String(r.name), brands: null, quantity: null,
    sizeValue: r.size_value as number | null, sizeUnit: r.size_unit as string | null,
    categoryPath: JSON.parse(String(r.category_path)) as string[],
    leafCategory: r.leaf_category as string | null, allergens: [] as string[],
    soldInCanada: true, source: 'test',
  });

  const wide = await alternativesFor(db, asOriginal(row('S0')) as never, 800, lookupOf({ S1: 300, S2: 300 }));
  assert.deepEqual(wide, [], 'a shelf-sized tag produced alternatives');

  const narrow = await alternativesFor(db, asOriginal(row('T1')) as never, 800, lookupOf({ T2: 300 }));
  assert.ok(narrow.length > 0, 'a genuinely narrow tag stopped producing alternatives');
});

test('a cheaper pet-food snack is not offered as an alternative to a human snack (item 19a)', async () => {
  /*
   * Tester-visible defect, item 19a: "cheaper alternatives of the wrong
   * kind". Open Food Facts' category taxonomy is shared by its sibling
   * projects with no wall between them -- measured against the live
   * catalogue, "en:snacks" alone is the leaf category of 9 pet food rows and
   * of human snack rows. Before the fix below, a cat treat offered a real
   * saving over a human cracker sharing that tag, which is not an
   * alternative a shopper asked for: the two are not the same kind of thing,
   * only the same tag.
   *
   * Written first and confirmed red against the pre-fix query (no `p.source`
   * filter): the pet snack came back as `alts[0]`. The fix is the `AND
   * p.source = ?8` clause in alternatives.ts.
   */
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const SNACKS = ['en:snacks'];
  insert.run('HUMAN1', 'Cheddar Crackers 200 g', 'Cheddar Crackers 200 g', null, null, null,
    200, 'g', JSON.stringify(SNACKS), 'en:snacks', '[]', 1, 'openfoodfacts');
  insert.run('PET1', 'Salmon Cat Treats 200 g', 'Salmon Cat Treats 200 g', null, null, null,
    200, 'g', JSON.stringify(SNACKS), 'en:snacks', '[]', 1, 'openpetfoodfacts');
  rebuildFts(db);
  rebuildCategories(db);

  const humanSnack = candidate({
    code: 'HUMAN1', name: 'Cheddar Crackers 200 g', leafCategory: 'en:snacks',
    categoryPath: SNACKS, source: 'openfoodfacts',
  });

  // The cat treat is priced far below the cracker, so if it survived the
  // category match it would win on price alone: a saving this size is
  // exactly the case the feature exists to surface, which is why it is the
  // one case that must be checked and refused here.
  const alts = await alternativesFor(db, humanSnack, 500, lookupOf({ PET1: 100 }));
  assert.deepEqual(
    alts.map((a) => a.product.code),
    [],
    'a pet food product was offered as a cheaper alternative to a human snack',
  );
});
