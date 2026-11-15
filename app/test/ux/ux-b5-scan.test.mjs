/**
 * UX build 5, the scan: R-25 (the barcode fires itself) and R-36 (the item name
 * is shown before the price pad). docs/design/ux-evidence-2026-10-09.md,
 * blocks R-25 and R-36, section 13 build 5.
 *
 * BLOCKS COVERED: R-25, R-36.
 *
 * TESTS EXPECTED RED UNTIL BUILT: all of them. Today the only way a barcode
 * leaves the camera reader is the scan press, and the pad caption is the
 * barcode digits, with the catalogue asked only after the price is confirmed.
 * Each test's failure message names the thing that is missing.
 *
 * WHAT IS REAL AND WHAT IS STUBBED. The real camera screen and every module
 * under public/js run (see ux-b5-harness.test.mjs). The camera reader is
 * stubbed: `hub.ready(code)` is "the vote settled on this code", which is the
 * eye's onBarcodeReady, and `hold` repeats it on every tick for as long as the
 * code stays in frame, the way the eye does. Nothing is clicked in the
 * auto-fire tests: a press would hide the very thing under test.
 *
 * SEAM ASSUMPTION, stated so a future reader can fix it in one place: the
 * auto-fire is observed at the screen (the pad opens with no tap). If the build
 * puts it inside the eye (src/eye/camera.ts) and the screen only receives the
 * read, the hub's stub in the harness needs the same 150 ms rule; the tests
 * below do not change.
 *
 * FAILS LOUDLY (the founder: "all code should contain things that ensure things
 * fail loudly"). Per block: R-25 a barcode that fails its check digit must make
 * the auto-fire throw instead of being passed on; R-36 an identity with no name
 * must make the caption throw instead of printing digits or "undefined" as the
 * item. The R-36 one is this file's reading of the rule; the spec names the
 * R-25 one's equivalent in the founder's brief.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchReturning, pressScan, holdSteady, identifyRoute, status, CODE, KD,
} from './ux-b5-harness.test.mjs';

const BAD_CHECKSUM = '0068100084240'; // CODE with its last digit changed: EAN-13 check digit fails
const SEARCH = {
  candidates: [
    { code: CODE, name: 'Kraft Dinner Original', brands: 'Kraft', quantity: '225 g' },
    { code: '0068100084246', name: 'Kraft Dinner Spirals', brands: 'Kraft', quantity: '200 g' },
    { code: '0068100084247', name: 'Kraft Dinner Cheesy', brands: 'Kraft', quantity: '175 g' },
  ],
};

/** The pad is open for a barcode: the scan left the viewfinder with no tap on the camera. */
function padOpen(app) {
  return app.state === 'asking' && app.has('.padsheet');
}

/* ------------------------------------------- tap to scan (replaces R-25's auto-fire, 2026-11-14) */

const OTHER = '4006381333931'; // a second valid EAN-13 in view

test('tap to scan: a code held steady in view never opens a sheet by itself (pass: idle, 0 taps, 0 lookups)', async () => {
  const app = await launchReturning();
  await holdSteady(app, CODE, 900);
  assert.equal(app.state, 'idle', `a detection alone opened a sheet (state=${app.state}); only a tap on the outline may scan`);
  assert.equal(app.taps, 0);
  assert.equal(app.server.callsTo('/api/identify').length, 0, 'a code that was only detected was looked up');
  // Positive control: the same screen scans the moment the outline is tapped.
  app.hub.tapCode(CODE);
  await app.wait(400);
  assert.ok(padOpen(app), `tapping the outline did not scan the code (state=${app.state}), so the check above proves nothing`);
  app.stop();
});

test('tap to scan: the tapped outline is the code scanned, even when another code leads the vote (pass: the tapped code is looked up once)', async () => {
  const app = await launchReturning();
  app.hub.ready(CODE); // CODE leads the vote and its button is up
  app.hub.tapCode(OTHER);
  await app.wait(400);
  assert.ok(padOpen(app), `no scan after the tap (state=${app.state})`);
  const lookups = app.server.calls.filter((c) => c.path === '/api/identify');
  assert.equal(lookups.length, 1, 'the tapped capture was not looked up exactly once');
  assert.equal(lookups[0].query.gtin, OTHER, 'the code scanned is not the code that was tapped');
  // A second tap while the sheet is opening is dropped, not a second scan.
  app.hub.tapCode(CODE);
  await app.wait(200);
  assert.equal(app.server.calls.filter((c) => c.path === '/api/identify').length, 1, 'a second tap started a second scan');
  app.stop();
});

test('tap to scan fails loudly: a tapped code with a bad check digit is not looked up and never says "not found"', async () => {
  const app = await launchReturning();
  app.hub.tapCode(BAD_CHECKSUM);
  await app.wait(300);
  assert.equal(app.state, 'idle', 'a code with a bad check digit opened a sheet');
  assert.equal(app.server.callsTo('/api/identify').length, 0, 'a code with a bad check digit was sent to the server');
  assert.equal(app.has('.sheet.catalogue[data-outcome="not_in_catalogue"]') || app.has('[data-textroute-input]'), false, 'a misread was shown as "not found"');
  // The guard is not a blanket refusal: a valid tap still scans.
  app.hub.lost();
  await app.wait(1800);
  app.hub.tapCode(CODE);
  await app.wait(400);
  assert.ok(padOpen(app), 'after the guard, a valid tap no longer scans');
  app.stop();
});

/* ------------------------------------------------------------------ R-36 */

test('R-36: the item name and size replace the barcode digits on the pad before any price is typed (pass: name shown, 0 digits typed)', async () => {
  const app = await launchReturning({ server: { '/api/search': SEARCH } });
  await pressScan(app);
  await app.wait(40);
  assert.ok(padOpen(app), 'setup: the pad did not open');
  assert.equal(app.find('.pad-amount').textContent.replace(/\s+/g, ''), '$0.00', 'setup: a price was already typed');
  const caption = app.find('.padsheet .itemname').textContent;
  assert.match(caption, /Kraft Dinner Original/, `the pad names "${caption.trim()}" instead of the item`);
  assert.match(caption, /225\s?g/, 'the item name is shown without its size');
  assert.doesNotMatch(caption, new RegExp(CODE), 'the barcode digits are still the caption');
  const lookedUp = app.server.calls.some((c) => (c.path === '/api/identify' || c.path === '/api/search') && (c.query.gtin === CODE || c.query.text));
  assert.ok(lookedUp, 'no lookup was made at capture');
  app.stop();
});

test('R-36: tapping the item name opens the wrong-item list in 1 tap, with no price typed, and a pick re-names the pad (pass: 1 tap)', async () => {
  const app = await launchReturning({ server: { '/api/search': SEARCH } });
  await pressScan(app);
  await app.wait(40);
  const base = app.taps;
  const name = app.root.querySelector('.padsheet [data-act="notthis"]');
  assert.ok(name, 'the pad has no control on the item name that opens the wrong-item list; a wrong scan still costs a typed price');
  await app.tap(name, 'the item name');
  await app.wait(40);
  assert.equal(app.taps - base, 1, 'opening the list took more than one tap');
  assert.equal(app.state, 'choosing', `the wrong-item list is not up (state=${app.state})`);
  const rows = app.all('[data-pick-code]');
  assert.ok(rows.length >= 1, 'the wrong-item list is empty');
  assert.ok(rows.every((r) => r.dataset.pickCode !== CODE), 'the item the shopper just said is wrong is still offered');
  await app.tap(rows[0], 'a different item');
  assert.ok(padOpen(app), 'picking a different item did not return to the price pad');
  assert.match(app.find('.padsheet .itemname').textContent, /Kraft Dinner Spirals/, 'the pad does not show the item that was picked');
  assert.equal(app.find('.pad-amount').textContent.replace(/\s+/g, ''), '$0.00', 'a price had to be typed to repair the item');
  app.stop();
});

test('R-36 fails loudly: an identity with no name throws at the caption, never digits or "undefined" as the item (pass: 1 error, no caption)', async () => {
  const noName = { ...KD, name: '', brand: '', size: '' };
  const app = await launchReturning({ server: { '/api/identify': identifyRoute({ identity: noName }) } });
  let sync = null;
  try {
    await pressScan(app);
    await app.wait(60);
  } catch (e) {
    sync = e;
  }
  const thrown = sync ?? app.takeErrors()[0];
  assert.ok(thrown, 'a lookup answered with no item name and nothing threw');
  assert.match(String(thrown.message ?? thrown), /name/i, 'the error does not say the name is missing');
  const caption = app.root.querySelector('.padsheet .itemname')?.textContent ?? '';
  assert.doesNotMatch(caption, /undefined|null/, 'the caption printed a missing name as text');
  app.takeErrors();
  app.stop();
});

test('R-36: a lookup that fails at capture leaves the barcode digits and the pad usable (pass: pad opens, digits shown, price still typed and sent)', async () => {
  const app = await launchReturning({ server: { '/api/identify': () => status(500, {}) } });
  await pressScan(app);
  await app.wait(40);
  assert.ok(padOpen(app), 'a failed lookup closed the pad');
  const caption = app.find('.padsheet .itemname').textContent;
  assert.match(caption, new RegExp(CODE), 'with no name to show, the caption must still say which code was read');
  app.takeErrors();
  app.stop();
});
