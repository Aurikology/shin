/**
 * 2026-11-14, from the owner's note "unknown barcodes, scans with no price, produce" (sections 1 to 5):
 * the name preview speaks before the pad, a saved price is said, a run of misses is noticed once, and
 * the first aim line steers early scans. The pure parts run for real; the camera's own wiring is
 * source-asserted (the convention in this folder).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const notes = await import('../public/js/scan-notes.js');
const camera = await import('../public/js/screens/camera.js');
const { t, TABLES } = await import('../public/js/ui-strings.js');
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');

test('readPreview: not_in_catalogue and priceKnown false are misses, priceKnown true is not, no answer says nothing', () => {
  const p = (extra) => ({ kind: 'catalogue', preview: true, ...extra });
  assert.deepEqual(notes.readPreview(p({ outcome: 'not_in_catalogue', identity: null })), { missed: true, unknown: true });
  assert.deepEqual(notes.readPreview(p({ outcome: 'catalogue_hit', priceKnown: false })), { missed: true, unknown: false });
  assert.deepEqual(notes.readPreview(p({ outcome: 'catalogue_hit', priceKnown: true })), { missed: false, unknown: false });
  assert.deepEqual(notes.readPreview(p({ outcome: 'preview_unavailable', priceKnown: false })), { missed: null, unknown: false });
  assert.deepEqual(notes.readPreview(p({ outcome: 'catalogue_hit' })), { missed: null, unknown: false });
  assert.deepEqual(notes.readPreview({ failure: 'rate_limited' }), { missed: null, unknown: false });
  assert.deepEqual(notes.readPreview(null), { missed: null, unknown: false });
  // A priced (non-preview) answer is not a preview: it must not be read as one.
  assert.deepEqual(notes.readPreview({ kind: 'catalogue', outcome: 'not_in_catalogue' }), { missed: null, unknown: false });
});

test('the miss tracker speaks on the second miss in a row, once, and a priced scan starts the run again', () => {
  const m = notes.createMissTracker();
  assert.equal(m.record(true), false, 'one miss is not a run');
  assert.equal(m.record(true), true, 'the second miss in a row speaks');
  assert.equal(m.record(true), false, 'never twice in a session');
  assert.equal(m.record(true), false);
  const n = notes.createMissTracker();
  n.record(true);
  n.record(false);
  assert.equal(n.record(true), false, 'a priced scan between two misses breaks the run');
  assert.equal(n.record(true), true);
});

test('the first-run tip shows until a first barcode is read, and survives storage that throws', () => {
  const s = makeStorage();
  assert.equal(notes.firstRunTipPending(s), true);
  notes.markFirstRunTipSeen(s);
  assert.equal(notes.firstRunTipPending(s), false);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(notes.firstRunTipPending(broken), true);
  assert.doesNotThrow(() => notes.markFirstRunTipSeen(broken));
});

test('the pad says "No price here yet" only when the preview said so', () => {
  const item = { id: null, text: 'Nutella 350 g', category: null, pendingScan: { kind: 'barcode', code: '1' } };
  const without = camera.pricePadSheet(item, '', null, null, null, false, '', null, true);
  assert.ok(!/data-pad-no-price/.test(without));
  const withNote = camera.pricePadSheet({ ...item, priceMissing: true }, '', null, null, null, false, '', null, true);
  assert.match(withNote, /data-pad-no-price/);
  assert.match(withNote, /No price here yet: add the shelf price and Pexi will know it next time/);
});

test('an unknown barcode says so and offers "Type the name" with the field on the same sheet', () => {
  const html = camera.textRouteSheet('', { unknownBarcode: true, notInCatalogue: true });
  assert.match(html, /Pexi doesn&#39;t know this one yet|Pexi doesn't know this one yet/);
  assert.match(html, /data-textroute-input/);
  assert.match(html, /placeholder="Type the name"/);
  // The older sheet (an unreadable code) is unchanged.
  assert.match(camera.textRouteSheet('', { unknownBarcode: true }), /this barcode yet/);
});

test('every new line has French, and the saved-price count is a running count', () => {
  for (const key of ['cat_unknown_one', 'cat_type_the_name', 'pad_no_price_yet', 'note_price_saved', 'note_prices_added', 'note_strongest', 'note_first_tip']) {
    assert.ok(key in TABLES.en && key in TABLES.fr, `${key} is missing in a language`);
  }
  assert.equal(t('note_prices_added', { n: '6' }), "You've added 6 prices");
  assert.equal(t('note_prices_added', { n: '1' }), "You've added 1 price");
  assert.equal(t('note_strongest'), "Pexi's strongest on packaged groceries. Try a box or can.");
});

test('the camera waits briefly for the preview, then says unknown / no-price before the pad', () => {
  const on = CAMERA.slice(CAMERA.indexOf('async function onBarcode(read)'), CAMERA.indexOf('function askPriceFirst('));
  assert.match(on, /Promise\.race\(\[mineName\.done,/);
  assert.match(on, /sessionMisses\.record\(preview\.missed\)/);
  assert.match(on, /showScanNote\(t\('note_strongest'\)\)/);
  assert.match(on, /if \(preview\.unknown && !scanFrame && !store\.nameOfCode\(read\.value\)\) \{\s+askNameForUnknownBarcode\(null, read\.value, \{ fresh: true \}\);/);
  assert.match(on, /askPriceFirst\(\{ kind: 'barcode', code: read\.value, priceMissing: preview\.missed === true \}\)/);
  assert.match(on, /markFirstRunTipSeen\(\)/);
});

test('a saved price is said with the running count', () => {
  assert.match(CAMERA.slice(CAMERA.indexOf('function showCatalogue(answer, cents'), CAMERA.indexOf('function showCatalogue(answer, cents') + 200), /noteContribution\(answer\);/);
  const sc = CAMERA.slice(CAMERA.indexOf('function noteContribution('), CAMERA.indexOf('function noteContribution(') + 500);
  assert.match(sc, /answer\?\.contributed !== true/);
  assert.match(sc, /t\('note_prices_added', \{ n: String\(answer\.pricesAdded\) \}\)/);
  assert.match(sc, /t\('note_price_saved'\)/);
});

test('the first-run tip is one line over the feed, in English and French, shown once per visit until a barcode is read', () => {
  assert.equal(t('note_first_tip'), 'Works best on packaged groceries at Loblaws, No Frills, Metro, Walmart and Save-On-Foods');
  assert.match(TABLES.fr.note_first_tip, /Loblaws, No Frills, Metro, Walmart/);
  assert.match(CAMERA, /if \(!firstTipShown && firstRunTipPending\(\)\) \{\s+firstTipShown = true;\s+showScanNote\(t\('note_first_tip'\), 9000\);/);
});
