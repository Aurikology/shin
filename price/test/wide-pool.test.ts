/**
 * D-233 (critical, calibration): a category pool too wide to mean anything must
 * not price an item that has no price of its own.
 *
 * Live scan 109: an item with no price of its own was priced from a parent pool
 * of 7 prices, $7.18 to $142.49, and the headline said "Great price" for $4.99.
 * The PC run: Oreo Sea Salt Coconut got $8.78 to $73.90, typical $25.47, "Great
 * price" at $3.99. The width flag (width-flag.ts, p90/p10 above 1.5x by
 * bootstrap) existed and nothing in the answer path called it.
 *
 * The decision (stated to Jamin, 2026-10-10): when the only basis is a category
 * pool and that pool is flagged too wide, the pool sets neither the centre, the
 * range nor the zone; the ladder goes on to the capped Claude typical range. If
 * Claude does not answer, there is no zone and the answer says the estimate is
 * too thin. The item's own prices, and narrow pools, are unchanged.
 *
 * Every database is in memory; the Claude rung is a stub that counts its calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type ClaudeAnswer, type EstimateItem } from '../src/estimate.ts';
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

/** Scan 109's pool: 7 prices, $7.18 to $142.49. */
const SCAN_109 = [718, 1299, 2450, 3199, 4999, 8999, 14249];
/** The Oreo pool: $8.78 to $73.90, typical $25.47. */
const OREO = [878, 1299, 1899, 2547, 3299, 4999, 7390];
/** Six prices within 1.3x: narrow, so it still answers. */
const NARROW = [1000, 1050, 1100, 1150, 1200, 1290];

const SELF_PATH = ['en:snacks', 'en:biscuits', 'en:sea-salt-cookies'];
/** In the leaf itself. */
const LEAF_OTHERS = SELF_PATH;
/** A sibling leaf, so only the parent (en:biscuits) holds them: scan 109's shape. */
const PARENT_OTHERS = ['en:snacks', 'en:biscuits', 'en:other-cookies'];

function world(pool: readonly number[], othersPath: readonly string[], own: readonly number[] = []) {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare(
    'INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  ins.run(SELF, 'Sea Salt Coconut Cookies', null, 'Oreo', '300 g', 300, 'g', JSON.stringify(SELF_PATH), SELF_PATH[SELF_PATH.length - 1]!);
  pool.forEach((c, i) => {
    const code = `20000000000${i}`;
    ins.run(code, `Cookie ${i}`, null, `B${i}`, '300 g', 300, 'g', JSON.stringify(othersPath), othersPath[othersPath.length - 1]!);
    recordObservation(prices, obs({ code, priceCents: c, seller: `shop${i}` }));
  });
  own.forEach((c, i) => recordObservation(prices, obs({ code: SELF, priceCents: c, seller: `own${i}` })));
  return { prices, catalogue };
}

const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({ barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA', ...over });

function claude(answer: ClaudeAnswer) {
  const calls: string[] = [];
  return {
    calls,
    ask: async (id: { name: string }): Promise<ClaudeAnswer> => {
      calls.push(id.name);
      return answer;
    },
  };
}

const CLAUDE_OK: ClaudeAnswer = { ok: true, lowCents: 400, highCents: 600, currency: 'CAD' };

for (const [label, pool, othersPath, rung] of [
  ['scan 109 (a parent pool, $7.18 to $142.49)', SCAN_109, PARENT_OTHERS, 'parent_category'],
  ['Oreo (a leaf pool, $8.78 to $73.90)', OREO, LEAF_OTHERS, 'leaf_category'],
] as const) {
  test(`D-233 ${label}: the wide pool sets no centre, range or zone; Claude is asked and answers`, async () => {
    const w = world(pool, othersPath);
    const c = claude(CLAUDE_OK);
    const { verdict, trace } = await estimate(item(), { cents: 499 }, { prices: w.prices, catalogue: w.catalogue, askClaude: c.ask });
    assert.equal(c.calls.length, 1, 'the ladder moved on to the capped Claude ask');
    assert.equal(verdict.basis, 'claude_typical');
    assert.equal(verdict.spreadFrom, 'claude', 'the wide pool does not set the spread either');
    assert.equal(verdict.centreCents, Math.round(Math.sqrt(400 * 600)));
    assert.ok(Math.abs(verdict.p10Cents - 400) <= 2 && Math.abs(verdict.p90Cents - 600) <= 2, `${verdict.p10Cents}..${verdict.p90Cents}`);
    assert.notEqual(verdict.shopper?.zone, 'great', 'not "Great price" against the wide pool');
    const step = trace.tried.find((t) => t.rung === rung);
    assert.equal(step?.outcome, 'too_wide');
    // The prices it set aside still travel, as context.
    assert.deepEqual(trace.widePool?.cents, [...pool].sort((a, b) => a - b));
    assert.equal(trace.widePool?.rung, rung);
    assert.equal(trace.tooThin, null);
  });

  test(`D-233 ${label}: Claude unavailable, so no zone, the estimate says it is too thin, and why`, async () => {
    for (const [ask, why] of [
      [claude({ ok: false, reason: 'monthly_cap_reached' }).ask, 'monthly_cap_reached'],
      [undefined, 'no_ask'],
      [async (): Promise<ClaudeAnswer> => { throw new Error('boom'); }, 'threw'],
    ] as const) {
      const w = world(pool, othersPath);
      const { verdict, trace } = await estimate(item(), { cents: 499 }, { prices: w.prices, catalogue: w.catalogue, ...(ask ? { askClaude: ask } : {}) });
      assert.equal(verdict.shopper, null, `${why}: no zone`);
      assert.ok(verdict.notes.includes('too_thin'), `${why}: says too thin`);
      assert.notEqual(verdict.basis, rung, `${why}: never the wide pool's rung`);
      assert.deepEqual(trace.tooThin, { why });
    }
  });
}

test('D-233: Claude too slow is too thin as well', async () => {
  const w = world(SCAN_109, PARENT_OTHERS);
  const slow = () => new Promise<ClaudeAnswer>((r) => setTimeout(() => r(CLAUDE_OK), 200));
  const { verdict, trace } = await estimate(item(), { cents: 499 }, { prices: w.prices, catalogue: w.catalogue, askClaude: slow, claudeWaitMs: 10 });
  assert.equal(verdict.shopper, null);
  assert.deepEqual(trace.tooThin, { why: 'timeout' });
});

test('D-233: a narrow pool (6 prices within 1.3x) still answers from the pool and never asks Claude', async () => {
  const w = world(NARROW, LEAF_OTHERS);
  const c = claude(CLAUDE_OK);
  const { verdict, trace } = await estimate(item(), { cents: 700 }, { prices: w.prices, catalogue: w.catalogue, askClaude: c.ask });
  assert.equal(c.calls.length, 0);
  assert.equal(verdict.basis, 'leaf_category');
  assert.equal(verdict.spreadFrom, 'leaf_category');
  assert.equal(verdict.shopper?.zone, 'great');
  assert.equal(trace.widePool, null);
  assert.equal(trace.tooThin, null);
});

test('D-233: the item\'s own prices are untouched by a wide pool beside them', async () => {
  const w = world(OREO, LEAF_OTHERS, [1999, 2099]);
  const c = claude(CLAUDE_OK);
  const { verdict, trace } = await estimate(item(), { cents: 1999 }, { prices: w.prices, catalogue: w.catalogue, askClaude: c.ask });
  assert.equal(c.calls.length, 0);
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.spreadFrom, 'leaf_category');
  // The blend the design states: mu = (n * mu_own + 1 * mu_leaf) / (n + 1), as before.
  // The median of two shops is the lower one (nearest rank).
  const muOwn = Math.log(1999);
  assert.equal(verdict.centreCents, Math.round(Math.exp((2 * muOwn + Math.log(2547)) / 3)));
  assert.ok(verdict.shopper !== null);
  assert.equal(trace.widePool, null);
  assert.equal(trace.tooThin, null);
});

/* ---------------------------------------------------------- range.ts */

/*
 * The range ladder still computes the category range (its math stays pinned by
 * range.test.ts) and flags it; the answer path (app/src/catalogue-first.ts)
 * sets a flagged one aside. app/test/wide-pool-answer.test.ts proves that half.
 */
test('D-233 range: a wide leaf pool and a wide parent pool are flagged wide', () => {
  for (const [pool, othersPath, rung] of [
    [OREO, LEAF_OTHERS, 'leaf_category'],
    [SCAN_109, PARENT_OTHERS, 'parent_category'],
  ] as const) {
    const w = world(pool, othersPath);
    const r = priceRangeFor({ barcode: SELF, asOf: AS_OF }, { prices: w.prices, catalogue: w.catalogue });
    assert.equal(r.basis, rung);
    assert.ok((r.basis === 'leaf_category' || r.basis === 'parent_category') && r.wide === true, rung);
  }
});

test('D-233 range: a narrow pool is not flagged', () => {
  const w = world(NARROW, LEAF_OTHERS);
  const r = priceRangeFor({ barcode: SELF, asOf: AS_OF }, { prices: w.prices, catalogue: w.catalogue });
  assert.equal(r.basis, 'leaf_category');
  assert.ok(r.basis === 'leaf_category' && r.wide === false);
});
