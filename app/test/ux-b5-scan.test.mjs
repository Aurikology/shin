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

/* ------------------------------------------------------------------ R-25 */

test('R-25: a barcode steady for 150 ms fires with no scan press (pass: pad open, 0 taps)', async () => {
  const app = await launchReturning();
  const early = await holdSteady(app, CODE, 60);
  assert.ok(early >= 55, 'setup: the hold ended early');
  assert.equal(app.state, 'idle', 'the scan fired before the code had been steady for 150 ms');
  await holdSteady(app, CODE, 600);
  assert.ok(padOpen(app), `a code held steady for 660 ms did not fire on its own (state=${app.state}); today only the scan press sends a barcode out of the camera reader`);
  assert.equal(app.taps, 0, 'the scan needed a tap');
  app.stop();
});

test('R-25: a code that leaves the frame before 150 ms does not fire, and a different code every tick never settles (pass: 0 fires, then 1)', async () => {
  const app = await launchReturning();
  // Negative controls first: neither of these may fire.
  app.hub.ready(CODE);
  await app.wait(80);
  app.hub.lost();
  await app.wait(300);
  assert.equal(app.state, 'idle', 'a code that left the frame after 80 ms fired');
  const t0 = Date.now();
  let flip = false;
  while (Date.now() - t0 < 500) {
    app.hub.ready(flip ? '0068100084246' : CODE);
    flip = !flip;
    await app.wait(25);
  }
  assert.equal(app.state, 'idle', 'two codes taking turns in frame fired; steady means the same code');
  // Positive control: the same screen DOES fire for a steady code. Without this
  // the two checks above pass on a screen that never fires at all.
  app.hub.lost();
  await holdSteady(app, CODE, 600);
  assert.ok(padOpen(app), `the positive control failed: a steady code did not fire (state=${app.state}), so the checks above prove nothing`);
  app.stop();
});

test('R-25: the code that fired is the code on the pad, and it is looked up once (pass: 1 lookup, the steady code)', async () => {
  const app = await launchReturning();
  await holdSteady(app, CODE, 700);
  assert.ok(padOpen(app), `no auto-fire (state=${app.state})`);
  await app.wait(300);
  const lookups = app.server.calls.filter((c) => c.path === '/api/identify' || c.path === '/api/search');
  assert.ok(lookups.length >= 1, 'the item was never looked up at capture');
  assert.ok(lookups.every((c) => (c.query.gtin ?? CODE) === CODE), 'a lookup was made for a code other than the steady one');
  assert.equal(lookups.filter((c) => c.path === '/api/identify').length, 1, 'the same capture was looked up more than once while the code stayed in frame');
  app.stop();
});

test('R-25 fails loudly: a barcode that fails its check digit throws at the auto-fire and is not passed on (pass: 1 error naming the check digit, 0 lookups)', async () => {
  const app = await launchReturning();
  let sync = null;
  try {
    app.hub.ready(BAD_CHECKSUM);
    await holdSteady(app, BAD_CHECKSUM, 600);
  } catch (e) {
    sync = e;
  }
  const thrown = sync ?? app.takeErrors()[0];
  assert.ok(thrown, 'the camera reader delivered a code with a bad check digit and nothing threw: it was ignored or passed on silently');
  assert.match(String(thrown.message ?? thrown), /check ?digit|checksum/i, 'the error does not say why');
  assert.equal(app.state, 'idle', 'a code with a bad check digit opened the pad');
  assert.equal(app.server.callsTo('/api/identify').length, 0, 'a code with a bad check digit was sent to the server');
  // The same screen still fires for a good code: the guard is not a blanket refusal.
  app.takeErrors();
  app.hub.lost();
  await holdSteady(app, CODE, 600);
  assert.ok(padOpen(app), 'after the guard threw, a valid steady code no longer fires');
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
