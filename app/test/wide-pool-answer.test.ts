/**
 * D-233 (critical, calibration) through the real catalogue-first answer: an
 * item with no price of its own, whose only basis is a category pool flagged too
 * wide (price/src/width-flag.ts), is never priced or judged from that pool.
 *
 * Live scan 109: 7 prices from $7.18 to $142.49 gave "84% under, Pexi's
 * estimate $31.99" and "Great price" for a $4.99 item. The PC run: Oreo Sea Salt
 * Coconut got $8.78 to $73.90, typical $25.47, "Great price" at $3.99.
 *
 * The decision (stated to Jamin, 2026-10-10): the ladder moves on to the capped
 * Claude typical range, exactly as for "no Pexi price", and the prices it set
 * aside travel as context. Claude unavailable: no verdict and no range, so no
 * zone headline; the answer says the estimate is too thin; the reason is logged
 * loudly and put on the scan row. The item's own prices and narrow pools are
 * unchanged. The Claude ask is a stub; no model is called.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { answerBarcodeFromCatalogue, catalogueFaults, resetCatalogueFaultsForTests, type BarcodeDeps } from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';
import type { RangeAskResult } from '../../identify/src/range-ask.ts';

const SELF = '0068100084245';
const AS_OF = '2026-09-27';
const SELF_PATH = ['en:snacks', 'en:biscuits', 'en:sea-salt-cookies'];
const LEAF_OTHERS = SELF_PATH;
const PARENT_OTHERS = ['en:snacks', 'en:biscuits', 'en:other-cookies'];
const SCAN_109 = [718, 1299, 2450, 3199, 4999, 8999, 14249];
const OREO = [878, 1299, 1899, 2547, 3299, 4999, 7390];
const NARROW = [1000, 1050, 1100, 1150, 1200, 1290];

function obs(code: string, cents: number, seller: string): ObservationRow {
  return {
    code,
    seller,
    sellerSku: `${seller}-${code}`,
    sellerName: 'x',
    sellerBrand: null,
    priceCents: cents,
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
  };
}

function world(pool: readonly number[], othersPath: readonly string[], own: readonly number[] = []) {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  ins.run(SELF, 'Sea Salt Coconut Cookies', '300 g', 300, 'g', JSON.stringify(SELF_PATH), SELF_PATH[SELF_PATH.length - 1]!);
  pool.forEach((c, i) => {
    const code = String(3000 + i).padStart(13, '0');
    ins.run(code, `cookie ${i}`, '300 g', 300, 'g', JSON.stringify(othersPath), othersPath[othersPath.length - 1]!);
    recordObservation(prices, obs(code, c, `shop${i}`));
  });
  own.forEach((c, i) => recordObservation(prices, obs(SELF, c, `own${i}`)));
  return { prices, catalogue };
}

const ASKED_AT = '2026-09-27T12:00:00.000Z';
const CLAUDE_OK: RangeAskResult = {
  ok: true,
  range: { lowCents: 400, highCents: 600, currency: 'CAD', unit: 'one 300 g pack', confidence: 'medium', askedAt: ASKED_AT, model: 'stub' },
  cached: false,
};

function asker(result: RangeAskResult) {
  const calls: string[] = [];
  return { calls, askRange: async (id: { name: string }) => (calls.push(id.name), result) };
}

async function scan(w: ReturnType<typeof world>, extra: Partial<BarcodeDeps> = {}, cents = 499) {
  const row = { code: SELF, name: 'Sea Salt Coconut Cookies', brands: 'Oreo', quantity: '300 g', leafCategory: SELF_PATH[SELF_PATH.length - 1]!, categoryPath: SELF_PATH };
  const deps: BarcodeDeps = {
    lookup: { byGtin: () => row },
    prices: w.prices,
    catalogue: w.catalogue,
    country: 'CA',
    currency: 'CAD',
    asOf: AS_OF,
    shopper: { cents },
    ...extra,
  };
  return answerBarcodeFromCatalogue(canonicalBarcode(SELF)!, deps);
}

/** Captures console.warn and console.error while `fn` runs. */
async function logged<T>(fn: () => Promise<T>): Promise<{ out: T; lines: string[] }> {
  const lines: string[] = [];
  const w = console.warn;
  const e = console.error;
  console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  try {
    return { out: await fn(), lines };
  } finally {
    console.warn = w;
    console.error = e;
  }
}

for (const [label, pool, othersPath] of [
  ['scan 109 (a parent pool)', SCAN_109, PARENT_OTHERS],
  ['Oreo (a leaf pool)', OREO, LEAF_OTHERS],
] as const) {
  test(`D-233 ${label}: no zone from the pool; Claude is asked once and its typical range is the answer`, async () => {
    const a = asker(CLAUDE_OK);
    const { answer, record } = await scan(world(pool, othersPath), { askRange: a.askRange as BarcodeDeps['askRange'] });
    assert.equal(a.calls.length, 1, 'one capped ask, shared by the verdict and the range');
    assert.equal(answer.rangeSource, 'claude_typical');
    assert.equal(answer.range?.lowCents, 400);
    assert.equal(answer.range?.highCents, 600);
    assert.equal(answer.verdict?.basis, 'claude_typical');
    assert.notEqual(answer.verdict?.shopper?.zone, 'great');
    // The prices set aside still travel, as context ("Prices Pexi has seen").
    assert.deepEqual(answer.widePool?.cents, [...pool].sort((x, y) => x - y));
    assert.equal(answer.widePool?.n, pool.length);
    assert.equal(record.rangeMissReason, 'pool_too_wide', 'the scan row says which way it went');
  });

  test(`D-233 ${label}: Claude unavailable means no verdict, no range, too thin, logged loudly and on the row`, async () => {
    resetCatalogueFaultsForTests();
    const a = asker({ ok: false, reason: 'monthly_cap_reached' });
    const { out, lines } = await logged(() => scan(world(pool, othersPath), { askRange: a.askRange as BarcodeDeps['askRange'] }));
    const { answer, record } = out;
    assert.equal(a.calls.length, 1, 'Claude was asked');
    assert.equal(answer.verdict, null, 'no verdict, so no zone headline and nothing for a typed price to be placed on');
    assert.equal(answer.range, null);
    assert.equal(answer.noRangeReason, 'pool_too_wide');
    assert.deepEqual(answer.widePool?.cents, [...pool].sort((x, y) => x - y));
    assert.equal(record.verdict, null);
    assert.equal(record.rangeMissReason, 'pool_too_wide:monthly_cap_reached');
    assert.ok(lines.some((l) => l.startsWith('[catalogue-fault] pool_too_wide') && l.includes('monthly_cap_reached')), lines.join('|'));
    assert.ok((catalogueFaults().pool_too_wide ?? 0) >= 1);
  });

  test(`D-233 ${label}: no ask wired at all is too thin as well`, async () => {
    const { out } = await logged(() => scan(world(pool, othersPath)));
    assert.equal(out.answer.verdict, null);
    assert.equal(out.answer.range, null);
    assert.equal(out.answer.noRangeReason, 'pool_too_wide');
    assert.equal(out.record.rangeMissReason, 'pool_too_wide:no_ask');
  });
}

test('D-233: a narrow pool still answers from the pool, with its zone, and never asks Claude', async () => {
  const a = asker(CLAUDE_OK);
  const { answer, record } = await scan(world(NARROW, LEAF_OTHERS), { askRange: a.askRange as BarcodeDeps['askRange'] }, 700);
  assert.equal(a.calls.length, 0);
  assert.equal(answer.rangeSource, 'shin_prices');
  assert.equal(answer.range?.basis, 'leaf_category');
  assert.equal(answer.verdict?.basis, 'leaf_category');
  assert.equal(answer.verdict?.shopper?.zone, 'great');
  assert.equal(answer.widePool, undefined);
  assert.equal(record.rangeMissReason, null);
});

test('D-233: the item\'s own prices are untouched by a wide pool beside them', async () => {
  const a = asker(CLAUDE_OK);
  const { answer } = await scan(world(OREO, LEAF_OTHERS, [1999, 2049, 2099]), { askRange: a.askRange as BarcodeDeps['askRange'] }, 1999);
  assert.equal(a.calls.length, 0);
  assert.equal(answer.range?.basis, 'this_product');
  assert.equal(answer.verdict?.basis, 'own_prices');
  assert.ok(answer.verdict?.shopper);
  assert.equal(answer.widePool, undefined);
});

test('D-235: a wide leaf set aside while the verdict stands on the narrow parent: the row says shin_prices, parent_category', async () => {
  // Live scans 122 to 125: the sheet said "Great price" on a parent_category verdict and the row said none / none.
  const w = world(SCAN_109, LEAF_OTHERS);
  const ins = w.catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  for (let r = 0; r < 15; r += 1) {
    NARROW.forEach((c, i) => {
      const code = String(5000 + r * 10 + i).padStart(13, '0');
      ins.run(code, `sibling ${r}-${i}`, '300 g', 300, 'g', JSON.stringify(PARENT_OTHERS), PARENT_OTHERS[PARENT_OTHERS.length - 1]!);
      recordObservation(w.prices, obs(code, c, `sib${r}-${i}`));
    });
  }
  const { answer, record } = await logged(() => scan(w, {}, 499)).then((l) => l.out);
  assert.equal(answer.verdict?.basis, 'parent_category');
  assert.equal(answer.verdict?.shopper?.zone, 'great');
  assert.equal(record.rangeSource, 'shin_prices');
  assert.equal(record.rangeBasis, 'parent_category');
});
