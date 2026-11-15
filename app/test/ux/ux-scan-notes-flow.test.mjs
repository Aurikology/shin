/**
 * 2026-11-14, owner's note "unknown barcodes, scans with no price, produce" (sections 1, 2): on the real
 * camera screen, the name preview speaks before the pad. A barcode Pexi does not know says so with the name
 * field ready on the same sheet; a known product with no price opens the pad saying what a price does.
 * The server is stubbed and every call is recorded (ux-b5-harness.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, pressScan, CODE } from './ux-b5-harness.test.mjs';

test('a barcode Pexi does not know says so and offers "Type the name" on the same sheet', async () => {
  const identify = async (call) => ({ kind: 'catalogue', outcome: 'not_in_catalogue', barcode: call.query.gtin, identity: null, preview: true, priceKnown: false });
  const app = await launchReturning({ server: { '/api/identify': identify } });
  await pressScan(app, CODE);
  assert.match(app.text(), /Pexi doesn't know this one yet/, 'the shopper was not told Pexi does not know this barcode');
  assert.equal(app.has('[data-textroute-input]'), true, 'the name field is not ready on the sheet');
  assert.equal(app.has('[data-pad="4"]'), false, 'a price pad opened before the name was asked');
  app.stop();
});

test('a known product with no price yet opens the pad saying what adding the shelf price does', async () => {
  const identify = async (call) => ({
    kind: 'catalogue', outcome: 'catalogue_hit', barcode: call.query.gtin, preview: true, priceKnown: false,
    identity: { name: 'Nutella', brand: 'Ferrero', size: '350 g', barcode: call.query.gtin, category: null },
  });
  const app = await launchReturning({ server: { '/api/identify': identify } });
  await pressScan(app, CODE);
  assert.equal(app.has('[data-pad="4"]'), true, 'the pad did not open');
  assert.equal(app.has('[data-pad-no-price]'), true, 'the pad did not say there is no price here yet');
  assert.match(app.text(), /No price here yet: add the shelf price and Pexi will know it next time/);
  app.stop();
});

test('a known product with a price opens the pad with no "no price" line', async () => {
  const identify = async (call) => ({
    kind: 'catalogue', outcome: 'catalogue_hit', barcode: call.query.gtin, preview: true, priceKnown: true,
    identity: { name: 'Nutella', brand: 'Ferrero', size: '350 g', barcode: call.query.gtin, category: null },
  });
  const app = await launchReturning({ server: { '/api/identify': identify } });
  await pressScan(app, CODE);
  assert.equal(app.has('[data-pad="4"]'), true);
  assert.equal(app.has('[data-pad-no-price]'), false);
  app.stop();
});
