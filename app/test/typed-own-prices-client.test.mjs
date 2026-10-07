/**
 * The client half of a typed search answered from Pexi's own data (Jamin,
 * 2026-09-23: "typing a product should only search our catalogue and only
 * return when we have both the item and price").
 *
 * The answer renders through the same grounded block a Gemini answer uses, so
 * it is rendered here into real nodes (mini-dom): it must say it is Pexi's own
 * prices, never "Found by Google", and every row must show its currency and
 * the day it was seen. The no-match answer must be the plain sentence, and the
 * typed route must never hand an own-data answer to `proceed`, whose
 * /api/price would make the paid call this ruling removed.
 *
 * Run once against the client before the change and seen to fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');

async function renderSection(wire) {
  const doc = makeDocument();
  const restore = installBrowser({ doc, storage: makeStorage() });
  try {
    const { groundedSection } = await import('../public/js/grounded.js');
    return groundedSection(wire, { doc });
  } finally {
    restore();
  }
}

const OFFER = {
  retailer: 'No Frills (Hamilton)', price: 3.49, currency: 'CAD', observedAt: '2026-09-10', seenOn: '2026-09-10',
  url: null, hasLink: false, sizeValue: null, sizeUnit: null, packCount: null, memberOnly: null, marketplace: null,
};
const wire = (block) => ({
  kind: 'grounded', forDevice: 'd', fetchedAt: '2026-09-10', suggestionsHtml: '',
  block: { kind: 'prices', checked: false, facts: [], description: null, offers: [OFFER], reviews: [], verdict: null, noLineReason: null, ...block },
});

test("Pexi's own prices say so, and every row shows its currency and the day it was seen", async () => {
  const section = await renderSection(wire({ source: 'shin_own_data' }));
  assert.ok(section, 'the own-data block rendered nothing');
  const all = section.textContent;
  assert.doesNotMatch(all, /Google/, 'own prices are labelled as a Google result');
  assert.equal(section.querySelector('.grounded-heading').textContent, 'From Pexi’s own prices');
  const row = section.querySelector('.g-offer');
  assert.equal(row.querySelector('.g-price').textContent, '3.49');
  assert.equal(row.querySelector('.g-currency').textContent, 'CAD');
  assert.equal(row.querySelector('.g-seen').textContent, '2026-09-10');
});

test("a Gemini block is left exactly as it was: Google's heading, no Pexi fields added", async () => {
  const section = await renderSection(wire({}));
  assert.equal(section.querySelector('.grounded-heading').textContent, 'Found by Google');
  assert.equal(section.querySelector('.g-seen'), null);
  assert.equal(section.querySelector('.g-currency'), null);
});

test('the no-price sentence exists in both languages and tells the shopper to scan the barcode', async () => {
  const { say } = await import('../public/js/voice.js');
  const line = say('cam_text_no_own_price');
  assert.match(line, /price/i);
  assert.match(line, /barcode/i);
  const fr = read('../public/js/voice-fr.js');
  assert.ok(fr.includes('cam_text_no_own_price'), 'no French line for the no-price answer');
});

test('the typed route draws an own-data answer itself and never hands it to proceed', () => {
  const start = CAMERA.indexOf('    async function runTypedSearch(');
  assert.notEqual(start, -1, 'runTypedSearch is gone');
  const end = CAMERA.indexOf('    function showOwnData(', start);
  assert.notEqual(end, -1, 'showOwnData is gone');
  const route = CAMERA.slice(start, end);
  assert.ok(route.includes('if (id?.ownData) own = id;'), 'the typed route no longer recognises an own-data answer');
  const drawn = route.indexOf('showOwnData(own, text, cents);');
  assert.ok(drawn !== -1, 'the own-data answer is not drawn');
  assert.ok(drawn < route.lastIndexOf('if (typed) {'), 'the own-data answer is drawn after the proceed branch');

  // 2026-09-23: no demo-shelf shortcut, whose hit went to proceed and a paid call.
  assert.ok(!route.includes('matchCatalogue('), 'a typed name is still matched against the demo shelf');

  const show = CAMERA.slice(end, CAMERA.indexOf('\n    }\n', end));
  assert.ok(!/proceed\(|openPad\(|api\.price/.test(show), 'showOwnData reaches the paid price route');
  assert.ok(show.includes("say('cam_text_no_own_price')"), 'the no-match answer is not the plain sentence');
  assert.ok(show.includes('{ priceRoute: false }'), 'the no-match answer offers the paid "just the price" route');
  assert.ok(show.includes('geminiSheet(result, item, scanThumb, earlier)') && show.includes('fillGrounded(slot, result)'),
    'a match is not drawn on the answer sheet');
});

test('a price answer from Pexi data with no price shows the plain sentence, not "no answer"', () => {
  const start = CAMERA.indexOf('    async function proceed(item, askingCents) {');
  assert.notEqual(start, -1, 'proceed is gone');
  const body = CAMERA.slice(start, CAMERA.indexOf('\n    }\n', start));
  const own = body.indexOf('if (result.ownData && !result.found) {');
  assert.ok(own !== -1, 'proceed does not recognise a no-price answer from Pexi data');
  const failed = body.indexOf("} else if (result.kind === 'gemini') {");
  assert.ok(failed !== -1 && own < failed, 'the no-price answer falls into the Gemini branch and its "no answer" sheet first');
  assert.ok(body.slice(own, failed).includes("say('cam_text_no_own_price')"));
});
