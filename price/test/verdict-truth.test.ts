/**
 * Verdicts no stronger than their evidence (bug sweep 2026-11-11, family 5; D-270, D-258, D-260).
 * The word, the confidence and the picture the shopper sees must agree with the evidence.
 *
 * Every database is in memory, through the real `openPrices` and `recordObservation`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type EstimateItem } from '../src/estimate.ts';

const AS_OF = '2026-09-30';
const LEAF = ['en:snacks', 'en:biscuits', 'en:filled-biscuits'];
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

function catalogueDb(products: readonly { code: string; name: string; quantity: string; path: string[] }[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = db.prepare(
    'INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category, source) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  for (const p of products) ins.run(p.code, p.name, p.name, null, p.quantity, null, null, JSON.stringify(p.path), p.path[p.path.length - 1]!, null);
  return db;
}

/**
 * A leaf of five biscuits at 300 g with a wide spread (the bell's floor), plus this item's own rows.
 * The leaf's spread is IQR/1.349 of ln(2200..2800) = 0.179, so the shaded band runs about 23% either side.
 */
function fixture(ownRows: ObservationRow[], leafPrices = [400, 440, 500, 560, 600]) {
  const prods = leafPrices.map((_, i) => ({ code: `10000000000${i}`, name: `Biscuit ${i}`, quantity: '300 g', path: LEAF }));
  const rows = leafPrices.map((c, i) => obs({ code: `10000000000${i}`, priceCents: c, seller: `shop${i}` }));
  return {
    catalogue: catalogueDb([...prods, { code: SELF, name: 'Own Biscuit', quantity: '300 g', path: LEAF }]),
    prices: pricesDb([...rows, ...ownRows]),
  };
}

const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({ barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA', ...over });

/** The client's arithmetic (app/public/js/lib/verdict-chart.js zoneCuts, on the rounded centre it draws). */
function shownCentre(c: number): number {
  return c < 1000 ? Math.round(c / 5) * 5 : c < 10000 ? Math.round(c / 10) * 10 : Math.round(c / 100) * 100;
}
function zoneAt(cents: number, centre: number, t: { greatPct: number; goodPct: number; badPct: number }): string {
  if (cents <= centre * (1 - t.greatPct / 100)) return 'great';
  if (cents <= centre * (1 - t.goodPct / 100)) return 'good';
  if (cents >= centre * (1 + t.badPct / 100)) return 'bad';
  return 'reasonable';
}

/* ------------------------------------------------ fix 1: the word agrees with the band (D-270 A2/B3) */

test('D-270 B3: a price inside the shaded 8-in-10 band is never "bad", "good" or "great", on the server or the phone', async () => {
  // Five shops: 450..560, own spread used (5+ shops), floored by the leaf's spread.
  const own = [450, 480, 500, 520, 560].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));
  const { prices, catalogue } = fixture(own);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.ok(verdict.p90Cents / verdict.centreCents > 1.2, `this fixture needs a band wider than the default bad line (p90 ${verdict.p90Cents}, centre ${verdict.centreCents})`);
  for (const cents of [verdict.p10Cents, verdict.p10Cents + 1, verdict.centreCents, verdict.p90Cents - 1, verdict.p90Cents]) {
    const { verdict: v } = await estimate(item(), { cents }, { prices, catalogue });
    assert.equal(v.shopper!.zone, 'reasonable', `server: ${cents}c sits inside the band ${v.p10Cents}..${v.p90Cents} yet reads ${v.shopper!.zone}`);
    for (const centre of [v.centreCents, shownCentre(v.centreCents)]) {
      assert.equal(zoneAt(cents, centre, v.thresholds), 'reasonable', `phone (centre ${centre}): ${cents}c inside the band reads ${zoneAt(cents, centre, v.thresholds)}`);
    }
  }
});

test('D-270 B3 control: a price past the band still gets its word', async () => {
  const own = [450, 480, 500, 520, 560].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));
  const { prices, catalogue } = fixture(own);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  const high = await estimate(item(), { cents: Math.ceil(verdict.p90Cents * 1.02) }, { prices, catalogue });
  assert.equal(high.verdict.shopper!.zone, 'bad');
  const low = await estimate(item(), { cents: Math.floor(verdict.p10Cents * 0.98) }, { prices, catalogue });
  assert.ok(['good', 'great'].includes(low.verdict.shopper!.zone), `a price under the band reads ${low.verdict.shopper!.zone}`);
  const veryLow = await estimate(item(), { cents: Math.floor(verdict.p10Cents * 0.8) }, { prices, catalogue });
  assert.equal(veryLow.verdict.shopper!.zone, 'great');
});

test('D-270 B3 control: a narrow bell keeps the default lines (good 20, great 30, bad 20)', async () => {
  const own = [500, 500, 500, 500, 500].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));
  const { prices, catalogue } = fixture(own, [480, 490, 500, 510, 520]);
  const { verdict } = await estimate(item(), { cents: 600 }, { prices, catalogue });
  assert.deepEqual(verdict.thresholds, { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
  assert.equal(verdict.shopper!.zone, 'bad');
});

test('D-270 B3 control: a line the shopper set himself is kept as typed (RULINGS: his own thresholds)', async () => {
  const own = [450, 480, 500, 520, 560].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));
  const { prices, catalogue } = fixture(own);
  const { verdict } = await estimate(item(), { cents: 600, thresholds: { greatPct: 30, goodPct: 20, badPct: 10 } }, { prices, catalogue });
  assert.equal(verdict.thresholds.badPct, 10);
  assert.equal(verdict.thresholds.fromShopper, true);
});

/* ------------------------------------------- fix 2: a wide bell is never "Certain" (D-270 A3) */

/** Three fresh shops of this item: the old rule called that "high" ("Certain") whatever the bell's width. */
const threeShops = () => [480, 500, 520].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));

test('D-270 A3: three fresh shops under a bell wider than 1.5x (p90/p10) are not "Certain"', async () => {
  const { prices, catalogue } = fixture(threeShops());
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  const width = verdict.p90Cents / verdict.p10Cents;
  assert.ok(width > 1.5 && width <= 2.25, `fixture: band ${verdict.p10Cents}..${verdict.p90Cents} is ${width.toFixed(2)}x`);
  assert.equal(verdict.confidence, 'medium');
});

test('D-270 A3: a bell wider than 2.25x (the 1.5x line twice over) is "Not fully confident"', async () => {
  const { prices, catalogue } = fixture(threeShops(), [300, 350, 500, 700, 800]);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.ok(verdict.p90Cents / verdict.p10Cents > 2.25, `fixture: band ${verdict.p10Cents}..${verdict.p90Cents}`);
  assert.equal(verdict.confidence, 'low');
});

test('D-270 A3 control: three fresh shops under a narrow bell stay "Certain"', async () => {
  const { prices, catalogue } = fixture(threeShops(), [480, 490, 500, 510, 520]);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.ok(verdict.p90Cents / verdict.p10Cents <= 1.5);
  assert.equal(verdict.confidence, 'high');
});

/* ---------------------- fix 3: one or two prices never read "Fairly sure" beside "Few prices" (D-258) */

const NARROW_LEAF = [480, 490, 500, 510, 520];

test('D-258: one shop seen on two days (live Oreo 303 g) is "Not fully confident", not "Fairly sure" beside "Few prices"', async () => {
  const own = [obs({ code: SELF, priceCents: 499, seller: 'hammer', storeName: 'Galleria', seenOn: '2026-09-20' }),
    obs({ code: SELF, priceCents: 499, seller: 'hammer', storeName: 'Galleria', seenOn: '2026-09-19' })];
  const { prices, catalogue } = fixture(own, NARROW_LEAF);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 1);
  assert.ok(verdict.notes.includes('few_prices'));
  assert.equal(verdict.confidence, 'low');
});

test('D-258: two shops are "Not fully confident" too', async () => {
  const own = [490, 510].map((c, i) => obs({ code: SELF, priceCents: c, seller: `own${i}` }));
  const { prices, catalogue } = fixture(own, NARROW_LEAF);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.equal(verdict.n, 2);
  assert.equal(verdict.confidence, 'low');
});

test('D-258 control: three shops under a narrow bell are "Certain" and carry no few-prices note', async () => {
  const { prices, catalogue } = fixture(threeShops(), NARROW_LEAF);
  const { verdict } = await estimate(item(), null, { prices, catalogue });
  assert.equal(verdict.confidence, 'high');
  assert.ok(!verdict.notes.includes('few_prices'));
});

/* --------------- fix 4: Project Hammer's repeated rows count once toward n and confidence (D-260) */

test('D-260: Hammer rows repeated day after day, and its sale plus regular pair, count once per shop', async () => {
  const { observationsFor } = await import('../src/hammer.ts');
  const product = (id: string, vendor: string) => ({ id, vendor, name: 'Cristie Oreo', units: '303g', brand: 'Christie', url: '', sku: id, code: SELF });
  const rows: ObservationRow[] = [];
  // Two refreshes a day apart, the same price each time (live: "Galleria $4.99 at 3 d and 4 d").
  for (const day of ['20260919', '20260920']) {
    rows.push(...observationsFor(product('g1', 'Galleria'), { day, current: '4.99', old: '', perUnit: '', other: '' }));
    // On sale: the sale row plus the old price written again as a regular row.
    rows.push(...observationsFor(product('m1', 'Metro'), { day, current: '3.99', old: '4.99', perUnit: '', other: '' }));
  }
  assert.equal(rows.length, 6, 'fixture: two Galleria rows, two Metro sale rows, two Metro regular rows');
  const { prices, catalogue } = fixture(rows, NARROW_LEAF);
  const { verdict } = await estimate(item({ region: 'Ontario' }), null, { prices, catalogue });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 2, `6 rows from 2 shops count as ${verdict.n}`);
  assert.ok(verdict.notes.includes('few_prices'));
  assert.notEqual(verdict.confidence, 'high');
});
