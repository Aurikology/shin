/**
 * REQUIREMENT 6.3, the gate: "keep [Claude's estimates] out of any category with 5+ observed prices.
 * Pass when 0 estimates in those categories." Plan Part 6: "a gate at read time and a control."
 *
 * The control is the sweep's second half: the same check run over the ungated estimates must find
 * the contamination, so a gate that silently stopped working (or a check that cannot fail) turns
 * this file red. Removing the gate line in estimate-gate.ts turns four of these five tests red.
 *
 * Every database is in memory; the estimates log is in an OS temp folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import {
  ESTIMATE_GATE_OBSERVED,
  categoryKey,
  estimatesForCategory,
  observedPricesIn,
  readStoredEstimates,
  type StoredEstimate,
} from '../src/estimate-gate.ts';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null, seller: 'bcldb', sellerSku: `sku-${sku}`, sellerName: 'Thing', sellerBrand: null, priceCents: 1000,
    kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null,
    joinMethod: 'gtin', seenOn: '2026-09-20', url: null, imageUrl: null, inStock: null, ...over,
  };
}

/** A category per entry of `counts`, holding that many observed regular prices. */
function world(counts: Record<string, number>) {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, category_path, leaf_category) VALUES (?,?,?,?)');
  let c = 0;
  for (const [tag, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      c += 1;
      const code = `7${String(c).padStart(12, '0')}`;
      ins.run(code, `P${c}`, JSON.stringify(['en:root', tag]), tag);
      recordObservation(prices, obs({ code, priceCents: 300 + i, seller: `s${c}` }));
    }
  }
  return { prices, catalogue };
}

const est = (category: string | null, item = 'x'): StoredEstimate => ({
  kind: 'estimate', item, category, lowCents: 300, highCents: 500, currency: 'CAD', model: 'claude-haiku-4-5-20251001', askedAt: '2026-10-13T00:00:00Z',
});

test('6.3 gate: a category with 5+ observed prices reads 0 estimates; one with fewer reads its own, and only its own', () => {
  const w = world({ 'en:cookies': 8, 'en:balms': 2, 'en:edge': ESTIMATE_GATE_OBSERVED, 'en:under': ESTIMATE_GATE_OBSERVED - 1 });
  const all = [est('Cookies'), est('cookies'), est('Balms'), est('Edge'), est('Under'), est(null)];
  assert.equal(observedPricesIn(w.prices, w.catalogue, 'en:cookies'), 8);
  assert.deepEqual(estimatesForCategory('en:cookies', all, observedPricesIn(w.prices, w.catalogue, 'en:cookies')), []);
  assert.deepEqual(estimatesForCategory('en:edge', all, observedPricesIn(w.prices, w.catalogue, 'en:edge')), [], 'exactly 5 is gated');
  assert.equal(estimatesForCategory('en:under', all, observedPricesIn(w.prices, w.catalogue, 'en:under')).length, 1, '4 is not');
  assert.deepEqual(
    estimatesForCategory('en:balms', all, observedPricesIn(w.prices, w.catalogue, 'en:balms')).map((e) => e.category),
    ['Balms'],
  );
});

test('6.3 gate fails closed: an observed count that is not a number reads no estimates', () => {
  assert.deepEqual(estimatesForCategory('en:balms', [est('Balms')], Number.NaN), []);
});

test('6.3 sweep with control: 500 random categories; 0 estimates read into any with 5+ observed prices, and the ungated read would have put some there', () => {
  let s = 63;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tags = Array.from({ length: 500 }, (_, i) => `en:cat-${i}`);
  const counts: Record<string, number> = {};
  for (const t of tags) counts[t] = Math.floor(r() * 11);
  const w = world(counts);
  const estimates = tags.flatMap((t) => (r() < 0.6 ? [est(t.replace('en:', '').replace(/-/g, ' '), t)] : []));
  let gatedLeak = 0;
  let ungatedLeak = 0;
  let readBelow = 0;
  for (const t of tags) {
    const n = observedPricesIn(w.prices, w.catalogue, t);
    assert.equal(n, counts[t]);
    const read = estimatesForCategory(t, estimates, n);
    // The control: what an ungated read of this category would hold.
    const ungated = estimates.filter((e) => categoryKey(e.category) === categoryKey(t));
    if (n >= ESTIMATE_GATE_OBSERVED) {
      gatedLeak += read.length;
      ungatedLeak += ungated.length;
    } else {
      readBelow += read.length;
      assert.equal(read.length, ungated.length, `${t}: below the gate every estimate of the category is read`);
    }
  }
  assert.equal(gatedLeak, 0, 'estimates read into a category with 5+ observed prices');
  assert.ok(ungatedLeak > 0, 'control: without the gate the check finds estimates there, so it can go red');
  assert.ok(readBelow > 0, 'control: the gate is not simply returning nothing');
});

test('6.3 observed means observed: a sale row is not counted toward the 5', () => {
  const w = world({ 'en:jam': 4 });
  const code = (w.catalogue.prepare(`SELECT code FROM product WHERE leaf_category = 'en:jam' LIMIT 1`).get() as { code: string }).code;
  recordObservation(w.prices, obs({ code, kind: 'promotional', seller: 'sale1' }));
  assert.equal(observedPricesIn(w.prices, w.catalogue, 'en:jam'), 4, 'a sale is not an observed regular price');
  assert.equal(estimatesForCategory('en:jam', [est('Jam')], observedPricesIn(w.prices, w.catalogue, 'en:jam')).length, 1);
  recordObservation(w.prices, obs({ code, seller: 'regular5' }));
  assert.equal(estimatesForCategory('en:jam', [est('Jam')], observedPricesIn(w.prices, w.catalogue, 'en:jam')).length, 0);
});

test('6.3 read back as estimates: only valid ranges from the answers log, each kind "estimate"; refusals and junk lines skipped', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'shin-estimate-gate-')), 'range-ask.answers.jsonl');
  const row = (outcome: string, raw: unknown) => JSON.stringify({ key: 'k', item: 'Balm', category: 'Balms', askedAt: '2026-10-13T00:00:00Z', model: 'm', outcome, raw });
  writeFileSync(path, [
    row('ok', { known: true, low_cents: 300, high_cents: 500, currency: 'CAD', unit: 'each', confidence: 'low' }),
    row('model_does_not_know', { known: false, low_cents: null, high_cents: null }),
    row('transport_error', null),
    row('ok', { known: true, low_cents: 900, high_cents: 100, currency: 'CAD' }),
    '{ not json',
    '',
  ].join('\n'));
  const { estimates, skipped } = readStoredEstimates(path);
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0]!.kind, 'estimate');
  assert.deepEqual([estimates[0]!.lowCents, estimates[0]!.highCents, estimates[0]!.category], [300, 500, 'Balms']);
  assert.equal(skipped, 4);
  assert.deepEqual(readStoredEstimates(join(tmpdir(), 'no-such-file-6-3.jsonl')), { estimates: [], skipped: 0 });
});
