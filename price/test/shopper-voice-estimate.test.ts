/**
 * The estimate takes shoppers' prices for a product as ONE voice (`deps.shopperVoice`, docs/decisions.md
 * 2026-11-15 "Shopper prices"): a product with no shop price is priced from it, with low confidence; a product
 * with one shop price gets it as a second price, still low; a product with 2 or more shop prices ignores it.
 * Every database is in memory; no model is called.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type EstimateDeps, type EstimateItem } from '../src/estimate.ts';

const AS_OF = '2026-11-15';
const SELF = '0068100090011';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: SELF,
    seller: 'alpha',
    sellerSku: `sku-${sku}`,
    sellerName: 'Smooth Peanut Butter 1 kg',
    sellerBrand: null,
    priceCents: 1000,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: 'gtin',
    seenOn: '2026-11-10',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({ barcode: SELF, name: 'Smooth Peanut Butter', region: 'Ontario', country: 'CA', asOf: AS_OF, ...over });
const noClaude: EstimateDeps['askClaude'] = async () => ({ ok: false, reason: 'test' });
const voice = (cents: number, devices = 1) => (code: string) => (code === '68100090011' ? { cents, seenOn: '2026-11-14', region: 'ON', devices } : null);

test('shopper price alone: the product is priced from it, as own prices, with low confidence', async () => {
  const { verdict, trace } = await estimate(item(), null, { prices: openPrices(':memory:'), askClaude: noClaude, shopperVoice: voice(649) });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.centreCents, 649);
  assert.equal(verdict.confidence, 'low');
  assert.equal(verdict.n, 1);
  assert.equal(trace.ownShops, 1);
  assert.equal(verdict.dots.length, 1);
  assert.equal(verdict.dots[0]!.cents, 649);
});

test('many devices are still one voice: low confidence, n = 1', async () => {
  const { verdict } = await estimate(item(), null, { prices: openPrices(':memory:'), askClaude: noClaude, shopperVoice: voice(649, 12) });
  assert.equal(verdict.n, 1);
  assert.equal(verdict.confidence, 'low');
});

test('one shop price plus the voice: two prices, still low confidence', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 599 }));
  const { verdict } = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: voice(699) });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 2);
  assert.equal(verdict.confidence, 'low');
  assert.equal(verdict.dots.length, 2);
});

test('two shop prices: the voice is ignored, the answer is exactly what it was without it', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 599 }));
  recordObservation(prices, obs({ priceCents: 649, seller: 'beta' }));
  const without = await estimate(item(), null, { prices, askClaude: noClaude });
  const withVoice = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: voice(99_999) });
  assert.deepEqual(withVoice.verdict, without.verdict);
});

test('a voice for another product changes nothing, and a throwing voice is no voice', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 599 }));
  const without = await estimate(item(), null, { prices, askClaude: noClaude });
  const other = await estimate(item({ barcode: '0068100090028' }), null, { prices, askClaude: noClaude, shopperVoice: voice(1) });
  assert.equal(other.verdict.dots.every((d) => d.cents !== 1), true);
  const thrown = await estimate(item(), null, {
    prices,
    askClaude: noClaude,
    shopperVoice: () => {
      throw new Error('store gone');
    },
  });
  assert.deepEqual(thrown.verdict, without.verdict);
});
