/**
 * UX build 5, the typed name: R-28 (suggestions after the third letter; tapping
 * one submits and picks). docs/design/ux-evidence-2026-10-09.md, block R-28,
 * section 13 build 5, journey J4 (N + 8 taps today, N' + 6 target).
 *
 * BLOCKS COVERED: R-28. Journey J4 is counted here too, because its saving is
 * the merge this block builds.
 *
 * TESTS EXPECTED RED UNTIL BUILT: every test that expects a suggestion. Today
 * nothing is searched while the shopper types: the name is submitted, THEN the
 * price pad opens, THEN a "pick one of three" sheet appears. GREEN today and
 * kept green on purpose: the J4 TODAY count, and the submit button still working
 * for a name that matches nothing.
 *
 * SEAM ASSUMPTION, stated so a future reader fixes it in one place. A suggestion
 * row is `[data-suggestion]` or the existing `[data-typed-pick]` (the row the
 * pick sheet already uses, which carries the barcode); the typed field is
 * `[data-textroute-input]`; the keyboard button is `[data-act="manual-search"]`.
 * If the build names the rows differently, change SUGGESTION below, not the tests.
 *
 * WHAT IS REAL AND WHAT IS STUBBED. The real camera screen and every module under
 * public/js run (see ux-b5-harness.test.mjs). Stubbed: the camera reader, the
 * server (it records every request, so "what was searched" is read from the
 * request, never from the screen's own word) and the phone.
 *
 * FAILS LOUDLY (the founder: "all code should contain things that ensure things
 * fail loudly"). A search answer with a row that has no barcode must throw. A row
 * the shopper can tap but that cannot be priced is a dead end that looks like a
 * choice. This is this file's reading of the rule; the spec names no failure case
 * for R-28.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, typePrice, CODE } from './ux-b5-harness.test.mjs';

const SUGGESTION = '[data-suggestion], [data-typed-pick]';
const FIELD = '[data-textroute-input]';

const ROWS = [
  { code: CODE, name: 'Kraft Dinner Original', brands: 'Kraft', quantity: '225 g' },
  { code: '0068100084246', name: 'Kraft Dinner Spirals', brands: 'Kraft', quantity: '200 g' },
  { code: '0068100084247', name: 'Kraft Dinner Cheesy', brands: 'Kraft', quantity: '175 g' },
];
/** The server answers a search only for names starting "kra", like a catalogue that holds Kraft and nothing else. */
const searchRoute = (rows = ROWS) => async (call) => (String(call.query.q ?? '').toLowerCase().startsWith('kra') ? { candidates: rows } : { candidates: [] });

async function openTyped(opts = {}) {
  const app = await launchReturning({ server: { '/api/search': searchRoute(opts.rows) } });
  await app.tap('[data-act="manual-search"]', 'keyboard button');
  assert.equal(app.state, 'texting', `setup: the typed route is not up (state=${app.state})`);
  return app;
}
const searches = (app) => app.server.callsTo('/api/search');

/* ------------------------------------------------- when suggestions show */

test('R-28: nothing is suggested or searched for 1 or 2 letters, and 3 letters show up to 3 suggestions, best first (pass: 0, 0, then 3 rows)', async () => {
  const app = await openTyped();
  await app.type(FIELD, 'kr');
  await app.wait(250);
  assert.equal(app.all(SUGGESTION).length, 0, 'suggestions showed after only two letters');
  assert.equal(searches(app).length, 0, 'the server was searched after only two letters');
  await app.type(FIELD, 'a');
  await app.wait(250);
  assert.ok(searches(app).length >= 1, 'the third letter did not search the catalogue; today nothing is searched until the name is submitted');
  assert.equal(String(searches(app).at(-1).query.q).toLowerCase(), 'kra', 'the search was not for what was typed');
  const rows = app.all(SUGGESTION);
  assert.equal(rows.length, 3, `${rows.length} suggestions showed for a name the catalogue matches 3 times`);
  assert.match(rows[0].textContent, /Kraft Dinner Original/, `the first suggestion is "${rows[0].textContent.trim()}", not the best match`);
  assert.match(rows[0].textContent, /225\s?g/, 'the suggestion does not show the size, so two sizes of one product cannot be told apart');
  app.takeErrors();
  app.stop();
});

test('R-28: a name that matches nothing shows no suggestions and Search still works (pass: 0 rows, pad opens on submit)', async () => {
  const app = await openTyped();
  await app.type(FIELD, 'zzzq');
  await app.wait(250);
  assert.equal(app.all(SUGGESTION).length, 0, 'suggestions showed for a name nothing matches');
  await app.tap(app.find('[data-form="textroute"]').querySelector('button[type="submit"], button'), 'Search');
  assert.equal(app.state, 'asking', `submitting an unmatched name did not go on (state=${app.state}); the name must stay submittable`);
  app.takeErrors();
  app.stop();
});

/* ------------------------------------------- tapping one submits and picks */

test('R-28: tapping a suggestion submits and picks in one tap: the pad opens with no Search tap and no pick sheet (pass: 1 tap, asking, 0 pick sheets)', async () => {
  const app = await openTyped();
  await app.type(FIELD, 'kra');
  await app.wait(250);
  const rows = app.all(SUGGESTION);
  assert.ok(rows.length >= 1, `no suggestion to tap after three letters. Buttons: ${app.all('button').map((b) => b.textContent.trim().slice(0, 20)).join(', ')}`);
  const base = app.taps;
  await app.tap(rows[0], 'the first suggestion');
  await app.wait(60);
  assert.equal(app.taps - base, 1);
  assert.equal(app.state, 'asking', `after the suggestion the screen is "${app.state}", not the price pad`);
  assert.equal(app.all('[data-typed-pick]').length, 0, 'a pick sheet is still asked after the shopper picked');
  app.stop();
});

test('R-28: the picked suggestion is the item priced: 4 9 9 asks the server for that barcode at 499 cents (pass: gtin match, 499)', async () => {
  const app = await openTyped();
  await app.type(FIELD, 'kra');
  await app.wait(250);
  const rows = app.all(SUGGESTION);
  assert.ok(rows.length >= 2, `only ${rows.length} suggestions to choose from`);
  await app.tap(rows[1], 'the second suggestion');
  await app.wait(60);
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.atVerdict(), true, `no verdict after the pick and the price (state=${app.state})`);
  const sent = app.server.callsTo('/api/identify').at(-1);
  assert.equal(sent?.query.gtin, '0068100084246', `the item priced was ${sent?.query.gtin}, not the suggestion tapped`);
  assert.equal(sent?.query.shelfPriceCents, '499');
  app.takeErrors();
  app.stop();
});

/* --------------------------------------------------------------- J4 counts */

test('J4 target: keyboard, 3 letters, one suggestion, the cents-first pad is 9 taps (pass: 9 = N\' + 6 for N\' = 3; today 11)', async () => {
  const app = await openTyped();
  await app.type(FIELD, 'kra');
  await app.wait(250);
  const rows = app.all(SUGGESTION);
  assert.ok(rows.length >= 1, 'no suggestion after three letters, so the name still needs Search and a pick');
  await app.tap(rows[0], 'the first suggestion');
  await app.wait(60);
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.atVerdict(), true, `no verdict (state=${app.state}); log: ${app.log.join(' | ')}`);
  assert.equal(app.count, 9, `J4 counted ${app.count} (taps ${app.taps} + letters ${app.keystrokes}), target N' + 6 = 9. Log: ${app.log.join(' | ')}`);
  app.takeErrors();
  app.stop();
});

/* ------------------------------------------------------------ fails loudly */

test('R-28 fails loudly: a search answer with a row that has no barcode throws and that row is not offered (pass: 1 error naming the barcode, 0 rows for it)', async () => {
  const bad = [{ name: 'Kraft Dinner Original', brands: 'Kraft', quantity: '225 g' }, ROWS[1]];
  const app = await openTyped({ rows: bad });
  let sync = null;
  try {
    await app.type(FIELD, 'kra');
    await app.wait(250);
  } catch (e) { sync = e; }
  const thrown = sync ?? app.takeErrors()[0];
  assert.ok(thrown, 'a row with no barcode arrived in a search answer and nothing threw: it was dropped or shown silently');
  assert.match(String(thrown.message ?? thrown), /code|barcode|gtin/i, 'the error does not say the barcode is missing');
  const rows = app.all(SUGGESTION);
  assert.ok(!rows.some((r) => /undefined|null|^$/.test(r.dataset.typedPick ?? r.dataset.suggestion ?? 'x')), 'a row with no barcode is on screen to be tapped');
  app.takeErrors();
  app.stop();
});
