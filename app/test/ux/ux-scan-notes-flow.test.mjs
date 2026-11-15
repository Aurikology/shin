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

/* The pack read is developer-only (2026-10-10). "pack_read_developer_only" in the scan log is the reason the
   SERVER writes on an identify scan with no name for a shopper; no shopper path may request the pack route. */
const noPack = (app, why) => assert.equal(app.server.callsTo('/api/identify/pack').length, 0, `a shopper path requested /api/identify/pack: ${why}`);

test('a shopper with an unknown barcode types the name; /api/identify/pack is never requested', async () => {
  const identify = async (call) => ({ kind: 'catalogue', outcome: 'not_in_catalogue', barcode: call.query.gtin, identity: null, preview: call.query.preview === '1', offerManualEntry: true, noNameReasons: ['off_not_found', 'pack_read_developer_only'] });
  const app = await launchReturning({ server: { '/api/identify': identify } });
  await pressScan(app, CODE);
  await app.type('[data-textroute-input]', 'Nutella');
  await app.tap('.textroute-form button', 'send the name');
  await app.wait(500);
  noPack(app, 'unknown barcode, name typed');
  app.takeErrors();
  app.stop();
});

test('a shopper whose preview fails then prices an unknown barcode; /api/identify/pack is never requested', async () => {
  const identify = async (call) => {
    if (call.query.preview === '1') throw new Error('preview down');
    return { kind: 'catalogue', outcome: 'not_in_catalogue', barcode: call.query.gtin, identity: null, offerManualEntry: true, noNameReasons: ['pack_read_developer_only'] };
  };
  const app = await launchReturning({ server: { '/api/identify': identify } });
  await pressScan(app, CODE);
  await app.key('4'); await app.key('9'); await app.key('9');
  await app.tap('[data-act="pad-confirm"]', 'pad confirm');
  await app.wait(500);
  noPack(app, 'unknown barcode, price typed, preview failed');
  app.takeErrors();
  app.stop();
});

test('a shopper with no barcode types a name; /api/identify/pack is never requested', async () => {
  const app = await launchReturning();
  await app.tap('[data-act="manual-search"]', 'keyboard');
  await app.type('[data-textroute-input]', 'Nutella');
  await app.wait(700);
  noPack(app, 'no barcode, typed search');
  app.takeErrors();
  app.stop();
});
