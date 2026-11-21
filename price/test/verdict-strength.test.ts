/**
 * The verdict is never stronger than its evidence (D-270 A6, A7, A9, A10, A11; launch gaps 72 and 73;
 * review 2026-11-21 old-lists 2 and premortem 2), and a single bottle is never priced as the multipack a
 * shop sold under its barcode (review 2026-11-21 functions: Coca-Cola 710 ml answered with the 6-pack's
 * $7.99). Every case was red on the code before its fix. RULINGS "Always answer, never refuse for wasting
 * time": each case still answers; the confidence, the width and the size carry the doubt.
 *
 * Every database is in memory; the Claude rung is a stub.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, WIDEN, Z10, type ClaudeAnswer, type EstimateItem } from '../src/estimate.ts';
import { priceRangeFor } from '../src/range.ts';

const AS_OF = '2026-09-30';
const SELF = '0626990000001';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null,
    seller: 'bcldb',
    sellerSku: `sku-${sku}`,
    sellerName: 'Thing',
    sellerBrand: null,
    priceCents: 1000,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

function pricesDb(rows: readonly ObservationRow[]): DatabaseSync {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

interface Prod {
  code: string;
  name?: string;
  brand?: string | null;
  quantity?: string | null;
  path?: string[];
}

function catalogueDb(products: readonly Prod[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = db.prepare(
    'INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category, source) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  for (const p of products) {
    const path = p.path ?? [];
    ins.run(p.code, p.name ?? 'x', p.name ?? null, p.brand ?? null, p.quantity ?? null, null, null, JSON.stringify(path), path[path.length - 1] ?? null, null);
  }
  return db;
}

const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({ barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA', ...over });
const claudeSays = (a: Partial<Extract<ClaudeAnswer, { ok: true }>> & { lowCents: number; highCents: number }) => async (): Promise<ClaudeAnswer> => ({
  ok: true,
  currency: 'CAD',
  ...a,
});
function near(a: number, b: number, tol: number, what: string): void {
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
}

/* ------------------------------------------------------------ A6: priors never compare across sizes */

const RICE = ['en:cereals', 'en:rices'];
/** Four small bags: too few for the leaf and parent rungs (5), enough for the widest-category prior (3). */
function riceWorld(self: Prod) {
  const sizes: [string, number][] = [['100 g', 200], ['200 g', 350], ['250 g', 400], ['500 g', 700]];
  const prods: Prod[] = sizes.map(([q], i) => ({ code: `20000000000${i}`, name: `Rice ${i}`, quantity: q, path: RICE }));
  const rows = sizes.map(([, c], i) => obs({ code: `20000000000${i}`, priceCents: c, seller: `shop${i}` }));
  return { catalogue: catalogueDb([...prods, self]), prices: pricesDb(rows) };
}

test('A6: a 2 kg bag priced off the category prior is priced at 2 kg, never at the median small bag', async () => {
  const { prices, catalogue } = riceWorld({ code: SELF, name: 'Big Rice', quantity: '2 kg', path: RICE });
  const { verdict } = await estimate(item(), { cents: 3000 }, { prices, catalogue });
  assert.equal(verdict.basis, 'category_prior');
  // Unscaled, the prior's centre was the 200 g bag's $3.50, and $30 for 2 kg read "Bad".
  assert.ok(verdict.centreCents >= 2000, `centre ${verdict.centreCents} is a small bag's price, not a 2 kg bag's`);
  assert.equal(verdict.scaledTo, '2 kg');
  assert.notEqual(verdict.shopper?.zone, 'bad');
});

test('A6: an item with no size priced off a category prior says the size was assumed and is wider', async () => {
  const { prices, catalogue } = riceWorld({ code: SELF, name: 'Plain Rice', quantity: null, path: RICE });
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.equal(verdict.basis, 'category_prior');
  assert.ok(verdict.notes.includes('size_assumed'), `notes ${verdict.notes.join(',')}`);
  assert.equal(verdict.confidence, 'low');
});

/* ------------------------------------------------------------ A7: Claude's unit and confidence are carried */

const lone = (quantity: string | null, name = 'Zorbo Beans') => ({
  prices: pricesDb([]),
  catalogue: catalogueDb([{ code: SELF, name, quantity }]),
});

test('A7: a Claude range per kg is scaled to the 500 g pack before the shelf price is judged', async () => {
  const w = lone('500 g');
  const { verdict } = await estimate(item(), { cents: 900 }, { ...w, askClaude: claudeSays({ lowCents: 1000, highCents: 2000, unit: 'per kg', confidence: 'medium' }) });
  assert.equal(verdict.basis, 'claude_typical');
  near(verdict.p10Cents, 500, 2, 'p10');
  near(verdict.p90Cents, 1000, 2, 'p90');
  // Read as the pack's own price, $9 for the pack was "Great" against $10 to $20.
  assert.notEqual(verdict.shopper?.zone, 'great');
});

test('A7: a Claude range per kg for an item with no size is not a shelf price; the next rung answers', async () => {
  const w = lone(null);
  const { verdict, trace } = await estimate(item(), { cents: 900 }, { ...w, askClaude: claudeSays({ lowCents: 1000, highCents: 2000, unit: 'per kg', confidence: 'high' }) });
  assert.notEqual(verdict.basis, 'claude_typical');
  const rung = trace.tried.find((t) => t.rung === 'claude_typical');
  assert.equal(rung?.outcome, 'failed');
  assert.equal(rung?.detail, 'unit_is_rate');
});

test('A7: a Claude range for a pack size it chose, on an item with no size, says the size was assumed and widens', async () => {
  const w = lone(null, 'Kraft dinner');
  const lo = 150;
  const hi = 300;
  const { verdict } = await estimate(item(), { cents: 500 }, { ...w, askClaude: claudeSays({ lowCents: lo, highCents: hi, unit: 'one 225 g box', confidence: 'medium' }) });
  assert.equal(verdict.basis, 'claude_typical');
  assert.ok(verdict.notes.includes('size_assumed'), `notes ${verdict.notes.join(',')}`);
  const own = (Math.log(hi) - Math.log(lo)) / (2 * Z10);
  near(verdict.sigmaLog, Math.round(own * WIDEN * 10000) / 10000, 2e-4, 'sigma');
});

test('A7: a Claude range for another pack size is scaled to this item size', async () => {
  const w = lone('450 g');
  const { verdict } = await estimate(item(), null, { ...w, askClaude: claudeSays({ lowCents: 150, highCents: 300, unit: 'one 225 g box', confidence: 'medium' }) });
  assert.equal(verdict.basis, 'claude_typical');
  near(verdict.p10Cents, 300, 2, 'p10');
  near(verdict.p90Cents, 600, 2, 'p90');
});

test('A7: Claude saying it is unsure of its own range widens the bell', async () => {
  const sure = await estimate(item(), null, { ...lone('500 g'), askClaude: claudeSays({ lowCents: 400, highCents: 600, unit: 'one 500 g bag', confidence: 'high' }) });
  const unsure = await estimate(item(), null, { ...lone('500 g'), askClaude: claudeSays({ lowCents: 400, highCents: 600, unit: 'one 500 g bag', confidence: 'low' }) });
  near(unsure.verdict.sigmaLog, Math.round(sure.verdict.sigmaLog * WIDEN * 10000) / 10000, 2e-4, 'sigma');
  assert.equal(unsure.verdict.confidence, 'low');
});

/* ------------------------------------------------------------ A9: seen only on sale */

const LEAF = ['en:beverages', 'en:spirits', 'en:vodkas'];
function vodkaWorld(self: Prod, own: ObservationRow[], leafPrices = [2000, 2200, 2500, 2800, 3000], region: string | null = null) {
  const prods: Prod[] = leafPrices.map((_, i) => ({ code: `1${String(i).padStart(12, '0')}`, name: `Vodka ${i}`, brand: `B${i}`, quantity: '750 ml', path: LEAF }));
  const rows = leafPrices.map((c, i) => obs({ code: `1${String(i).padStart(12, '0')}`, priceCents: c, seller: `shop${i}`, region }));
  return { catalogue: catalogueDb([...prods, self]), prices: pricesDb([...rows, ...own]) };
}

test('A9: an item seen only on sale is never judged below its own sale price, and is not sure', async () => {
  const { prices, catalogue } = vodkaWorld({ code: SELF, name: 'Dear Vodka', quantity: '750 ml', path: LEAF }, [
    obs({ code: SELF, priceCents: 3500, kind: 'promotional', seller: 'a' }),
    obs({ code: SELF, priceCents: 3600, kind: 'promotional', seller: 'b' }),
  ]);
  const { verdict } = await estimate(item(), { cents: 3900 }, { prices, catalogue });
  // The category's $25 centre called a $39 regular price "Bad" for a bottle two shops sold at $35 and $36 on sale.
  assert.ok(verdict.centreCents >= 3600, `centre ${verdict.centreCents} is under the item's own sale price`);
  assert.equal(verdict.confidence, 'low');
  assert.notEqual(verdict.shopper?.zone, 'bad');
});

/* ------------------------------------------------------------ A10 and gap 72: prices from another province */

test('A10: three fresh Ontario shops are not "Certain" for a shopper in British Columbia', async () => {
  const own = [2400, 2500, 2600].map((c, i) => obs({ code: SELF, priceCents: c, seller: 'hammer', storeName: `Store ${i}`, region: 'ON' }));
  const { prices, catalogue } = vodkaWorld({ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }, own);
  const on = await estimate(item({ region: 'Ontario' }), null, { prices, catalogue });
  assert.equal(on.verdict.confidence, 'high');
  const bc = await estimate(item({ region: 'British Columbia' }), null, { prices, catalogue });
  assert.equal(bc.verdict.basis, 'own_prices');
  assert.ok(bc.verdict.notes.includes('other_region'));
  assert.equal(bc.verdict.confidence, 'medium');
});

test('gap 72: a category built only on Toronto shelves is less sure for a shopper in another province, and still answers', async () => {
  const leaf = Array.from({ length: 22 }, (_, i) => 2400 + i * 10);
  const self = { code: SELF, name: 'New Vodka', quantity: '750 ml', path: LEAF };
  const { prices, catalogue } = vodkaWorld(self, [], leaf, 'ON');
  const on = await estimate(item({ region: 'Ontario' }), { cents: 2500 }, { prices, catalogue });
  assert.equal(on.verdict.basis, 'leaf_category');
  assert.equal(on.verdict.confidence, 'medium');
  assert.ok(!on.verdict.notes.includes('other_region'));
  const bc = await estimate(item({ region: 'British Columbia' }), { cents: 2500 }, { prices, catalogue });
  assert.equal(bc.verdict.basis, 'leaf_category');
  assert.equal(bc.verdict.confidence, 'low');
  assert.ok(bc.verdict.notes.includes('other_region'));
  assert.ok(bc.verdict.shopper, 'still an answer with a zone');
  // With no province known nothing changes.
  const none = await estimate(item(), { cents: 2500 }, { prices, catalogue });
  assert.equal(none.verdict.confidence, 'medium');
});

/* ------------------------------------------------------------ A11: the bigger-pack note */

function chipsWorld(bigRow: Partial<ObservationRow>) {
  const path = ['en:snacks', 'en:chips'];
  const catalogue = catalogueDb([
    { code: SELF, name: 'Crunch Chips 200 g', brand: 'Crunch', quantity: '200 g', path },
    { code: '4000000000001', name: 'Crunch Chips 300 g', brand: 'Crunch', quantity: '300 g', path },
    { code: '4000000000002', name: 'Crunch Chips 1 kg', brand: 'Crunch', quantity: '1 kg', path },
  ]);
  const prices = pricesDb([
    obs({ code: '4000000000001', priceCents: 450, seller: 'a' }),
    obs({ code: '4000000000002', priceCents: 1000, seller: 'b', storeName: 'Costco', ...bigRow }),
  ]);
  return { prices, catalogue };
}

test('A11: a bigger pack priced over a year ago is not offered as the cheaper way to buy', async () => {
  const { verdict } = await estimate(item(), null, chipsWorld({ seenOn: '2025-05-15' }));
  assert.equal(verdict.biggerPack, null);
});

test('A11: a bigger pack priced only in another province is not offered to a shopper whose province is known', async () => {
  const { verdict } = await estimate(item({ region: 'British Columbia' }), null, chipsWorld({ region: 'ON' }));
  assert.equal(verdict.biggerPack, null);
});

test('A11: a bigger pack that is dearer per 100 g than this one is not offered', async () => {
  const { verdict } = await estimate(item(), null, chipsWorld({ priceCents: 2000 }));
  assert.equal(verdict.biggerPack, null);
});

test('A11: control, a fresh, cheaper bigger pack from the shopper province is still offered', async () => {
  const { verdict } = await estimate(item({ region: 'Ontario' }), null, chipsWorld({ region: 'ON' }));
  assert.deepEqual(verdict.biggerPack, { quantity: '1 kg', perUnitCents: 100, store: 'Costco' });
});

/* ------------------------------------------------------------ one bottle is never the multipack's price */

const SODA = ['en:beverages', 'en:sodas'];
const coke = (q: string | null) => ({ code: SELF, name: 'Coca-Cola', brand: 'Coca-Cola', quantity: q, path: SODA });
const shop = (store: string, cents: number, over: Partial<ObservationRow>) => obs({ code: SELF, priceCents: cents, seller: 'hammer', storeName: store, region: 'ON', ...over });

test('Coca-Cola: shops sell this barcode as 6 x 710 ml, so the answer is the 6-pack, said so, never one 710 ml bottle at the pack price', async () => {
  // The live answer 2026-11-21: Metro, No Frills, Loblaws list "6x710ml"; Walmart and Save-On print only "710 ml" at the pack's price.
  const rows = [
    shop('Metro', 799, { sellerName: 'Coca-Cola 6x710ml' }),
    shop('No Frills', 600, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Loblaws', 799, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Walmart', 588, { sellerName: 'Coca-Cola', parsedSize: '710 ml' }),
    shop('Save-On-Foods', 899, { sellerName: 'Coca-Cola', parsedSize: '710 ml' }),
    shop('Metro', 399, { sellerName: 'Coca-Cola 6x710ml', kind: 'promotional', seenOn: '2026-09-21' }),
    shop('Save-On-Foods', 399, { sellerName: 'Coca-Cola', parsedSize: '710 ml', kind: 'promotional', seenOn: '2026-09-21' }),
  ];
  const { verdict, trace } = await estimate(item({ size: '710 ml' }), null, { prices: pricesDb(rows), catalogue: catalogueDb([coke('710 ml')]) });
  assert.ok(verdict.notes.includes('identity_conflict'));
  assert.ok(trace.conflict, 'the size conflict is recorded');
  assert.match(trace.conflict!.storeSize, /^6\s*x\s*710/i);
  assert.match(trace.size ?? '', /^6\s*x\s*710/i);
  assert.equal(verdict.n, 5);
  // Per 100 ml over the six bottles, not one.
  near(verdict.perUnit!.centreCents, Math.round((verdict.centreCents * 100) / 4260), 1, 'per 100 ml');
  assert.match(verdict.scaledTo ?? '', /^6\s*x\s*710/i);
});

test('Coca-Cola, one bottle in hand: $2.79 is judged against 710 ml sodas, never against the 6-pack, and never "Great"', async () => {
  // Boss check 2026-11-21: the barcode's shop rows are the 6-pack, the shopper holds one 710 ml bottle at $2.79.
  const sodas = [229, 249, 269, 289, 299].map((c, i) => ({ code: `5${String(i).padStart(12, '0')}`, cents: c }));
  const rows = [
    shop('Metro', 799, { sellerName: 'Coca-Cola 6x710ml' }),
    shop('No Frills', 600, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Loblaws', 799, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Walmart', 588, { sellerName: 'Coca-Cola', parsedSize: '710 ml' }),
    shop('Save-On-Foods', 899, { sellerName: 'Coca-Cola', parsedSize: '710 ml' }),
    ...sodas.map((s, i) => obs({ code: s.code, priceCents: s.cents, seller: `soda${i}` })),
  ];
  const catalogue = catalogueDb([coke('710 ml'), ...sodas.map((s, i) => ({ code: s.code, name: `Cola ${i}`, brand: `C${i}`, quantity: '710 ml', path: SODA }))]);
  const { verdict, trace } = await estimate(item({ size: '710 ml' }), { cents: 279 }, { prices: pricesDb(rows), catalogue });
  assert.notEqual(verdict.basis, 'own_prices', 'the 6-pack rows are not this bottle\'s prices');
  assert.ok(verdict.centreCents < 500, `centre ${verdict.centreCents} is a 6-pack price`);
  assert.equal(verdict.scaledTo === null || !/6\s*x/i.test(verdict.scaledTo), true);
  assert.equal(trace.conflict, null, 'the answer keeps the bottle the shopper holds');
  assert.ok(verdict.notes.includes('identity_conflict'));
  assert.equal(verdict.confidence, 'low');
  assert.equal(verdict.basis, 'leaf_category');
  assert.equal(verdict.shopper?.zone, 'reasonable', `centre ${verdict.centreCents}, zone ${verdict.shopper?.zone}`);
  assert.notEqual(verdict.shopper?.zone, 'great');
  assert.notEqual(verdict.shopper?.zone, 'good');
});

test('control: a 710 ml bottle sold as one bottle by most shops is priced as one bottle; the one 6-pack listing stays out', async () => {
  const rows = [
    shop('Metro', 250, { sellerName: 'Coca-Cola 710ml' }),
    shop('No Frills', 275, { sellerName: 'Coca-Cola 710 ml' }),
    shop('Loblaws', 299, { sellerName: 'Coca-Cola 710ml' }),
    shop('Walmart', 799, { sellerName: 'Coca-Cola 6x710ml' }),
  ];
  const { verdict, trace } = await estimate(item({ size: '710 ml' }), null, { prices: pricesDb(rows), catalogue: catalogueDb([coke('710 ml')]) });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 3);
  assert.equal(verdict.centreCents, 275);
  assert.equal(trace.conflict, null);
  assert.ok(!verdict.notes.includes('identity_conflict'));
  assert.ok(verdict.dots.every((d) => d.cents < 500), 'the 6-pack is not drawn as a price of this bottle');
});

test('the range card reads shop sizes the same way: one 6-pack listing is not a price of the bottle', async () => {
  const rows = [
    shop('Metro', 250, { sellerName: 'Coca-Cola 710ml' }),
    shop('No Frills', 275, { sellerName: 'Coca-Cola 710 ml' }),
    shop('Loblaws', 299, { sellerName: 'Coca-Cola 710ml' }),
    shop('Walmart', 799, { sellerName: 'Coca-Cola 6x710ml' }),
  ];
  const r = priceRangeFor({ barcode: SELF, size: '710 ml', asOf: AS_OF }, { prices: pricesDb(rows), catalogue: catalogueDb([coke('710 ml')]) });
  assert.equal(r.basis, 'this_product');
  assert.equal(r.n, 3);
  assert.ok(r.basis === 'this_product' && r.highCents < 500, `high ${r.basis === 'this_product' ? r.highCents : '-'}`);
});
