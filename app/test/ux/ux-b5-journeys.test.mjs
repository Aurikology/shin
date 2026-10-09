/**
 * UX build 5, the journey tap counts (docs/design/ux-evidence-2026-10-09.md,
 * section 2, "Journeys, counted", and section 13 build 5).
 *
 * BLOCKS COVERED: R-24/R-25/R-26 (J1, J2), R-30 (J6), R-31 (J7), R-32 (J8),
 * R-34 (J10), R-35 (J11). J3, J4, J5 and J9 are not here: J3 and J9 are
 * switched-off paths, J5 is one tap in the camera screen's own tests, J4 is in
 * ux-b5-suggest.test.mjs.
 *
 * HOW A JOURNEY IS COUNTED. The real app is launched cold (see
 * ux-b5-harness.test.mjs: real main.js, router, screens and modules; only the
 * camera reader, the server and the phone are stubbed) and every tap goes
 * through the same click path a finger takes. A tap on a disabled or hidden
 * control, or on a control at a sheet detent the shopper has not opened, throws
 * instead of counting, so a count cannot be reached by a shortcut a person
 * could not take. The camera's OS Allow dialog is not an app tap.
 *
 * TESTS EXPECTED RED UNTIL BUILT: every test whose name says "target" (J1, J2,
 * J6, J7, J11). Each is red today for the reason in its failure message.
 * TESTS EXPECTED GREEN NOW: every test whose name says "TODAY" (they pin the
 * count the inventory measured, so a regression that adds a tap is caught
 * before the build lands; REPLACE THEM when the target lands, they use the
 * point key that the cents-first pad removes) and every test that says "keep"
 * (J8, J10, J11-at-the-limit).
 *
 * Names quote the pass number: the count that passes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchApp, launchReturning, onboard, pressScan, typePrice, holdSteady, reachVerdict,
  identifyRoute, status, CODE, KD, RETURNING,
} from './ux-b5-harness.test.mjs';

const FIRST_RUN = () => launchApp({ server: { '/api/identify': identifyRoute() } });

/** The control that opens the phone's share sheet on the share card; the build names it, so find it by its likely names and fail loudly. */
function findShareSheetControl(app) {
  const el = app.root.querySelector('[data-act="share"], [data-act="share-sheet"], [data-act="send"], [data-act="share-image"]');
  assert.ok(el, `the share card has no control that opens the phone's share sheet. Controls on screen: ${app.all('button').map((b) => `${b.dataset.act ?? '?'}:"${b.textContent.trim().slice(0, 24)}"`).join(', ')}`);
  return el;
}

function findSave(app) {
  const el = app.root.querySelector('[data-act="save"], [data-act="correct-save"]');
  assert.ok(el, `no Save control on screen (screen=${app.screen}, state=${app.state})`);
  return el;
}

/* ----------------------------------------------------------------- J1 */

test('J1 target: first launch to the first verdict is 6 app taps, the barcode firing itself (pass: 6; today 8)', async () => {
  const app = await FIRST_RUN();
  await onboard(app);
  app.hub.ready(CODE);
  await holdSteady(app, CODE, 600);
  assert.equal(app.state, 'asking', `the steady barcode did not open the price pad on its own within 600 ms (state=${app.state}); the scan press is still needed, so J1 cannot reach 6`);
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.atVerdict(), true, `no verdict (screen=${app.screen}, state=${app.state}); log: ${app.log.join(' | ')}`);
  assert.equal(app.taps, 6, `J1 counted ${app.taps}, target 6. Log: ${app.log.join(' | ')}`);
  app.stop();
});

test('J1 target: first launch with the price skipped is 3 app taps (pass: 3; today 4)', async () => {
  const app = await FIRST_RUN();
  await onboard(app);
  await holdSteady(app, CODE, 600);
  assert.equal(app.state, 'asking', `the steady barcode did not open the pad on its own (state=${app.state})`);
  await app.tap('[data-act="pad-skip"]', 'Skip the price');
  assert.equal(app.atVerdict(), true);
  assert.equal(app.taps, 3, `J1-skipped counted ${app.taps}, target 3. Log: ${app.log.join(' | ')}`);
  app.stop();
});

/* ----------------------------------------------------------------- J2 */

test('J2 target: returning, scan a barcode, type $4.99 is 4 taps (pass: 4; today 6)', async () => {
  const app = await launchReturning();
  await holdSteady(app, CODE, 600);
  assert.equal(app.state, 'asking', `the steady barcode did not open the pad on its own (state=${app.state}), so the scan press is still a tap`);
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.atVerdict(), true, `no verdict (state=${app.state}); log: ${app.log.join(' | ')}`);
  assert.equal(app.taps, 4, `J2 counted ${app.taps}, target 4. Log: ${app.log.join(' | ')}`);
  const sent = app.server.callsTo('/api/identify').at(-1);
  assert.equal(sent?.query.shelfPriceCents, '499', 'the three digits 4 9 9 must price the item at 499 cents');
  app.stop();
});

/* ----------------------------------------------------------------- J6 */

async function chooseKnownShop(app) {
  const shops = await app.mod('shops.js');
  shops.chooseShop({ id: 'chain:loblaws', name: 'Loblaws' });
  assert.equal(shops.chosenName(), 'Loblaws', 'setup: the shop was not remembered');
}

test('J6 target: verdict to a correction submitted is 3 taps with the shop known: grabber, Correct it, Save (pass: 3; today 8)', async () => {
  const app = await launchReturning();
  await chooseKnownShop(app);
  await reachVerdict(app);
  const base = app.taps;
  await app.tap('[data-act="detent-step"]', 'grabber');
  await app.tap('[data-act="correct"]', 'Correct it');
  assert.equal(app.screen, 'camera', 'Correct it left the camera for its own screen; the correction must be a detent of the verdict sheet');
  assert.equal(findSave(app).hasAttribute('disabled'), false, 'Save is off right after Correct it: the $4.99 the shopper just typed was not prefilled, so a third tap cannot be Save');
  await app.tap(findSave(app), 'Save');
  assert.equal(app.taps - base, 3, `J6 counted ${app.taps - base}, target 3. Log: ${app.log.slice(base).join(' | ')}`);
  await app.wait(50);
  assert.equal(app.screen, 'camera', 'Save did not return to the camera');
  assert.equal(app.state, 'idle', 'Save did not land on the live viewfinder');
  assert.equal(app.has('.saved-note'), false, 'a thank-you screen is still shown; the session must end on the viewfinder');
  const filed = app.server.calls.find((c) => /correction|report|price/.test(c.path) && c.method === 'POST' && c.body && c.body.priceCents !== undefined);
  assert.equal(filed?.body.priceCents, 499, `the correction filed was not the $4.99 the shopper typed. POSTs: ${app.server.calls.filter((c) => c.method === 'POST').map((c) => c.path).join(' ')}`);
  app.stop();
});

test('J6 target: verdict to a correction submitted is 4 taps when a shop button must be tapped (pass: 4; today 10)', async () => {
  const stores = { stores: ['Loblaws', 'No Frills', 'Metro', 'FreshCo', 'Walmart'].map((name, i) => ({ id: `node/${i + 1}`, name, hint: `${i + 1} km` })) };
  const app = await launchReturning({
    seed: { 'shin.v1': { ...RETURNING['shin.v1'], consent: { photos: false, location: true } } },
    server: { '/api/stores': stores },
  });
  await reachVerdict(app);
  const base = app.taps;
  await app.tap('[data-act="detent-step"]', 'grabber');
  await app.tap('[data-act="correct"]', 'Correct it');
  const buttons = app.all('[data-pick-shop], [data-shop]');
  assert.ok(buttons.length >= 1 && buttons.length <= 3, `expected 1 to 3 nearest-shop buttons showing without a field tap, found ${buttons.length}`);
  await app.tap(buttons[0], 'a nearest-shop button');
  assert.equal(findSave(app).hasAttribute('disabled'), false, 'Save is still off after the price was prefilled and a shop button was tapped');
  await app.tap(findSave(app), 'Save');
  assert.equal(app.taps - base, 4, `J6 (shop button) counted ${app.taps - base}, target 4. Log: ${app.log.slice(base).join(' | ')}`);
  app.stop();
});

/* ----------------------------------------------------------------- J7 */

test('J7 target: verdict to share is 3 taps and the third opens the phone share sheet with the card image attached (pass: 3)', async () => {
  const app = await launchReturning();
  await reachVerdict(app);
  const base = app.taps;
  await app.tap('[data-act="detent-step"]', 'grabber');
  await app.tap('[data-act="share"]', 'Share');
  await app.wait(50);
  await app.tap(findShareSheetControl(app), 'open the share sheet');
  assert.equal(app.taps - base, 3, `J7 counted ${app.taps - base}, target 3`);
  assert.equal(app.phone.shares.length, 1, 'the third tap did not call navigator.share');
  const sent = app.phone.shares[0];
  assert.equal(sent.files?.length, 1, 'the share sheet was opened without the card image attached');
  assert.match(sent.files[0].type, /^image\/png$/, 'the attached file is not a PNG');
  app.stop();
});

/* ----------------------------------------------------------------- J8 */

test('J8 keep: Saved list to the last verdict of an item is 2 taps to see it and a 3rd closes it (pass: 2, close on 3)', async () => {
  const app = await launchReturning();
  await reachVerdict(app);
  await app.tap('[data-act="dist-save"]', 'Save (setup)');
  await app.tap('[data-act="cancel-scan"]', 'back to camera (setup)');
  assert.equal(app.state, 'idle');
  const base = app.taps;
  await app.tap('[data-act="watchlist"]', 'Saved');
  await app.tap('[data-open]', 'the saved row');
  const modal = app.find('[data-modal], .pmodal-card');
  assert.match(modal.textContent, /Kraft Dinner Original/, 'the last verdict does not name the item');
  assert.equal(app.taps - base, 2, `J8 to see counted ${app.taps - base}, expected 2`);
  await app.tap('[data-act="close-detail"]', 'Close');
  assert.equal(app.has('.pmodal-card'), false, 'Close did not close the view');
  assert.equal(app.taps - base, 3, 'J8: the close is the 3rd tap');
  app.stop();
});

/* ---------------------------------------------------------------- J10 */

test('J10 keep: changing the three thresholds is 4 taps: You, great, good, bad (pass: 4)', async () => {
  const app = await launchReturning();
  const base = app.taps;
  await app.tap('[data-act="you"]', 'You');
  assert.equal(app.screen, 'you');
  const pick = (kind, val) => app.find(`[data-range-row="${kind}"] [data-range-val="${val}"]`);
  const before = app.all('[data-range-row] [aria-checked="true"]').map((e) => `${e.dataset.rangeKind}=${e.dataset.rangeVal}`);
  await app.tap(pick('great', 25), 'great 25');
  await app.tap(pick('good', 15), 'good 15');
  await app.tap(pick('bad', 25), 'bad 25');
  assert.equal(app.taps - base, 4);
  const after = app.all('[data-range-row] [aria-checked="true"]').map((e) => `${e.dataset.rangeKind}=${e.dataset.rangeVal}`);
  assert.deepEqual(after.sort(), ['bad=25', 'good=15', 'great=25'], `the three thresholds did not change as chosen (before ${before.join(',')})`);
  const { rangesOf } = await app.mod('lib/ranges.js');
  const store = await app.mod('store.js');
  assert.deepEqual({ great: rangesOf(store.get()).great, good: rangesOf(store.get()).good, bad: rangesOf(store.get()).bad }, { great: 25, good: 15, bad: 25 }, 'the choices were not stored');
  app.stop();
});

/* ---------------------------------------------------------------- J11 */

test('J11 keep: at the free-scan limit the paywall opens with 0 taps beyond the scan itself (pass: 0 extra)', async () => {
  const app = await launchReturning({
    server: { '/api/identify': () => status(402, { failure: 'scan_limit', used: 5, limit: 5, resetsAt: '2026-10-12T00:00:00Z' }) },
  });
  // Build 5: the barcode fires itself, so the scan is 0 taps; the price is 3 digits and a confirm.
  await holdSteady(app, CODE, 600);
  assert.equal(app.state, 'asking', `the steady barcode did not open the pad (state=${app.state}); a limit answered at capture must not stop the pad`);
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.screen, 'paywall', `the limit did not open the paywall (screen=${app.screen})`);
  assert.equal(app.taps, 4, 'the paywall at the limit must cost exactly the scan taps and none more');
  app.stop();
});

test('J11 after build 2 (replaces J11 TODAY, as it asked): the You screen has exactly one entry to the paywall, the Pexi Plus row', async () => {
  const app = await launchReturning();
  await app.tap('[data-act="you"]', 'You');
  const words = /pexi plus|restore purchases|subscribe|subscription|upgrade/i;
  const hits = app.all('button, a, [data-act]').filter((e) => words.test(e.textContent) || words.test(e.getAttribute('aria-label') ?? ''));
  assert.deepEqual(hits.map((h) => h.dataset.act), ['plus'], `the You screen's paywall entries are not exactly the one Pexi Plus row (${hits.map((h) => h.textContent.trim()).join('; ')})`);
  app.stop();
});

test('J11 target: reaching the paywall is 2 taps: You, then the Pexi Plus row (pass: 2; today no path)', async () => {
  const app = await launchReturning();
  await app.tap('[data-act="you"]', 'You');
  const row = app.all('button, a, [data-act]').find((e) => /pexi plus/i.test(e.textContent));
  assert.ok(row, 'the You screen has no "Pexi Plus" row, so the paywall cannot be reached except at the scan limit');
  await app.tap(row, 'Pexi Plus row');
  assert.equal(app.screen, 'paywall');
  assert.equal(app.taps, 2);
  app.stop();
});
