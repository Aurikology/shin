/**
 * Writing the price down when nobody could say what the thing was.
 *
 * Asked for in these words: "there should be a enter the price based on the
 * photo that the user entered if the barcode is not visible", and the shape
 * was chosen deliberately over the two alternatives -- record it and say so
 * plainly, no verdict and no hedge, on EVERY refusal rather than only the ones
 * where identification failed.
 *
 * The interesting assertions here are the negative ones, and they are the
 * reason this file exists rather than a couple of lines bolted onto
 * `sheet.test.mjs`. What makes this feature correct is a list of things it
 * must never do: never show a verdict word, never show a tier colour, never
 * call the pricing engine, never put an English sentence on a French screen,
 * and never add a second pill to a sheet that USAGE.md gives one action. A
 * feature defined by its restraint has to be tested by its restraint.
 *
 * Two kinds of check, the split `photo-screen.test.mjs` and `notthis.test.mjs`
 * already use: the sheet builders are exported, pure and DOM-free, so they are
 * rendered for real; the click wiring lives inside camera.js's
 * `render(root, ctx)` closure, which this app has no DOM to mount, so that
 * half is checked by source. Not proof the browser runs it, but proof the
 * wiring is there and cannot be quietly deleted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { refusalSheet, observationCard } from '../public/js/screens/camera.js';
import { say } from '../public/js/voice.js';

const CAMERA = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
const CORRECTIONS = readFileSync(new URL('../public/js/corrections.js', import.meta.url), 'utf8');

/**
 * Every reason a refusal sheet is built for in the camera, including the two
 * that until today offered only the type-it route and the one that offers a
 * chip list instead of a pill.
 */
const REASONS = [
  'no_identity',
  'identity_unsure',
  'no_source_response',
  'model_timeout',
  'model_outage',
  'thin_evidence',
  'category_unsupported',
];

const refusal = (reason, detail = 'the engine said something true here.') => ({
  kind: 'refusal',
  reason,
  detail,
  identity: null,
  evidence: [],
});

const count = (html, needle) => html.split(needle).length - 1;

/** The locale swap `voice.test.mjs` uses; `locale()` reads localStorage. */
function inLocale(id, fn) {
  const hadStore = 'localStorage' in globalThis;
  const before = hadStore ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', id]]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (hadStore) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

/* ------------------------------------------------------ the route out */

test('every refusal offers the price route, the no-identity ones included', () => {
  for (const reason of REASONS) {
    const html = refusalSheet(refusal(reason), null, ['Groceries'], null, { priceRoute: true });
    assert.match(
      html,
      /data-act="priceonly"/,
      `${reason}: no way to write the price down on a refusal the shopper is looking at`,
    );
  }
});

test('the no-identity and model-down refusals keep their own repair as well', () => {
  /*
   * The price route is an ADDITION, not a replacement. "Type what it is" can
   * still reach a real verdict and this can never; taking it away to make room
   * would trade the better outcome for the consolation one.
   */
  for (const reason of ['no_identity', 'model_timeout', 'model_outage']) {
    const html = refusalSheet(refusal(reason), null, [], null, { priceRoute: true });
    assert.match(html, /data-act="typeit"/, `${reason}: lost the type-it route`);
    assert.match(html, /data-act="priceonly"/, `${reason}: lost the price route`);
  }
});

test('the price route is not a second pill, because a refusal carries one action', () => {
  /*
   * USAGE.md section 4 and section 7, and the rule `sheet.test.mjs` and
   * `photo-screen.test.mjs` already hold. This is the same rule asserted from
   * the other side: the feature added a control to these sheets and the pill
   * count did not move. It is a text button under the pill, the weight
   * `.notthis` already established on the pad.
   */
  for (const reason of REASONS) {
    const plain = refusalSheet(refusal(reason), null, ['Groceries'], null);
    const withRoute = refusalSheet(refusal(reason), null, ['Groceries'], null, { priceRoute: true });
    assert.equal(
      count(withRoute, 'class="pill'),
      count(plain, 'class="pill'),
      `${reason}: the price route added a pill to a sheet that gets one action`,
    );
  }
  const html = refusalSheet(refusal('no_identity'), null, [], null, { priceRoute: true });
  assert.match(html, /class="pad-textbtn priceonly"/);
});

test('the route is absent when there is no scan for a price to hang on', () => {
  /*
   * A price with no product AND no scan id can never be read back by anything
   * -- that is the defect the server's own refusal was written for, and it has
   * not been weakened. A button that files such a price would be a button that
   * lies, so the sheet does not draw one.
   */
  for (const reason of REASONS) {
    const html = refusalSheet(refusal(reason), null, ['Groceries'], null);
    assert.ok(!html.includes('data-act="priceonly"'), `${reason}: offered a route to nowhere`);
  }
});

/* ------------------------------------------------- the pad, with no identity */

test('the price route opens the pad with no identity on it', () => {
  const at = CAMERA.indexOf(`act === 'priceonly'`);
  assert.notEqual(at, -1, 'nothing in camera.js handles the price route');
  const block = CAMERA.slice(at, at + 400);
  assert.match(block, /openPad\(/, 'the price route does not reuse the pad');
  assert.match(block, /observationOnly:\s*true/, 'the pad is not told it has no identity');
  assert.ok(
    !/\bid:\s/.test(block) && !/\bgtin:\s/.test(block),
    'the price route invented an identity for an item nobody could identify',
  );
});

test('confirming an observation never asks the pricing engine for a verdict', () => {
  /*
   * THE ASSERTION THIS WHOLE FEATURE RESTS ON. There is no comparison set for
   * an unidentified product, so anything the engine returned would be an
   * answer to a question nobody asked, and a refusal from it would be a second
   * refusal stacked on the one already on screen.
   */
  const at = CAMERA.indexOf(`act === 'pad-confirm'`);
  assert.notEqual(at, -1, 'the pad no longer has a confirm');
  const block = CAMERA.slice(at, CAMERA.indexOf(`act === 'pad-skip'`));
  const guard = block.indexOf('observationOnly');
  const priced = block.indexOf('proceed(padItem, cents)');
  assert.notEqual(guard, -1, 'confirm does not distinguish an observation from a priced item');
  assert.notEqual(priced, -1, 'confirm no longer prices a real item');
  assert.ok(guard < priced, 'confirm calls the pricing engine before checking there is anything to price');
  assert.match(block.slice(guard, priced), /recordObservation\(cents\)/);
});

test('skipping an observation does not ask for a going rate either', () => {
  const at = CAMERA.indexOf(`act === 'pad-skip'`);
  const block = CAMERA.slice(at, at + 500);
  const guard = block.indexOf('observationOnly');
  assert.notEqual(guard, -1, 'skip would ask the engine for a range it has no comparison set for');
  assert.ok(guard < block.indexOf('proceed(padItem, undefined)'));
});

/* ------------------------------------------------------- what is submitted */

test('the observation is posted with the scan id and no invented product', () => {
  const at = CAMERA.indexOf('function recordObservation');
  assert.notEqual(at, -1, 'camera.js does not record observations');
  const block = CAMERA.slice(at, at + 1600);
  assert.match(block, /submitCorrection\(/, 'the observation does not go through the existing queue');
  assert.match(block, /scanId:\s*lastScanId/, 'the observation is not tied to the scan it is about');
  assert.match(block, /code:\s*null/, 'the observation claims a product code');
  assert.match(block, /productId:\s*null/, 'the observation claims a product id');
});

test('the scan id reaches the wire, and is cleared when the scan ends', () => {
  assert.match(CORRECTIONS, /scanId:\s*entry\.scanId/, 'corrections.js drops the scan id before sending');
  assert.match(CAMERA, /lastScanId\s*=\s*null/, 'a scan id outlives its own scan');
  assert.ok(
    CAMERA.split('lastScanId = id.scanId').length - 1 >= 3,
    'not every identify route keeps the scan id the server handed back',
  );
});

/* ------------------------------------------------------------- the card */

test('the card shows the price and says it cannot be judged', () => {
  const html = observationCard(499, '');
  assert.match(html, /\$4\.99/, 'the card does not show the price it claims to have written down');
  assert.ok(html.includes(say('price_only_recorded', { price: '$4.99', seller: '' })));
});

test('the card is never a verdict, in any of its parts', () => {
  for (const seller of ['', 'Metro']) {
    const html = observationCard(499, seller);
    assert.match(html, /data-tier="unknown"/, 'the card claimed a tier');
    for (const red of ['walk_away', '--walk', 'walk-bright', 'data-tier="steal"', 'data-tier="good"']) {
      assert.ok(!html.includes(red), `the card names ${red}`);
    }
    // No share and no watch: there is nothing to share and nothing to follow.
    assert.ok(!html.includes('data-act="share"'));
    assert.ok(!html.includes('data-act="watch"'));
    // And no hedge. "About right" IS a verdict; so is a number with a
    // weasel word in front of it.
    for (const hedge of ['approximately', 'roughly', 'about right', 'probably', 'ballpark']) {
      assert.ok(!html.toLowerCase().includes(hedge), `the card hedges: "${hedge}"`);
    }
  }
});

test('the card names the shop when there is one and invents nothing when there is not', () => {
  assert.match(observationCard(499, 'Metro'), /Metro/);
  const anon = observationCard(499, '');
  assert.ok(!/undefined|null|NaN/.test(anon), `an unnamed shop leaked into the card: ${anon}`);
});

/* -------------------------------------------------------------- both locales */

test('the card renders in French, with the same number and no English left in it', () => {
  const en = inLocale('en', () => observationCard(499, 'Metro'));
  const fr = inLocale('fr', () => observationCard(499, 'Metro'));

  // cad() is locale-aware and is not re-implemented by this card.
  assert.match(en, /\$4\.99/, 'the English card lost its price formatting');
  assert.match(fr, /4,99\s*\$/, `the French card did not use the French money format: ${fr}`);
  assert.match(fr, /Metro/, 'the shop did not survive the crossing into French');

  // The bubble and the caption both moved, not just one of them.
  const bubble = (html) => /<p class="bubble-text">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
  const vword = (html) => /<h2 class="vword"[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? '';
  assert.ok(bubble(fr) && bubble(fr) !== bubble(en), 'Shin speaks English on the French card');
  assert.ok(vword(fr) && vword(fr) !== vword(en), 'the caption was never translated');
});

test('the price route button is translated too', () => {
  const build = () => refusalSheet(refusal('no_identity'), null, [], null, { priceRoute: true });
  const label = (html) => /data-act="priceonly">([\s\S]*?)<\/button>/.exec(html)?.[1] ?? '';
  const en = label(inLocale('en', build));
  const fr = label(inLocale('fr', build));
  assert.ok(en && fr, 'the price route has no label in one of the two languages');
  assert.notEqual(fr, en, 'the price route button was never translated');
});

test('the voice key has a fallback that still refuses to judge', () => {
  /*
   * D-021: a line that interpolates a fact ships "undefined" when the caller
   * omits it. The price is the fact this line carries, so losing it is the
   * degradation worth checking -- and what is left must still be the two true
   * things, not a shrug that reads like a malfunction.
   */
  for (const id of ['deadpan', 'warm', 'blunt']) {
    for (const loc of ['en', 'fr']) {
      const out = inLocale(loc, () => say('price_only_recorded', {}, id));
      assert.ok(out.trim(), `${loc}/${id}: nothing at all when the price is missing`);
      assert.ok(!/undefined|null|NaN/.test(out), `${loc}/${id}: leaked a missing fact: ${out}`);
    }
  }
});
