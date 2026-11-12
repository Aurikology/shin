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
