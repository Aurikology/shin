/**
 * What every scan request says about WHERE and HOW the user shops (beta gap
 * items 18 and 19): the market they chose, their language, and the shop they
 * tapped. Without these the one Gemini call cannot apply the market rules or the
 * alternatives modes. The pure builder is checked alone, then the real api.js
 * against a stub fetch, on all three scan routes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { scanContextFrom } = await import('../public/js/lib/scan-body.js');

test('the context holds only what the user gave, and never invents a market', () => {
  assert.deepEqual(scanContextFrom({}), {});
  assert.deepEqual(scanContextFrom(), {});
  assert.deepEqual(scanContextFrom({ market: { country: '', currency: null }, language: ' ', shop: { name: '', hint: null } }), {});
  assert.deepEqual(
    scanContextFrom({
      market: { country: 'United Kingdom', currency: 'GBP' },
      language: 'fr-CA',
      shop: { id: 'node/1', name: 'Corner Shop', hint: 'convenience store' },
    }),
    { market: 'United Kingdom', currency: 'GBP', countryCode: 'GB', language: 'fr-CA', storeName: 'Corner Shop', storeHint: 'convenience store' },
  );
});

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ product: null }) };
};
const store = await import('../public/js/store.js');
const api = await import('../public/js/api.js');

test('a scan on every route carries the market, the language and the shop', async () => {
  store.setMarket('France', 'EUR');
  api.setScanShopProvider(() => ({ id: 'node/9', name: 'Le Marche', hint: 'supermarket' }));
  try {
    calls.length = 0;
    await api.identify({ gtin: '0123456789012', shelfPriceCents: 499 });
    const u = new URL(calls[0].url, 'http://x');
    assert.equal(u.searchParams.get('market'), 'France', 'the barcode route lost the market');
    assert.equal(u.searchParams.get('currency'), 'EUR');
    assert.equal(u.searchParams.get('storeName'), 'Le Marche');
    assert.equal(u.searchParams.get('storeHint'), 'supermarket');
    assert.ok(u.searchParams.get('language'), 'the barcode route lost the language');

    calls.length = 0;
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
    await api.identifyPhoto(blob, { sharpness: 0.5 });
    const photo = JSON.parse(calls[0].init.body);
    assert.equal(photo.market, 'France', 'the photo route lost the market');
    assert.equal(photo.storeHint, 'supermarket');
    assert.ok(photo.language);

    calls.length = 0;
    await api.price({ text: 'x' });
    const priced = JSON.parse(calls[0].init.body);
    assert.equal(priced.market, 'France', 'the price route lost the market');
    assert.equal(priced.currency, 'EUR');
    calls.length = 0;
    await api.price({ text: 'x', market: 'Canada' });
    assert.equal(JSON.parse(calls[0].init.body).market, 'Canada', 'the caller no longer wins');
  } finally {
    api.setScanShopProvider(null);
    store.setMarket('Canada', 'CAD');
  }
});

test('with no shop picked no shop is sent, and a provider that throws never breaks the scan', async () => {
  api.setScanShopProvider(null);
  calls.length = 0;
  await api.identify({ gtin: '0123456789012' });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.has('storeName'), false);
  assert.equal(u.searchParams.has('storeHint'), false);
  api.setScanShopProvider(() => {
    throw new Error('boom');
  });
  try {
    calls.length = 0;
    await api.identify({ gtin: '0123456789012' });
    assert.equal(calls.length, 1, 'a failing shop lookup stopped the scan');
  } finally {
    api.setScanShopProvider(null);
  }
});

test('the chosen region and country code ride on every scan route (rows 14, 15)', async () => {
  store.setMarket('Canada', 'CAD', 'CA');
  store.setRegion('Ontario');
  try {
    calls.length = 0;
    await api.identify({ gtin: '0123456789012' });
    const u = new URL(calls[0].url, 'http://x');
    assert.equal(u.searchParams.get('region'), 'Ontario', 'the barcode route lost the region');
    assert.equal(u.searchParams.get('countryCode'), 'CA', 'the barcode route lost the country code');

    calls.length = 0;
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
    await api.identifyPhoto(blob, { sharpness: 0.5 });
    const photo = JSON.parse(calls[0].init.body);
    assert.equal(photo.region, 'Ontario', 'the photo route lost the region');
    assert.equal(photo.countryCode, 'CA');

    calls.length = 0;
    await api.price({ text: 'x' });
    assert.equal(JSON.parse(calls[0].init.body).region, 'Ontario', 'the price route lost the region');

    store.setRegion('');
    calls.length = 0;
    await api.identify({ gtin: '0123456789012' });
    assert.equal(new URL(calls[0].url, 'http://x').searchParams.has('region'), false, 'an unchosen region was sent');
  } finally {
    store.setMarket('Canada', 'CAD');
  }
});
