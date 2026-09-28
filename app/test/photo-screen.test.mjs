/**
 * The photo path's client half. docs/the-photo-path.md section 3 is the
 * contract; section 4 gives this file to lane C.
 *
 * Two kinds of check, for the same reason `sheet.test.mjs` and `notthis.test.mjs`
 * give: `identifyPhoto` (api.js) and the new refusal voice (voice.js,
 * `refusalSheet` in camera.js) are exported, pure, and DOM-free, so they are
 * exercised for real. The four-outcome routing inside `onCapture` and the
 * capture-queue caller live in camera.js's `render(root, ctx)` closure, which
 * this app has no DOM to mount (zero runtime dependencies, by decision -- see
 * sheet.test.mjs's own header) -- so those are checked by source, the same way
 * `notthis.test.mjs` checks "not this?" and `screen-fixes.test.mjs` checks the
 * router's cleanup ordering: not proof the browser runs it, but proof the wiring
 * is there and cannot be quietly deleted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { identify, identifyPhoto, identifyDemo, needsShrinking, nextShrinkScale, PHOTO_TARGET_BYTES } from '../public/js/api.js';
import { say, refusalLabel } from '../public/js/voice.js';
import { refusalSheet, retryCountdownLine } from '../public/js/screens/camera.js';

const CAMERA = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');

/* -------------------------------------------------------------- fetch stub */

let realFetch;
let calls;

function stubFetch(handler) {
  realFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** A one-pixel PNG's worth of bytes. The content does not matter, only that
    it is a Blob `identifyPhoto` can read. */
const crop = () => new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });

/* -------------------------------------------------------------- identifyPhoto */

test('identifyPhoto posts the crop as base64 JSON with sharpness, tier and deviceId', async () => {
  stubFetch(async () => jsonResponse(200, { product: { code: 'x' }, band: 'confident' }));
  try {
    const out = await identifyPhoto(crop(), { sharpness: 42, tier: 'pro', deviceId: 'device-1' });
    assert.equal(calls.length, 1, 'identifyPhoto did not call fetch exactly once');
    const { url, init } = calls[0];
    assert.equal(url, '/api/identify/photo');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    const body = JSON.parse(init.body);
    assert.equal(typeof body.image, 'string', 'no base64 image in the body');
    assert.ok(body.image.length > 0, 'the image field was sent empty');
    assert.doesNotMatch(body.image, /^data:/, 'a data: URL was sent instead of bare base64');
    assert.equal(body.sharpness, 42);
    assert.equal(body.tier, 'pro');
    assert.equal(body.deviceId, 'device-1');
    assert.deepEqual(out, { product: { code: 'x' }, band: 'confident' }, 'a 200 body was not passed through untouched');
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto treats 413 as an answer: too_large, not a throw', async () => {
  stubFetch(async () => jsonResponse(413, { error: 'too big' }));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'too_large', says: 'too big' });
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto treats 429 as an answer: rate_limited, not a throw', async () => {
  stubFetch(async () => jsonResponse(429, { error: 'slow down' }));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'rate_limited', says: 'slow down' });
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto turns a network failure into offline, so the queue can keep the photo', async () => {
  globalThis.fetch = async () => { throw new TypeError('network error'); };
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'offline' });
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto keeps the photo on a status it was not told to expect, rather than throwing it away', async () => {
  stubFetch(async () => jsonResponse(500, {}));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'offline' });
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto sends no sharpness or tier when neither was given', async () => {
  stubFetch(async () => jsonResponse(200, { product: null }));
  try {
    await identifyPhoto(crop(), { deviceId: 'd' });
    const body = JSON.parse(calls[0].init.body);
    assert.equal('sharpness' in body, false);
    assert.equal('tier' in body, false);
  } finally {
    restoreFetch();
  }
});

/* ------------------------------------------------------- item 9: retryAfterSeconds */

test('identifyPhoto threads the server\'s own retryAfterSeconds through a 429, when it sent one', async () => {
  stubFetch(async () => jsonResponse(429, { error: 'slow down', retryAfterSeconds: 12 }));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'rate_limited', says: 'slow down', retryAfterSeconds: 12 });
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto adds no retryAfterSeconds key at all when the server sent none (413 or a bare 429)', async () => {
  stubFetch(async () => jsonResponse(429, { error: 'slow down' }));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.deepEqual(out, { product: null, failure: 'rate_limited', says: 'slow down' });
    assert.equal('retryAfterSeconds' in out, false);
  } finally {
    restoreFetch();
  }
});

test('identifyPhoto never adds retryAfterSeconds to a 413: there is nothing to wait out', async () => {
  stubFetch(async () => jsonResponse(413, { error: 'too big', retryAfterSeconds: 12 }));
  try {
    const out = await identifyPhoto(crop(), { deviceId: 'd' });
    assert.equal('retryAfterSeconds' in out, false, 'a 413 sent a countdown, which the server never does, but this must not surface it either way');
  } finally {
    restoreFetch();
  }
});

/* --------------------------------------------------------------- item 10: shrink */

test('needsShrinking is false at and under the target, true only strictly over it', () => {
  assert.equal(needsShrinking(PHOTO_TARGET_BYTES - 1), false);
  assert.equal(needsShrinking(PHOTO_TARGET_BYTES), false);
  assert.equal(needsShrinking(PHOTO_TARGET_BYTES + 1), true);
  assert.equal(needsShrinking(0), false);
});

test('nextShrinkScale shrinks by the reference client\'s own 0.8x ratio, and keeps shrinking', () => {
  const first = nextShrinkScale(1);
  assert.equal(first, 0.8);
  const second = nextShrinkScale(first);
  assert.ok(second < first, 'a second pass did not shrink further');
  assert.equal(second, 0.64);
});

test('identifyPhoto still answers with an oversized blob when the environment has no canvas: hard rule 1, never a lost scan', async () => {
  // Node's test environment has neither createImageBitmap nor document, so
  // shrinkPhotoBlob's own guard skips the redraw and hands the original blob
  // back -- proving the skip path is safe, not that a real shrink ran (that
  // needs a canvas, which this app deliberately never mocks; see the
  // zero-runtime-dependency header above).
  assert.equal(typeof globalThis.createImageBitmap, 'undefined', 'this test env unexpectedly has createImageBitmap; the skip path is not being exercised');
  const oversized = new Blob([new Uint8Array(PHOTO_TARGET_BYTES + 1)], { type: 'image/png' });
  stubFetch(async () => jsonResponse(200, { product: null }));
  try {
    const out = await identifyPhoto(oversized, { deviceId: 'd' });
    assert.equal(calls.length, 1, 'an oversized photo with no canvas available never reached fetch at all');
    assert.deepEqual(out, { product: null });
  } finally {
    restoreFetch();
  }
});

/* -------------------------------------------------------------------- item 9: identify() */

test('identify() answers a 429 with failure: rate_limited and the server\'s retryAfterSeconds, never a throw', async () => {
  stubFetch(async () => jsonResponse(429, { error: 'slow down', retryAfterSeconds: 7 }));
  try {
    const out = await identify({ gtin: '0123456789012' });
    assert.deepEqual(out, { product: null, failure: 'rate_limited', says: 'slow down', retryAfterSeconds: 7 });
  } finally {
    restoreFetch();
  }
});

test('identify() still returns the plain body on an ordinary 200, unchanged', async () => {
  stubFetch(async () => jsonResponse(200, { product: { code: 'x' }, band: 'confident' }));
  try {
    const out = await identify({ gtin: '0123456789012' });
    assert.deepEqual(out, { product: { code: 'x' }, band: 'confident' });
  } finally {
    restoreFetch();
  }
});

/* ---------------------------------------------------------------- item 19: demo */

test('identifyDemo degrades to null when the demo route does not exist yet (getSoft, same as consent/rating/events)', async () => {
  stubFetch(async () => jsonResponse(404, {}));
  try {
    const out = await identifyDemo();
    assert.equal(out, null);
  } finally {
    restoreFetch();
  }
});

test('identifyDemo passes a real demo answer straight through', async () => {
  const demo = { demo: true, model: 'deterministic-sample-v1', product: { code: 'd', name: 'Demo Thing', brand: 'Demo', size: '1 ea' }, category: 'demo', askingCents: 199, verdictWord: 'fair', band: 'confident' };
  stubFetch(async () => jsonResponse(200, demo));
  try {
    const out = await identifyDemo();
    assert.deepEqual(out, demo);
  } finally {
    restoreFetch();
  }
});

/* --------------------------------------------------------- the refusal voice */

/** The five failure classes the photo model itself can return, per
    identify/src/model.ts's FailureClass, minus the two the route answers
    before a model is ever asked (too_large, rate_limited) and the one that
    means the model looked and failed (unreadable_photo, folded into
    no_identity per the task contract). `model_client_error` (no usable model
    key at all) joined the other four 2026-09-28, D-150. */
const MODEL_DOWN_REASONS = ['model_timeout', 'model_outage', 'model_rate_limited', 'spend_cap_reached', 'model_client_error'];

test('every model-down failure has its own refusal label, never the bare fallback', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const said = refusalLabel(reason);
    assert.notEqual(said, 'Refused', `${reason}: fell back to the bare word, D-011's failure mode`);
    assert.ok(!said.includes('_'), `${reason}: the raw code leaked into the label: ${said}`);
    assert.ok(!said.includes(reason), `${reason}: the raw code appears in its own label: ${said}`);
  }
});

test('every model-down failure has a sentence in all three personalities, and it never says the raw class', () => {
  const keys = {
    model_timeout: 'cam_photo_model_timeout',
    model_outage: 'cam_photo_model_outage',
    model_rate_limited: 'cam_photo_model_rate_limited',
    spend_cap_reached: 'cam_photo_spend_cap_reached',
    model_client_error: 'cam_photo_model_client_error',
  };
  for (const [reason, key] of Object.entries(keys)) {
    for (const who of ['deadpan', 'warm', 'blunt']) {
      const line = say(key, {}, who);
      assert.ok(line.length > 0, `${key}/${who}: no line at all`);
      assert.ok(!line.includes(reason), `${key}/${who}: the raw failure class reached the screen: ${line}`);
      assert.ok(!line.includes('_'), `${key}/${who}: looks like a raw identifier, not a sentence: ${line}`);
    }
  }
});

test('the offline and unreadable-photo lines exist in all three personalities', () => {
  for (const key of ['cam_photo_offline', 'cam_photo_unreadable']) {
    for (const who of ['deadpan', 'warm', 'blunt']) {
      assert.ok(say(key, {}, who).length > 0, `${key}/${who}: no line`);
    }
  }
});

/* -------------------------------------------------------- refusalSheet, live */

const refusal = (reason, detail) => ({ kind: 'refusal', reason, detail, identity: null, evidence: [] });

test('a model-down refusal sheet carries a real sentence and never the raw class', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const detail = say(`cam_photo_${reason}`);
    const html = refusalSheet(refusal(reason, detail), null, []);
    assert.doesNotMatch(html, new RegExp(reason), `${reason}: the raw failure class reached the sheet's own markup`);
    assert.ok(html.includes(detail), `${reason}: the detail sentence did not render`);
    assert.doesNotMatch(html, /undefined|null/, `${reason}: a missing fact leaked onto the sheet`);
  }
});

/**
 * The refusal used to say the same thing three times: a generic
 * `refuse_unavailable_why` line ("This is the reader, not your photo. The
 * barcode and typing it still work."), then `r.detail`'s own per-class
 * sentence saying almost the same two facts in different words, then the
 * footer's `refusalLabel(reason)` repeating the "what happened" half a third
 * time ("Refused. The photo reader took too long."). `r.detail` alone
 * already carries both what happened and what still works, so the generic
 * line is retired and the footer falls back to the bare word instead of
 * restating the reason.
 */
test('a model-down refusal no longer repeats what-still-works in a second said line, in any voice', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const detail = say(`cam_photo_${reason}`);
    const html = refusalSheet(refusal(reason, detail), null, []);
    for (const who of ['deadpan', 'warm', 'blunt']) {
      const retired = say('refuse_unavailable_why', {}, who);
      assert.ok(!html.includes(retired), `${reason}/${who}: the retired refuse_unavailable_why line still renders: "${retired}"`);
    }
  }
});

test('a model-down refusal footer adds the bare word, not a third repeat of the reason', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const html = refusalSheet(refusal(reason, say(`cam_photo_${reason}`)), null, []);
    const itemname = /<p class="itemname">([\s\S]*?)<\/p>/.exec(html);
    assert.ok(itemname, `${reason}: no itemname footer at all`);
    assert.match(itemname[1], /&middot; Refused\.$/, `${reason}: the footer restates the reason instead of the bare word: "${itemname[1]}"`);
  }
});

test('a model-down refusal offers exactly one action: type what it is', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const html = refusalSheet(refusal(reason, say(`cam_photo_${reason}`)), null, []);
    const pills = html.split('class="pill').length - 1;
    assert.equal(pills, 1, `${reason}: expected one action, found ${pills}`);
    assert.match(html, /data-act="typeit"/, `${reason}: the repair is not the type-it route`);
  }
});

test('a model-down refusal is grey and never tier-red, like every other refusal', () => {
  for (const reason of MODEL_DOWN_REASONS) {
    const html = refusalSheet(refusal(reason, say(`cam_photo_${reason}`)), null, []);
    assert.match(html, /data-tier="unknown"/);
    assert.match(html, /data-conf="refuses"/);
    for (const red of ['walk_away', '--walk', 'walk-bright']) {
      assert.ok(!html.includes(red), `${reason}: refusal markup names ${red}`);
    }
  }
});

test('unreadable_photo renders under no_identity with its own sentence, not the barcode no-match line', () => {
  const html = refusalSheet(refusal('no_identity', say('cam_photo_unreadable')), null, []);
  assert.match(html, /data-act="typeit"/);
  assert.ok(html.includes(say('cam_photo_unreadable')));
});

test('a queued offline photo renders under no_source_response with the app-voice offline sentence', () => {
  const html = refusalSheet(refusal('no_source_response', say('cam_photo_offline')), null, []);
  assert.ok(html.includes(say('cam_photo_offline')));
});

/* ------------------------------------------------- item 9: throttled refusals */

// too_large and rate_limited (THROTTLE_REASONS in camera.js) are declined,
// not a model failure and not the generic unknown refusal: their own title,
// no second restated line, and the same "type what it is" repair the other
// dead-ends already offer, per failure.md D9.5/D9.6.
const THROTTLE_REASONS_TESTED = ['too_large', 'rate_limited'];

test('too_large and rate_limited title the sheet "declined", never the generic unknown refusal', () => {
  for (const reason of THROTTLE_REASONS_TESTED) {
    const html = refusalSheet(refusal(reason, say(`cam_photo_${reason}`, {})), null, []);
    assert.ok(html.includes(say('refuse_declined')), `${reason}: the sheet does not use the refuse_declined title`);
    assert.ok(!html.includes(say('refuse_unknown')), `${reason}: fell back to the generic unknown-refusal title`);
  }
});

test('too_large and rate_limited do not repeat the detail in a second said line', () => {
  for (const reason of THROTTLE_REASONS_TESTED) {
    const detail = say(`cam_photo_${reason}`, {});
    const html = refusalSheet(refusal(reason, detail), null, []);
    assert.ok(html.includes(detail), `${reason}: the detail sentence did not render at all`);
    for (const who of ['deadpan', 'warm', 'blunt']) {
      const retired = say('refuse_unknown_why', {}, who);
      assert.ok(!html.includes(retired), `${reason}/${who}: a second generic line was appended beside the detail`);
    }
  }
});

test('too_large and rate_limited offer "type what it is", the same repair as no_identity and model-down', () => {
  for (const reason of THROTTLE_REASONS_TESTED) {
    const html = refusalSheet(refusal(reason, say(`cam_photo_${reason}`, {})), null, []);
    const pills = html.split('class="pill').length - 1;
    assert.equal(pills, 1, `${reason}: expected exactly one action`);
    assert.match(html, /data-act="typeit"/, `${reason}: the repair is not the type-it route`);
  }
});

test('a rate-limited refusal that carries a keepable price still offers Keep it, not type-it', () => {
  const html = refusalSheet(refusal('rate_limited', say('cam_photo_rate_limited', {})), null, [], { cents: 199, shopId: 's1' });
  assert.match(html, /data-act="keepit"/);
});

/* --------------------------------------------------------- retryCountdownLine */

test('retryCountdownLine counts down from the server\'s own seconds, rounded up to a whole second', () => {
  const line = retryCountdownLine(11.4);
  assert.ok(line.includes('12s'), `expected a rounded-up 12s in: ${line}`);
});

test('retryCountdownLine with no usable number falls back to the localized line, never a hardcoded English placeholder', () => {
  for (const bad of [null, undefined, NaN, 0, -3]) {
    const line = retryCountdownLine(bad);
    assert.ok(line.length > 0, `retryCountdownLine(${bad}) produced nothing`);
    assert.doesNotMatch(line, /undefined|null|NaN/, `retryCountdownLine(${bad}) leaked a missing fact: ${line}`);
  }
});

/* --------------------------------------------------------- camera.js wiring */

/**
 * The wiring inside `render(root, ctx)` cannot be exercised without a DOM this
 * app deliberately does not carry (see file header). This is source-checked
 * the way `notthis.test.mjs` checks the ranked-search wiring and
 * `screen-fixes.test.mjs` checks the router's cleanup ordering: it is proof
 * the call is there and cannot be quietly deleted, not proof the browser runs
 * it -- that is the lane report's "not walked in a browser" line.
 */

test('onCapture sends the crop through identifyPhoto, gated on there being no stable barcode', () => {
  const onCapture = CAMERA.slice(CAMERA.indexOf('onCapture: (crop) => {'), CAMERA.indexOf('}).then((e) => {'));
  assert.match(onCapture, /if \(barcodeInFlight\) return;/, 'a stable barcode does not defer to the photo route');
  assert.match(onCapture, /handlePhotoCapture\(crop\);/, 'the crop is never sent to be identified');
});

// Item 10 (2026-09-17): the price is asked at scan time, so the crop waits in
// the pending scan and `resolvePhoto` sends it once the pad is done.
const PHOTO_FN = () => CAMERA.slice(CAMERA.indexOf('async function resolvePhoto'), CAMERA.indexOf('function showPhotoRefusal'));

test('a stable barcode raises the guard, and reset() is what lowers it', () => {
  const onBarcodeStart = CAMERA.indexOf('async function onBarcode(read) {');
  assert.notEqual(onBarcodeStart, -1, 'onBarcode moved or was renamed');
  const opening = CAMERA.slice(onBarcodeStart, onBarcodeStart + 400);
  assert.match(opening, /barcodeInFlight = true;/, 'onBarcode does not raise the guard near the top of the function');
  const resetStart = CAMERA.indexOf('function reset() {');
  // 1200, not 800: task item 4 (2026-09-14) added abandonment tracking ahead
  // of `barcodeInFlight = false;` in this function (an abandoned typed search
  // and `scan_abandoned`, both read state before `slot.innerHTML` wipes it),
  // which pushed this line further into the function than the old window.
  const resetFn = CAMERA.slice(resetStart, resetStart + 2200);
  assert.match(resetFn, /barcodeInFlight = false;/, 'reset() does not lower the guard');
});

test('a photo asks its price first, then resolvePhoto sends the crop with it', () => {
  const start = CAMERA.indexOf('function handlePhotoCapture');
  assert.notEqual(start, -1, 'handlePhotoCapture moved or was renamed');
  const head = CAMERA.slice(start, CAMERA.indexOf('async function resolvePhoto'));
  assert.match(head, /askPriceFirst\(\{ kind: 'photo', crop \}\)/, 'the photo does not ask the price before identifying');
  assert.doesNotMatch(head, /identifyPhoto/, 'the photo is identified before the price is asked');
  assert.match(PHOTO_FN(), /identifyPhoto\(crop\.blob, \{[^}]*shelfPriceCents/, 'the typed price does not ride in the photo request');
});

test('an identified photo reuses proceed and productLabel rather than a second copy of the typed route', () => {
  const fn = PHOTO_FN();
  assert.match(fn, /id\?\.product && id\.band !== 'low'/, 'the identified branch is not gated on the band');
  assert.match(fn, /proceed\(\{/, 'the identified branch does not go on to the answer');
  assert.doesNotMatch(fn, /openPad\(/, 'the identified branch asks the price a second time');
  assert.match(fn, /text: productLabel\(id\.product\)/, 'the identified branch does not reuse productLabel');
  assert.doesNotMatch(fn, /function productLabel/, 'productLabel was redefined instead of reused');
});

test('unsure candidates go to searchCandidateSheet, the same picker "not this?" uses', () => {
  const fn = PHOTO_FN();
  assert.match(fn, /Array\.isArray\(id\?\.candidates\) && id\.candidates\.length/);
  assert.match(fn, /searchCandidateSheet\(mapped, readAs\)/);
});

test('a failure with no product and no candidates never falls through silently', () => {
  const fn = PHOTO_FN();
  // Every exit either shows a photo refusal or opens the pad or shows the
  // candidate sheet; there is no path that returns having painted nothing.
  const showRefusalCalls = fn.split('showPhotoRefusal(').length - 1;
  assert.ok(showRefusalCalls >= 3, `expected offline, model-down and the fallback miss to all call showPhotoRefusal, found ${showRefusalCalls} call(s)`);
});

test('an offline answer enqueues the crop through the eye\'s own queue', () => {
  const fn = PHOTO_FN();
  assert.match(fn, /void enqueuePhotoCapture\(crop\);/);
  const enqueueFn = CAMERA.slice(CAMERA.indexOf('async function enqueuePhotoCapture'), CAMERA.indexOf('function reset() {'));
  assert.match(enqueueFn, /mod\.enqueue\(\{/, 'the offline capture is not written to the durable queue');
  assert.match(enqueueFn, /blob: crop\.blob/);
});

test('the barcode path is untouched: a stable barcode still resolves through ctx.api.identify, never the photo route', () => {
  const onBarcodeFn = CAMERA.slice(CAMERA.indexOf('async function onBarcode(read)'), CAMERA.indexOf('async function catalogueLookup'));
  assert.match(onBarcodeFn, /catalogueLookup\(code, cents\)/);
  assert.doesNotMatch(onBarcodeFn, /identifyPhoto/, 'the barcode path was wired to the photo route');
  const catalogueLookupFn = CAMERA.slice(CAMERA.indexOf('async function catalogueLookup'), CAMERA.indexOf('/** Brand, name and size, without'));
  assert.match(catalogueLookupFn, /ctx\.api\.identify\(\{ gtin: code, shelfPriceCents \}\)/);
});

test('startCaptureQueue is imported and started once, with a send that answers through identifyPhoto', () => {
  assert.match(CAMERA, /import \{ attachEye, startCaptureQueue \} from '\.\.\/eye-attach\.js';/);
  assert.match(CAMERA, /startCaptureQueue\(sendQueuedCapture\)\.then\(\(stop\) => \{/, 'startCaptureQueue was not given a caller');
  const sendFn = CAMERA.slice(CAMERA.indexOf('function sendQueuedCapture'), CAMERA.indexOf('/** Decision 13'));
  assert.match(sendFn, /ctx\.api\.identifyPhoto\(item\.blob, \{\}\)/);
  assert.match(sendFn, /res\?\.failure !== 'offline'/, 'the queue does not resolve a non-offline answer');
});

test('the capture queue is torn down when the screen unmounts', () => {
  const teardown = CAMERA.slice(CAMERA.lastIndexOf('return () => {'), CAMERA.lastIndexOf('};'));
  assert.match(teardown, /stopCaptureQueue\(\);/, 'the queue outlives the screen that started it');
  // stopCaptureQueue is only ever assigned from startCaptureQueue's own
  // resolution, so the teardown call proves it is the same handle, not a
  // second unrelated stop function.
  assert.match(CAMERA, /stopCaptureQueue = stop;/);
});

/* --------------------------------------------- D-150: model outage, by source */

// The barcode and typed routes went through /api/identify with no branch at
// all for a model-down failure, so a keyless or misconfigured server told a
// shopper "we have never seen this" instead of naming the outage. Checked by
// source, the same way the two tests above check catalogueLookup and
// startCaptureQueue: the branch lives in a closure this file has no DOM to
// mount.
test('the barcode route checks MODEL_DOWN_REASONS before falling through to the catalogue-miss candidate list', () => {
  const fn = CAMERA.slice(
    CAMERA.indexOf('async function catalogueLookup'),
    CAMERA.indexOf('/** Brand, name and size, without'),
  );
  assert.match(fn, /MODEL_DOWN_REASONS\.has\(id\.failure\)/, 'catalogueLookup never checks a model-down failure');
  assert.match(fn, /return \{ modelDown: id\.failure \};/);
  // Checked before the unchecked/catalogueUp/product branches, the same
  // ordering rate_limited and scan_limit already use above it.
  const modelDownAt = fn.indexOf('MODEL_DOWN_REASONS.has(id.failure)');
  const uncheckedAt = fn.indexOf('id.unchecked?.label');
  assert.ok(modelDownAt > -1 && uncheckedAt > -1 && modelDownAt < uncheckedAt, 'the model-down check runs after the unchecked branch, which would answer first');
});

test('resolveBarcode paints a model-down answer as refuse_unavailable, not the catalogue-miss list', () => {
  const fn = CAMERA.slice(CAMERA.indexOf('async function resolveBarcode'), CAMERA.indexOf('async function catalogueLookup'));
  assert.match(fn, /found\?\.modelDown/, 'resolveBarcode never reads the modelDown marker catalogueLookup returns');
  assert.match(fn, /showPhotoRefusal\(found\.modelDown, say\('cam_reader_model_down'\)\)/);
});

test('the typed route checks MODEL_DOWN_REASONS before the "nothing in what Shin has been taught" refusal', () => {
  const fn = CAMERA.slice(CAMERA.indexOf('async function runTypedSearch'), CAMERA.length);
  assert.match(fn, /idFailure = id\?\.failure \?\? null;/, 'runTypedSearch never keeps the failure code past its try block');
  assert.match(fn, /MODEL_DOWN_REASONS\.has\(idFailure\)/);
  assert.match(fn, /say\('cam_reader_model_down'\)/);
  // The model-down branch has to run before the hard-coded no_identity
  // fallback, or a model outage still reaches "nothing in what Shin has been
  // taught matches" first.
  const modelDownAt = fn.indexOf('MODEL_DOWN_REASONS.has(idFailure)');
  const noMatchAt = fn.indexOf('cam_text_no_match');
  assert.ok(modelDownAt > -1 && noMatchAt > -1 && modelDownAt < noMatchAt, 'cam_text_no_match still renders before the model-down check');
});

test('cam_reader_model_down and the generalised refuse_unavailable never name a photo', () => {
  for (const who of ['deadpan', 'warm', 'blunt']) {
    assert.doesNotMatch(say('cam_reader_model_down', {}, who), /photo/i, `cam_reader_model_down/${who} names a photo on a route that may be barcode or typed`);
    assert.doesNotMatch(say('refuse_unavailable', {}, who), /photo/i, `refuse_unavailable/${who} names a photo on a route that may be barcode or typed`);
  }
});

/* ---------------------------------------------------- D-148: the shelf stream */

test('startShelf does not run when FLAGS.photoId is off, even with photo consent on', () => {
  const fn = CAMERA.slice(CAMERA.indexOf('const startShelf = () => {'), CAMERA.indexOf('ctx.api.scenarios()'));
  assert.match(fn, /if \(!FLAGS\.photoId \|\| store\.consent\(\)\.photos !== true\) return;/, 'startShelf no longer gates on FLAGS.photoId');
});
