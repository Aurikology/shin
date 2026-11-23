import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadObservations, readCatalogueInfo } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { isFold, splitByProduct } from '../src/split.ts';
import { evaluate, evaluateAsync, trainingDatabase } from '../src/harness.ts';
import { liveEstimateModel } from '../src/live-estimate.ts';
import { lastRungRange, safeEstimate } from '../../app/src/catalogue-first.ts';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { rng } from '../src/audit.ts';
import { noSealed } from './fixture.ts';

/** A tight market: 3 leaves of 40 same-size products each, a leaf's products within about 15% of each other, 4 shops, 4 weeks. */
function tightMarket() {
  const r = rng(11);
  const gauss = () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  const prices = openPrices(':memory:');
  const cat = new DatabaseSync(':memory:');
  cat.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = cat.prepare('INSERT INTO product VALUES (?,?,?,?,?,?,?)');
  const leaves = [{ tag: 'en:pasta', base: 300 }, { tag: 'en:rice', base: 650 }, { tag: 'en:flour', base: 900 }];
  const shops = [1, 1.04, 0.97, 1.06];
  const weeks = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'];
  let n = 0;
  prices.exec('BEGIN');
  for (const l of leaves) {
    for (let j = 0; j < 40; j++) {
      const code = `66${String(++n).padStart(10, '0')}`;
      const base = l.base * Math.exp(gauss() * 0.1);
      ins.run(code, `item ${n}`, '500 g', 500, 'g', JSON.stringify(['en:root', l.tag]), l.tag);
      shops.forEach((f, si) => {
        for (const w of weeks) {
          recordObservation(prices, {
            code, seller: `S${si}`, sellerSku: `S${si}-${code}`, sellerName: `item ${n}`, sellerBrand: null,
            priceCents: Math.max(1, Math.round(base * f * Math.exp(gauss() * 0.01))), kind: 'regular', unitPriceCents: null, unitLabel: null,
            currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: w, url: null, imageUrl: null, inStock: null, isSale: 0,
          } as never);
        }
      });
    }
  }
  prices.exec('COMMIT');
  return { prices, catalogue: cat };
}

const market = tightMarket();
const obs = loadObservations(market.prices);
const pred = buildPredictionKey(obs);
const sales = buildSaleKey(obs);
const catalogue = market.catalogue;

function fold() {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  return f;
}

test('live_estimate: scored through the harness on the by-product fold, claims 0.8, answers from a category basis', async () => {
  const f = fold();
  const model = liveEstimateModel();
  assert.equal(model.claimedCoverage, 0.8);
  const run = await evaluateAsync(model, f, { catalogue });
  assert.equal(run.ran, true);
  assert.ok(run.scores && run.scores.scored > 0);
  const extra = run.extra as { answeredBy: Record<string, number>; skipped: Record<string, number> };
  assert.equal(extra.answeredBy.own_prices, undefined, 'by product, the product own prices are absent');
  assert.ok(Object.values(extra.answeredBy).reduce((a, b) => a + b, 0) > 0);
});

test('live_estimate: the range is exactly what the app last rung shows for the same item', async () => {
  const f = fold();
  const trainDb = trainingDatabase(f.train);
  const p = f.testPoints[0]!;
  const info = readCatalogueInfo(catalogue, [p.key]).get(p.key)!;
  const answer = await liveEstimateModel().fitAsync!({ fold: f.name, observations: f.train, prices: trainDb, catalogue })({ key: p.key, code: p.key, asOf: p.seenOn, info });
  const est = await safeEstimate(
    { barcode: p.key, name: info.name, brand: null, size: info.size, leafCategory: info.leaf, categoryPath: info.path, region: null, country: null, currency: 'CAD', asOf: p.seenOn },
    null,
    { prices: trainDb, catalogue, taxonomy: null },
    { grade: 'sure' },
  );
  const last = lastRungRange(est, 'CAD');
  assert.equal(last.source, 'shin_estimate');
  assert.ok(answer);
  assert.equal(answer.lowCents, last.range.lowCents);
  assert.equal(answer.highCents, last.range.highCents);
});

test('live_estimate: where the app would show the fixed prior it gives no answer and counts a skip', async () => {
  const f = fold();
  const trainDb = trainingDatabase(f.train);
  const model = liveEstimateModel();
  const predict = model.fitAsync!({ fold: f.name, observations: f.train, prices: trainDb, catalogue });
  // A product the catalogue does not know, no category, no prices: lastRungRange falls to fixed_prior.
  const a = await predict({ key: '99999999999', code: '99999999999', asOf: '2026-09-20', info: null });
  assert.equal(a, null);
  const skipped = (model.report!() as { skipped: Record<string, number> }).skipped;
  assert.equal(Object.values(skipped).reduce((x, y) => x + y, 0), 1);
  assert.ok(Object.keys(skipped).every((k) => k.startsWith('fixed_prior')), JSON.stringify(skipped));
});

test('a model that answers asynchronously is refused by the sync evaluate, not silently scored', () => {
  assert.throws(() => evaluate(liveEstimateModel(), fold(), { catalogue }), /evaluateAsync/);
});
