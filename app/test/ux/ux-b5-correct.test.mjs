/**
 * UX build 5, the correction: R-30 (a detent of the verdict sheet, the price
 * already filled in, the nearest shops as buttons, no Done screen, back on the
 * viewfinder with a toast). docs/design/ux-evidence-2026-10-09.md, block R-30,
 * section 13 build 5, journey J6 (8 taps to 3, or 10 to 4 when a shop is tapped).
 *
 * BLOCKS COVERED: R-30.
 *
 * TESTS EXPECTED RED UNTIL BUILT: every test that opens the correction and looks
 * for a detent. Today "Correct it" leaves the camera for its own screen with an
 * empty price, a thank-you page and a Done button. GREEN today and kept green on
 * purpose: location off means no nearby-shop lookup (the privacy keep), and a
 * refused save never says the price was recorded.
 *
 * SEAM ASSUMPTIONS, stated so a future reader fixes them in one place. The
 * correction is opened by the grabber and "Correct it" ([data-act="detent-step"],
 * [data-act="correct"]); the Save control is [data-act="save"] or
 * [data-act="correct-save"]; the nearest-shop buttons are [data-pick-shop] or
 * [data-shop]; the toast is .toast. If the build names any of these differently,
 * change the constants below, not the tests.
 *
 * WHAT IS REAL AND WHAT IS STUBBED. The real camera screen and every module under
 * public/js run (see ux-b5-harness.test.mjs). Stubbed: the camera reader, the
 * server (it records every request, so "what was filed" is read from the request,
 * never from the screen's own word) and the phone APIs.
 *
 * FAILS LOUDLY (the founder: "all code should contain things that ensure things
 * fail loudly"). Saving a correction with no price must throw. Today the handler
 * does `if (!Number.isFinite(cents)) return;`, a silent return. The test clears
 * the price, then forces a Save control onto the sheet (the real one is
 * disabled, and that is the first line of defence, not the only one) and
 * requires a thrown error that names the price and no request to the server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchReturning, reachVerdict, status, RETURNING, CODE,
} from './ux-b5-harness.test.mjs';

const SAVE = '[data-act="save"], [data-act="correct-save"]';
const SHOP_BUTTONS = '[data-pick-shop], [data-shop]';

const STORES = (n) => ({
  stores: ['Loblaws', 'No Frills', 'Metro', 'FreshCo', 'Walmart'].slice(0, n)
    .map((name, i) => ({ id: `node/${i + 1}`, name, hint: `${i + 1} km` })),
});
const withLocation = (extra = {}) => ({
  seed: { 'shin.v1': { ...RETURNING['shin.v1'], consent: { photos: false, location: true } } },
  ...extra,
});

function save(app) {
  const el = app.root.querySelector(SAVE);
  assert.ok(el, `no Save control on screen (screen=${app.screen}, state=${app.state})`);
  return el;
}
const filed = (app) => app.server.calls.filter((c) => c.method === 'POST' && /correction|report/.test(c.path) && c.body && c.body.amountCents !== undefined);

async function chooseShop(app, name = 'Loblaws') {
  const shops = await app.mod('shops.js');
  shops.chooseShop({ id: `chain:${name.toLowerCase()}`, name });
}

/** From the verdict: the grabber and "Correct it", two counted taps. Then the correction is the thing under test. */
async function openCorrection(app) {
  await reachVerdict(app);
  await app.tap('[data-act="detent-step"]', 'grabber');
  await app.tap('[data-act="correct"]', 'Correct it');
}

/* ----------------------------------------------------------- the detent */

test('R-30: Correct it is a detent of the verdict sheet, not a screen: the camera and the verdict stay mounted (pass: screen camera, sheet present, Save present)', async () => {
  const app = await launchReturning();
  await openCorrection(app);
  assert.equal(app.screen, 'camera', `Correct it moved to the "${app.screen}" screen; the correction must be a detent of the verdict sheet`);
  assert.ok(app.has('.sheet.dist'), 'the verdict sheet is gone while correcting');
  assert.ok(app.root.querySelector(SAVE), 'no Save control inside the sheet');
  app.stop();
});

test('R-30: the price the shopper typed is already in the correction and Save is on (pass: Save enabled, files 499 cents for item and code)', async () => {
  const app = await launchReturning();
  await chooseShop(app);
  await openCorrection(app);
  assert.equal(save(app).hasAttribute('disabled'), false, 'Save is off right after Correct it: the $4.99 just typed was not carried over');
  await app.tap(save(app), 'Save');
  await app.wait(60);
  const sent = filed(app);
  assert.equal(sent.length, 1, `expected exactly one correction filed, found ${sent.length}. POSTs: ${app.server.calls.filter((c) => c.method === 'POST').map((c) => c.path).join(' ')}`);
  assert.equal(sent[0].body.amountCents, 499, `the correction filed ${sent[0].body.amountCents} cents, not the $4.99 on the tag`);
  assert.equal(sent[0].body.code, CODE, 'the correction was filed against another barcode');
  assert.equal(sent[0].body.seller, 'Loblaws', 'the remembered shop was not carried into the correction');
  app.stop();
});

test('R-30: the carried-over price can be changed in the sheet: backspace then 5 files $4.95 (pass: 495 cents)', async () => {
  const app = await launchReturning();
  await chooseShop(app);
  await openCorrection(app);
  assert.equal(app.screen, 'camera', 'the correction is not a detent (screen=' + app.screen + ')');
  await app.key('⌫');
  await app.key('5');
  await app.tap(save(app), 'Save');
  await app.wait(60);
  assert.equal(filed(app)[0]?.body.amountCents, 495, `editing the carried-over price filed ${filed(app)[0]?.body.amountCents}`);
  app.stop();
});

/* ----------------------------------------------------- nearest shops */

test('R-30: with location on, the nearest shops are up to 3 buttons that need no field tap, nearest first (pass: 3 of 5 stores, first is Loblaws)', async () => {
  const app = await launchReturning(withLocation({ server: { '/api/stores': STORES(5) } }));
  await openCorrection(app);
  const buttons = app.all(SHOP_BUTTONS);
  assert.equal(buttons.length, 3, `found ${buttons.length} nearest-shop buttons for 5 stores nearby; the sheet shows 3 without tapping a field`);
  assert.match(buttons[0].textContent, /Loblaws/, `the first button is "${buttons[0].textContent.trim()}", not the nearest shop`);
  assert.ok(app.server.callsTo('/api/stores').length >= 1, 'the nearby shops were not looked up');
  app.stop();
});

test('R-30: two stores nearby show two buttons, not three (pass: 2)', async () => {
  const app = await launchReturning(withLocation({ server: { '/api/stores': STORES(2) } }));
  await openCorrection(app);
  assert.equal(app.all(SHOP_BUTTONS).length, 2, 'the sheet did not show exactly the 2 stores that exist nearby');
  app.stop();
});

test('R-30: tapping the second shop button files the correction under that shop (pass: seller No Frills, 1 request)', async () => {
  const app = await launchReturning(withLocation({ server: { '/api/stores': STORES(5) } }));
  await openCorrection(app);
  const buttons = app.all(SHOP_BUTTONS);
  assert.ok(buttons.length >= 2, `only ${buttons.length} shop buttons to choose from`);
  await app.tap(buttons[1], 'second shop button');
  await app.tap(save(app), 'Save');
  await app.wait(60);
  assert.equal(filed(app).length, 1);
  assert.equal(filed(app)[0].body.seller, 'No Frills', `filed under "${filed(app)[0].body.seller}"`);
  app.stop();
});

test('R-30 keeps: with location off, no nearby shops are looked up for the correction (pass: 0 store lookups)', async () => {
  const app = await launchReturning({ server: { '/api/stores': STORES(5) } });
  await openCorrection(app);
  assert.equal(app.server.callsTo('/api/stores').length, 0, 'the nearby shops were looked up without location consent');
  assert.equal(app.all(SHOP_BUTTONS).length, 0, 'shop buttons appeared without location consent');
  app.stop();
});

/* --------------------------------------------------- the way out */

test('R-30: Save returns to the live viewfinder with a toast, no Done screen (pass: idle, 1 toast, 0 saved-note, 0 Done)', async () => {
  const app = await launchReturning();
  await chooseShop(app);
  await openCorrection(app);
  assert.equal(save(app).hasAttribute('disabled'), false, 'Save is off right after Correct it, so the shopper cannot finish in one tap; the price was not carried over');
  await app.tap(save(app), 'Save');
  await app.wait(80);
  assert.equal(app.screen, 'camera', `Save left the shopper on "${app.screen}"`);
  assert.equal(app.state, 'idle', `Save did not land on the live viewfinder (state=${app.state})`);
  assert.equal(app.has('.saved-note'), false, 'a thank-you page is still shown');
  assert.equal(app.has('[data-act="back"]'), false, 'a Done button is still shown');
  const toasts = app.all('.toast');
  assert.equal(toasts.length, 1, `expected one toast saying the price was recorded, found ${toasts.length}`);
  assert.ok(toasts[0].textContent.trim().length > 0, 'the toast is empty');
  app.stop();
});

test('R-30 keeps: a refused save never says it was recorded and leaves Save to try again (pass: 0 success toasts, 0 saved-note, Save present)', async () => {
  const app = await launchReturning({ server: { '/api/correction': () => status(500, { error: 'down' }) } });
  await chooseShop(app);
  await openCorrection(app);
  // Whatever the pad is (point key today, cents first when built), the shopper
  // makes sure a price is there, so the Save below is a real attempt and the
  // checks after it are not vacuous.
  if (save(app).hasAttribute('disabled')) {
    for (const k of (app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9'])) await app.key(k);
  }
  assert.equal(save(app).hasAttribute('disabled'), false, 'setup: Save is off with a price typed');
  await app.tap(save(app), 'Save');
  await app.wait(120);
  const attempts = app.server.calls.filter((c) => c.method === 'POST' && /correction|report/.test(c.path));
  assert.ok(attempts.length >= 1, 'setup: Save never reached the server, so a refusal was never tested');
  app.takeErrors();
  assert.equal(app.has('.saved-note'), false, 'the thank-you page appeared although the server refused the price');
  assert.equal(app.all('.toast').filter((t) => !t.hasAttribute('data-failed')).length, 0, 'a success toast appeared although the server refused the price');
  assert.ok(app.root.querySelector(SAVE) || app.root.querySelector('[data-act="retry"]'), 'after a refusal the shopper has nothing to tap to try again');
  app.stop();
});

/* ---------------------------------------------------- fails loudly */

test('R-30 fails loudly: saving a correction with no price throws and files nothing (pass: 1 error naming the price, 0 requests)', async () => {
  const app = await launchReturning();
  await chooseShop(app);
  await openCorrection(app);
  for (let i = 0; i < 8; i += 1) await app.key('⌫');
  const real = save(app);
  const act = real.getAttribute('data-act');
  real.parentNode.insertAdjacentHTML('beforeend', `<button type="button" class="cta" data-forced-save="1" data-act="${act}">Save</button>`);
  const forced = app.find('[data-forced-save="1"]');
  let sync = null;
  try { await app.tap(forced, 'a Save forced onto an empty price'); } catch (e) { sync = e; }
  await app.wait(40);
  const thrown = sync ?? app.takeErrors()[0];
  assert.ok(thrown, 'Save with no price did nothing and said nothing: the handler returned silently');
  assert.match(String(thrown.message ?? thrown), /price|amount/i, 'the error does not say the price is missing');
  assert.equal(filed(app).length, 0, 'a correction with no price was sent to the server');
  app.takeErrors();
  app.stop();
});
