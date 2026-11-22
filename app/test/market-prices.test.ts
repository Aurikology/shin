/**
 * Prices never cross markets (2026-11-22, before US prices were loaded).
 *
 * A US shopper (market country US, currency USD) is answered only from USD rows, and a Canadian shopper
 * (CA, CAD) never sees a USD row. Two places pick the rows:
 *   - the range estimate, which reads `WHERE currency = <the request's currency>` (price/src/estimate.ts);
 *   - the typed answer's price list (own-prices.ts), which had no currency filter until this change and
 *     now takes the market's currency from the server.
 * One barcode is priced in both currencies at different amounts, so a row from the wrong market shows
 * up as the wrong number.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-market-prices-'));
const pricesPath = join(dir, 'prices.db');
after(() => rmSync(dir, { recursive: true, force: true }));

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { clearEstimateCache, estimate } = await import('../../price/src/estimate.ts');
const { lookupOwnPricesByBarcode, lookupOwnPrices, inMarketCurrency } = await import('../src/own-prices.ts');

const CODE = '0062639298517';
const US_ONLY = '0049000028911';

const w = openPrices(pricesPath);
function put(o: { code: string | null; gtin?: string; seller: string; sku: string; cents: number; currency: string; country: string; store: string }) {
  recordObservation(w, {
    code: o.code,
    seller: o.seller,
    sellerSku: o.sku,
    sellerName: 'Rolled Oats 1 kg',
    sellerBrand: 'Quaker',
    priceCents: o.cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: o.currency,
    country: o.country,
    region: null,
    joinMethod: o.code ? 'gtin' : 'none',
    pageGtin: o.gtin ?? null,
    seenOn: '2026-11-01',
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: o.store,
    storeCity: null,
  });
}
// The same barcode, priced in both markets.
put({ code: CODE, seller: 'cad-shop', sku: 'c1', cents: 400, currency: 'CAD', country: 'CA', store: 'Maple Market' });
put({ code: CODE, seller: 'usd-shop', sku: 'u1', cents: 300, currency: 'USD', country: 'US', store: 'Lone Star Grocer' });
// An unjoined US row, found by its page_gtin.
put({ code: null, gtin: US_ONLY, seller: 'usd-shop', sku: 'u2', cents: 250, currency: 'USD', country: 'US', store: 'Lone Star Grocer' });
w.close();

const sources = { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'none.db') };
const stores = (m: { prices: readonly { store: string }[] } | null) => (m ? m.prices.map((p) => p.store).sort() : null);
const currencies = (m: { prices: readonly { currency: string }[] } | null) => (m ? [...new Set(m.prices.map((p) => p.currency))] : null);

test('estimate: a USD request is priced from USD rows only, a CAD request from CAD rows only', async () => {
  const item = { barcode: CODE, name: 'Rolled Oats', size: '1 kg', region: null, asOf: '2026-11-08' };
  const read = () => new DatabaseSync(pricesPath, { readOnly: true });
  clearEstimateCache();
  const r1 = read();
  const us = await estimate({ ...item, currency: 'USD', country: 'US' }, null, { prices: r1 });
  r1.close();
  clearEstimateCache();
  const r2 = read();
  const ca = await estimate({ ...item, currency: 'CAD', country: 'CA' }, null, { prices: r2 });
  r2.close();
  clearEstimateCache();
  assert.equal(us.verdict.currency, 'USD');
  assert.equal(us.verdict.centreCents, 300, 'the US answer must stand on the US price alone');
  assert.equal(us.trace.ownShops, 1);
  assert.equal(ca.verdict.currency, 'CAD');
  assert.equal(ca.verdict.centreCents, 400, 'the Canadian answer must never see the USD row');
  assert.equal(ca.trace.ownShops, 1);
});

test('estimate: a USD request for a barcode only Canada prices is not answered from CAD rows', async () => {
  const w2 = openPrices(join(dir, 'cad-only.db'));
  recordObservation(w2, {
    code: '0062639298999', seller: 'cad-shop', sellerSku: 'x', sellerName: 'Tuna 170 g', sellerBrand: null, priceCents: 300,
    kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin',
    seenOn: '2026-11-01', url: null, imageUrl: null, inStock: null,
  });
  w2.close();
  clearEstimateCache();
  const r = new DatabaseSync(join(dir, 'cad-only.db'), { readOnly: true });
  const us = await estimate({ barcode: '0062639298999', name: 'Tuna', size: '170 g', region: null, asOf: '2026-11-08', currency: 'USD', country: 'US' }, null, { prices: r });
  r.close();
  clearEstimateCache();
  assert.equal(us.trace.ownShops, 0);
  assert.notEqual(us.verdict.basis, 'own_prices');
});

test('typed answer by barcode: USD sees USD rows only, CAD sees CAD rows only', () => {
  const us = lookupOwnPricesByBarcode(CODE, { ...sources, currency: 'USD' }).match;
  const ca = lookupOwnPricesByBarcode(CODE, { ...sources, currency: 'CAD' }).match;
  assert.deepEqual(stores(us), ['Lone Star Grocer']);
  assert.deepEqual(currencies(us), ['USD']);
  assert.deepEqual(stores(ca), ['Maple Market']);
  assert.deepEqual(currencies(ca), ['CAD']);
});

test('typed answer by barcode: a blank or unknown market reads as CAD, never as USD', () => {
  const unknown = lookupOwnPricesByBarcode(CODE, { ...sources, currency: null }).match;
  const blank = lookupOwnPricesByBarcode(CODE, { ...sources, currency: '  ' }).match;
  assert.deepEqual(currencies(unknown), ['CAD']);
  assert.deepEqual(currencies(blank), ['CAD']);
  // And a Canadian shopper asking for a barcode only the US prices gets nothing, not a USD row.
  assert.equal(lookupOwnPricesByBarcode(US_ONLY, { ...sources, currency: 'CAD' }).match, null);
  assert.deepEqual(currencies(lookupOwnPricesByBarcode(US_ONLY, { ...sources, currency: 'USD' }).match), ['USD']);
});

test('typed answer by name: the same split holds', () => {
  const us = lookupOwnPrices('quaker rolled oats', { ...sources, currency: 'USD' }).match;
  const ca = lookupOwnPrices('quaker rolled oats', { ...sources, currency: 'CAD' }).match;
  assert.deepEqual(currencies(us), ['USD']);
  assert.deepEqual(currencies(ca), ['CAD']);
});

test('the filter itself: other currencies are dropped, case and spaces ignored', () => {
  const p = (currency: string) => ({ store: 's', amount: 1, currency, observedAt: '2026-11-01', url: null, kind: null, from: 'prices' as const, trusted: false as const });
  const list = [p('CAD'), p('USD'), p(' usd ')];
  assert.equal(inMarketCurrency(list, 'usd').length, 2);
  assert.equal(inMarketCurrency(list, 'CAD').length, 1);
  assert.equal(inMarketCurrency(list, undefined).length, 3);
});
