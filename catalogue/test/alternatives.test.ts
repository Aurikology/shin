/**
 * Tests for the four refusals in the alternatives stage.
 *
 * Every one of these guards a rule that a later change would break by being
 * more helpful: widening the category to fill three slots, dropping the size
 * rule to find a saving, hiding an alternative that adds an allergen, or
 * showing a row whose price nobody has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, rebuildCategories } from '../src/schema.ts';
import { alternativesFor, alternativesHeading, type PricedProduct } from '../src/alternatives.ts';
import type { Candidate } from '../src/search.ts';

const PB = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];

function candidate(over: Partial<Candidate> & { code: string }): Candidate {
  return {
    name: 'x', nameEn: null, nameFr: null, brands: null, quantity: null,
    sizeValue: 500, sizeUnit: 'g', leafCategory: 'en:peanut-butters',
    categoryPath: PB, allergens: [], soldInCanada: true,
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
  ];
  for (const [code, name, size, unit, path, allergens, canada] of rows) {
    insert.run(code, name, name, null, null, null, size, unit,
      JSON.stringify(path), path[path.length - 1], allergens, canada, 'test');
  }
  rebuildFts(db);
  rebuildCategories(db);
  return db;
}

/** Prices in cents, keyed by code. Whatever is absent has no price at all. */
function lookupOf(prices: Record<string, number>) {
  return async (codes: readonly string[]) => {
    const m = new Map<string, PricedProduct>();
    for (const c of codes) {
      if (prices[c] === undefined) continue;
      m.set(c, { code: c, amountCents: prices[c], seller: 'Test Grocer', observedAt: '2026-09-04' });
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

test('a size far outside the original is not a fair swap', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ D: 3000 }));
  assert.equal(alts.length, 0, '5 kg against 500 g is a different purchase');
});

test('an added allergen is printed on the row, not used to hide it', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ C: 600 }));
  assert.equal(alts.length, 1);
  assert.deepEqual(alts[0].addedAllergens, ['en:nuts']);
});

test('a removed allergen is reported too', async () => {
  const db = fixture();
  const nutty = candidate({ code: 'C', sizeValue: 750, allergens: ['en:peanuts', 'en:nuts'] });
  const alts = await alternativesFor(db, nutty, 1500, lookupOf({ A: 600, B: 600 }));
  assert.ok(alts.length > 0);
  assert.deepEqual(alts[0].removedAllergens, ['en:nuts']);
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

test('without a size on the original there is no unit price and so no claim', async () => {
  const db = fixture();
  const unsized = candidate({ code: 'A', sizeValue: null, sizeUnit: null });
  const alts = await alternativesFor(db, unsized, 800, lookupOf({ B: 100 }));
  assert.equal(alts.length, 0);
});

test('the row names a measurement and a seller, and makes no taste claim', async () => {
  const db = fixture();
  const alts = await alternativesFor(db, original, 800, lookupOf({ B: 500 }));
  const line = alts[0].line;
  assert.match(line, /per 100 g/);
  assert.match(line, /Test Grocer/);
  assert.ok(!/tast|same|just as|identical|as good/i.test(line), `line made a claim: ${line}`);
  assert.equal(alts[0].price.observedAt, '2026-09-04');
});

test('the heading names the category the swap came from', async () => {
  assert.equal(alternativesHeading(original, 2), 'Cheaper peanut butters');
  assert.equal(alternativesHeading(original, 0), 'No cheaper option we can price');
});
