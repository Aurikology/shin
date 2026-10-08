/**
 * Tests for text-match.ts: noisy lines off a pack or a shelf tag, in; the top
 * three catalogue rows, out.
 *
 * Same shape as search.test.ts: a tiny hand-built catalogue in memory, real
 * FTS, real `Catalogue.search`, and the miss log pointed at a temp file so no
 * real database is ever written. These check the LOGIC (line filtering, OCR
 * repair, size and brand reading, the rerank weights, the Canada filter).
 * They cannot check how well a real OCR engine's output matches; see the
 * module header.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openCatalogue, rebuildFts } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { openGapLog } from '../src/gaps.ts';
import { Catalogue } from '../src/search.ts';
import type { SearchQuery, SearchResult } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';
import { topMatchesFromText, brandLookupFromDb } from '../src/text-match.ts';

/** The vector arm is off by default here, so an embedder that is ever called is a bug. */
const NO_EMBEDDER: Embedder = {
  id: 'test:none',
  dim: 384,
  async embedPassages() { throw new Error('vector arm should be off'); },
  async embedQuery() { throw new Error('vector arm should be off'); },
} as unknown as Embedder;

const CEREAL = '["en:breakfasts","en:cereals","en:corn-flakes"]';
const PB = '["en:spreads","en:peanut-butters"]';
const MILK = '["en:dairies","en:milks"]';
const SODA = '["en:beverages","en:colas"]';

const K_CORN = '0064100110317';
const K_CORN_US = '0038000000140';
const COMPLIMENTS_CORN = '0055742000011';
const K_FROSTED = '0064100110324';
const KRAFT_SMOOTH_1KG = '0068100084245';
const KRAFT_SMOOTH_2KG = '0068100084276';
const KRAFT_CREAMY_1KG = '0068100084290';
const NATREL_2 = '0068700100022';
const COKE_12 = '0067000100242';

function fixture() {
  openGapLog(join(mkdtempSync(join(tmpdir(), 'shin-textmatch-gap-')), 'gaps.db'));
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,'[]',?,'test')`);
  const rows: [string, string, string | null, string | null, string | null, string, number | null, string | null, string, string, number][] = [
    [K_CORN, 'Corn Flakes Cereal', 'Corn Flakes Cereal', 'Flocons de maïs', "Kellogg's", '540 g', 540, 'g', CEREAL, 'en:corn-flakes', 1],
    [K_CORN_US, 'Corn Flakes', 'Corn Flakes', null, "Kellogg's", '18 oz', 510, 'g', CEREAL, 'en:corn-flakes', 0],
    [COMPLIMENTS_CORN, 'Original Corn Flakes', 'Original Corn Flakes', null, 'Compliments', '750 g', 750, 'g', CEREAL, 'en:corn-flakes', 1],
    [K_FROSTED, 'Frosted Flakes', 'Frosted Flakes', 'Givrés', "Kellogg's", '650 g', 650, 'g', CEREAL, 'en:corn-flakes', 1],
    [KRAFT_SMOOTH_1KG, 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Beurre d arachide crémeux', 'Kraft', '1 kg', 1000, 'g', PB, 'en:peanut-butters', 1],
    [KRAFT_SMOOTH_2KG, 'Smooth Peanut Butter', 'Smooth Peanut Butter', null, 'Kraft', '2 kg', 2000, 'g', PB, 'en:peanut-butters', 1],
    [KRAFT_CREAMY_1KG, 'Creamy Peanut Butter', 'Creamy Peanut Butter', null, 'Kraft', '1 kg', 1000, 'g', PB, 'en:peanut-butters', 1],
    [NATREL_2, 'Partly Skimmed Milk 2%', 'Partly Skimmed Milk 2%', 'Lait partiellement écrémé 2 %', 'Natrel', '2 L', 2000, 'ml', MILK, 'en:milks', 1],
    [COKE_12, 'Coca-Cola Classic', 'Coca-Cola Classic', null, 'Coca-Cola', '12 x 355 mL', 4260, 'ml', SODA, 'en:colas', 1],
  ];
  for (const r of rows) insert.run(...r);
  rebuildFts(db);
  rebuildCategories(db);
  const catalogue = new Catalogue(db, NO_EMBEDDER);
  return { db, catalogue, brands: brandLookupFromDb(db) };
}

test("a cereal box's front text finds the box, with brand and size read and the panel ignored", async () => {
  const { catalogue, brands } = fixture();
  const lines = [
    "Kellogg's",
    'CORN FLAKES',
    'FLOCONS DE MAÏS',
    'Fortified with 8 essential nutrients',
    '540 g',
    'Nutrition Facts / Valeur nutritive',
    'Calories 110',
    'Fat / Lipides 0 g',
    'Sodium 200 mg',
  ];
  const r = await topMatchesFromText(lines, { catalogue, brands });
  assert.equal(r.candidates[0]?.productId, K_CORN);
  assert.equal(r.candidates[0].barcode, K_CORN);
  assert.equal(r.read.brand, "Kellogg's");
  assert.equal(r.read.brandLine, 0);
  assert.deepEqual(r.read.size && { value: r.read.size.value, unit: r.read.size.unit, line: r.read.size.line }, { value: 540, unit: 'g', line: 4 });
  for (const i of [5, 6, 7, 8]) assert.ok(r.read.droppedLines.includes(i), `nutrition line ${i} was not dropped`);
  assert.ok(r.candidates.length <= 3);
  for (const c of r.candidates) assert.ok(c.score >= 0 && c.score <= 1, `score ${c.score} out of 0..1`);
  // The name lines and the size line support the winner; the panel does not.
  assert.ok(r.candidates[0].supportingLines.includes(1));
  assert.ok(r.candidates[0].supportingLines.includes(4));
  assert.ok(!r.candidates[0].supportingLines.some((i) => i >= 5));
  assert.equal(r.shelfPrice, null);
});

test('a shelf tag: the price and unit price are read and reported, never searched on', async () => {
  const { catalogue, brands } = fixture();
  const lines = ["KELLOGG'S CORN FLAKES", '540 G', 'SALE', '$4.99', '$0.92/100g', 'REG $6.49', '0 64100 11031 7'];
  const r = await topMatchesFromText(lines, { catalogue, brands });
  assert.deepEqual(r.shelfPrice && { cents: r.shelfPrice.cents, forCount: r.shelfPrice.forCount, line: r.shelfPrice.line }, { cents: 499, forCount: 1, line: 3 });
  assert.deepEqual(r.unitPrice && { cents: r.unitPrice.cents, per: r.unitPrice.per, line: r.unitPrice.line }, { cents: 92, per: '100 g', line: 4 });
  assert.equal(r.candidates[0]?.productId, K_CORN);
  for (const q of r.read.queries) {
    assert.ok(!/4\.99|6\.49|0\.92|sale|reg\b/i.test(q), `price or promo leaked into a query: ${q}`);
  }
  for (const i of [2, 3, 4, 5, 6]) assert.ok(r.read.droppedLines.includes(i), `line ${i} should be dropped`);
});

test('a French shelf tag: a multi-buy and a comma-decimal unit price', async () => {
  const { catalogue, brands } = fixture();
  const lines = ['KRAFT BEURRE D ARACHIDE CRÉMEUX', '1 kg', '2 POUR 5,00 $', '0,25 $/100 g'];
  const r = await topMatchesFromText(lines, { catalogue, brands });
  assert.equal(r.shelfPrice?.cents, 500);
  assert.equal(r.shelfPrice?.forCount, 2);
  assert.equal(r.unitPrice?.cents, 25);
  assert.equal(r.unitPrice?.per, '100 g');
  assert.equal(r.candidates[0]?.productId, KRAFT_SMOOTH_1KG);
});

test('a bilingual milk label reaches the row through either language and reads 2 L, not 2%', async () => {
  const { catalogue, brands } = fixture();
  const lines = ['NATREL', 'Lait partiellement écrémé', 'Partly skimmed milk', '2%', '2 L'];
  const r = await topMatchesFromText(lines, { catalogue, brands });
  assert.equal(r.candidates[0]?.productId, NATREL_2);
  assert.equal(r.read.brand, 'Natrel');
  assert.equal(r.read.size?.value, 2000);
  assert.equal(r.read.size?.unit, 'ml');
  assert.equal(r.candidates[0].signals.nameRecall, 1);
  assert.ok(r.candidates[0].supportingLines.includes(1) && r.candidates[0].supportingLines.includes(2));
});

test('OCR noise: 0 read for O and O read for 0 are repaired', async () => {
  const { catalogue, brands } = fixture();
  const r = await topMatchesFromText(["KELL0GG'S", 'C0RN FLAKES', '54O g'], { catalogue, brands });
  assert.equal(r.read.brand, "Kellogg's");
  assert.equal(r.read.size?.value, 540);
  assert.equal(r.candidates[0]?.productId, K_CORN);
});

test('OCR noise: rn read for m still finds the creamy jar over the smooth one', async () => {
  const { catalogue, brands } = fixture();
  const r = await topMatchesFromText(['KRAFT', 'Crearny Peanut Butter', '1 kg'], { catalogue, brands });
  assert.ok(r.read.queries.some((q) => q.includes('creamy')), `no rn/m query in ${JSON.stringify(r.read.queries)}`);
  assert.equal(r.candidates[0]?.productId, KRAFT_CREAMY_1KG);
  // Same brand, same size, one word short: the smooth 1 kg jar is second, the 2 kg jar is not ahead of it.
  const ids = r.candidates.map((c) => c.productId);
  assert.ok(ids.indexOf(KRAFT_SMOOTH_1KG) < (ids.indexOf(KRAFT_SMOOTH_2KG) === -1 ? 99 : ids.indexOf(KRAFT_SMOOTH_2KG)));
});

test('text with no product words returns nothing, not a guess, and never searches', async () => {
  const calls: SearchQuery[] = [];
  const spy = {
    async search(q: SearchQuery): Promise<SearchResult> {
      calls.push(q);
      return { band: 'miss', candidates: [], ring: null, matchedBy: 'none', wordsMatched: 'n/a' };
    },
  };
  const lines = ['SALE', '$3.99', '2 FOR $5', 'Calories 110', 'Sodium 200 mg', '0 64100 11031 7', 'www.kelloggs.ca', ''];
  const r = await topMatchesFromText(lines, { catalogue: spy });
  assert.deepEqual(r.candidates, []);
  assert.equal(calls.length, 0);
  assert.equal(r.shelfPrice?.cents, 399);
});

test('words that match nothing in the catalogue return nothing', async () => {
  const { catalogue, brands } = fixture();
  const r = await topMatchesFromText(['XQZT VRRP', 'ZZYZX'], { catalogue, brands });
  assert.deepEqual(r.candidates, []);
});

test('brand and size agreeing beat a row whose name is printed more fully', async () => {
  const { catalogue, brands } = fixture();
  // The store brand's name "Original Corn Flakes" is all on the pack; the Kellogg's
  // row's name "Corn Flakes Cereal" is two thirds on it. Brand and size decide.
  const r = await topMatchesFromText(["Kellogg's", 'Original', 'Corn Flakes', '540 g'], { catalogue, brands });
  const kellogg = r.candidates.find((c) => c.productId === K_CORN);
  const store = r.candidates.find((c) => c.productId === COMPLIMENTS_CORN);
  assert.ok(kellogg && store, 'both rows should be in the top three');
  assert.ok(store.signals.nameRecall > kellogg.signals.nameRecall, 'fixture no longer tests what it says');
  assert.equal(kellogg.signals.brandAgrees, true);
  assert.equal(kellogg.signals.sizeAgrees, true);
  assert.equal(store.signals.brandAgrees, false);
  assert.equal(r.candidates[0].productId, K_CORN);
  assert.ok(kellogg.score > store.score);
});

test('canadaOnly defaults on and filters at read time; off lets the US box through', async () => {
  const { catalogue, brands } = fixture();
  const lines = ["Kellogg's", 'Corn Flakes', '18 oz'];
  const on = await topMatchesFromText(lines, { catalogue, brands });
  assert.ok(!on.candidates.some((c) => c.productId === K_CORN_US), 'a row not sold in Canada leaked through');
  const off = await topMatchesFromText(lines, { catalogue, brands, canadaOnly: false });
  assert.equal(off.candidates[0]?.productId, K_CORN_US);
});

test('a multipack size pins the total and offers the per-can size as the second reading', async () => {
  const calls: SearchQuery[] = [];
  const { catalogue, brands } = fixture();
  const spy = {
    search(q: SearchQuery) {
      calls.push(q);
      return catalogue.search(q);
    },
  };
  const r = await topMatchesFromText(['Coca-Cola', 'Classic', '12 x 355 mL', 'CANS / CANETTES'], { catalogue: spy, brands });
  assert.equal(r.read.size?.value, 4260);
  assert.equal(r.read.size?.each, 355);
  assert.equal(r.read.size?.packCount, 12);
  assert.ok(calls.length > 0 && calls.length <= 4);
  for (const q of calls) {
    assert.equal(q.sizeValue, 4260);
    assert.equal(q.sizeValueAlt, 355);
    assert.equal(q.sizeUnit, 'ml');
    assert.equal(q.vectors, false);
  }
  assert.equal(r.candidates[0]?.productId, COKE_12);
});

test('duplicates by barcode collapse and at most three come back', async () => {
  const { catalogue, brands } = fixture();
  const r = await topMatchesFromText(["Kellogg's", 'Flakes', 'Corn Flakes', 'Frosted Flakes'], { catalogue, brands });
  assert.ok(r.candidates.length <= 3);
  const codes = r.candidates.map((c) => c.productId.replace(/^0+/, ''));
  assert.equal(new Set(codes).size, codes.length);
});
