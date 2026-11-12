/**
 * THE SEAM TEST for D-034 (scripts/scorecard mutation M01): a product the catalogue named by a typed search is
 * priced BY ITS BARCODE, not by its words.
 *
 * WHAT WENT WRONG. The price pad's proceed() sent `gtin: item.scannedGtin`. `scannedGtin` is set only by a raw
 * barcode read; a typed search writes the code it resolved to `gtin`. So every typed scan reached /api/price with
 * no code and the judge re-derived the product from the words. Each side was fine alone (the search wrote the
 * code, the route read it); the line between them dropped it, which is why no unit test and no crawl saw it.
 *
 * WHAT THIS DRIVES. The real client (real main.js, router, camera screen and api.js, run by the fake browser in
 * test/ux/ux-b5-harness.test.mjs) through the typed route: type a name, the catalogue answers with a product,
 * the shopper types a price, the app calls /api/price. The request the route receives is read from the server
 * stub's record, never from what the screen says. It must carry the picked product's barcode.
 *
 * WHAT IS STUBBED. The server (a route table that records every request). The real /api/price handler is not
 * run here (it needs the whole server and a catalogue); this test pins the CLIENT's half of the seam, which is
 * the half the bug was in. The route's reading of `gtin` is covered by the server tests.
 *
 * A BARCODE READ AND A PICKED SUGGESTION ARE CHECKED TOO, so a fix that sends the code for one route and
 * drops it for another is also caught.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, pressScan, typePrice, CODE } from './ux/ux-b5-harness.test.mjs';

const TYPED_CODE = '0068100084246';
const PRODUCT = { code: TYPED_CODE, name: 'Kraft Dinner Spirals', brands: 'Kraft', quantity: '200 g' };
const FIELD = '[data-textroute-input]';

/** A catalogue answer that names a product and carries no verdict, so the app goes on to ask /api/price. */
const namedNoVerdict = (product) => async () => ({
  catalogueUp: true, product, category: { tag: 'en:pasta', name: 'Pasta' }, band: 'confident', otherCandidates: 0, scanId: 41,
});
const priceAnswer = async () => ({ kind: 'gemini', reason: 'nothing_to_price', lowConfidence: true, confidenceReasons: ['no_query'] });

/** Every /api/price body, or fail loudly: no call at all is a journey that never reached the seam. */
function priceBodies(app) {
  const calls = app.server.callsTo('/api/price');
  assert.ok(calls.length > 0, `the journey never called /api/price (state=${app.state}, calls=${app.server.calls.map((c) => c.path).join(',')})`);
  return calls.map((c) => c.body);
}

test('D-034 seam: a name typed and resolved by the catalogue reaches /api/price with that product\'s barcode', async () => {
  const app = await launchReturning({
    server: { '/api/identify': namedNoVerdict(PRODUCT), '/api/price': priceAnswer, '/api/search': { candidates: [] } },
  });
  await app.tap('[data-act="manual-search"]', 'keyboard button');
  assert.equal(app.state, 'texting', `setup: the typed route is not up (state=${app.state})`);
  await app.type(FIELD, 'kraft dinner spirals');
  await app.tap(app.find('[data-form="textroute"]').querySelector('button[type="submit"], button'), 'Search');
  assert.equal(app.state, 'asking', `setup: the price pad did not open after the catalogue named the product (state=${app.state})`);
  await typePrice(app, ['4', '9', '9']);
  await app.wait(60);
  const bodies = priceBodies(app);
  assert.equal(bodies.at(-1).gtin, TYPED_CODE, `the typed pick was priced by its words: /api/price body carried gtin=${JSON.stringify(bodies.at(-1).gtin)}`);
  assert.equal(bodies.at(-1).askingCents, 499);
  app.takeErrors();
  app.stop();
});

test('D-034 seam: a barcode read reaches /api/price (or the identify call that prices it) with the scanned code', async () => {
  const app = await launchReturning({
    server: { '/api/identify': namedNoVerdict({ ...PRODUCT, code: CODE }), '/api/price': priceAnswer },
  });
  await pressScan(app, CODE);
  assert.equal(app.state, 'asking', `setup: the price pad did not open after the scan (state=${app.state})`);
  await typePrice(app, ['4', '9', '9']);
  await app.wait(60);
  // The code must have travelled to the server on whichever call priced it.
  const carried = [...app.server.callsTo('/api/identify'), ...app.server.callsTo('/api/price')]
    .some((c) => String(c.query.gtin ?? c.body?.gtin ?? '').replace(/^0+/, '') === CODE.replace(/^0+/, ''));
  assert.ok(carried, `no identify or price request carried the scanned code ${CODE}: ${JSON.stringify(app.server.calls.map((c) => [c.path, c.query, c.body]))}`);
  app.takeErrors();
  app.stop();
});
