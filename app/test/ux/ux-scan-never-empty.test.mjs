/**
 * A scan never ends with no result, on the phone. RULINGS.md "A scan never ends
 * with no result" (2026-10-10). Jamin: "i scanned a pack of oreos and i didn't
 * get any result. This is a huge problem."
 *
 * BLOCKS COVERED: the misread (a reading whose check digit fails "is a misread,
 * not a missing product: the camera keeps scanning for a good reading instead
 * of saying 'not found'"), and the frame (a barcode nothing names sends the
 * camera frame to be read off the pack, before anything says "not found").
 *
 * WHAT IS REAL AND WHAT IS STUBBED: the real camera screen and every module
 * under public/js (ux-b5-harness.test.mjs). The camera reader and the server
 * are stubbed; every server call is recorded, so "nothing was looked up" and
 * "the frame was sent" are both read off the wire.
 *
 * FAILS LOUDLY: the not-found sheet and the type-the-name field are each
 * checked for by what a shopper would see, so a screen that falls back to
 * either fails with a sentence saying so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, pressScan, holdSteady, typePrice, verdictAt, CODE, KD } from './ux-b5-harness.test.mjs';

const BAD_CHECKSUM = '0068100084240'; // CODE with its last digit changed: the check digit fails
const READ = { name: 'Sea Salt Coconut Sandwich Cookies', brand: 'Oreo', size: '97 g' };
/* The frame is a developer-only setting (2026-10-10): the frame tests run on a developer's phone with the
   switch on. A shopper's side is test/pack-read-developer-only-client.test.mjs. */
const DEVELOPER = { 'shin.dev': '1', 'shin.dev.packRead': '1' };

/** The server's answer for an item named by Claude's reading of the frame. */
function packRoute() {
  return async (call) => ({
    kind: 'catalogue',
    outcome: 'named_outside_catalogue',
    offerManualEntry: false,
    catalogueUp: true,
    barcode: call.body?.gtin ?? '',
    identity: { ...READ, barcode: call.body?.gtin ?? '', category: null },
    identitySource: 'claude_reading',
    range: null,
    verdict: await verdictAt(call.body?.shelfPriceCents ?? null),
    scanId: 77,
  });
}

/** What a shopper would read as "not found": the catalogue miss sheet, or the type-the-name field. */
function sawNotFound(app) {
  return app.has('.sheet.catalogue[data-outcome="not_in_catalogue"]') || app.has('[data-textroute-input]');
}

async function fallbackMs(app) {
  const { MISREAD_FALLBACK_MS } = await app.mod('screens/camera.js');
  assert.equal(typeof MISREAD_FALLBACK_MS, 'number', 'the camera screen does not say how long a misread keeps reading');
  return MISREAD_FALLBACK_MS;
}

test('a misread keeps the camera reading: nothing looked up, no "not found", and a good read then goes through', async () => {
  const app = await launchReturning();
  await pressScan(app, BAD_CHECKSUM);
  assert.equal(app.state, 'idle', `a pressed misread left the camera (state=${app.state})`);
  assert.equal(sawNotFound(app), false, 'a misread showed "not found" or asked for the name');
  assert.equal(app.server.callsTo('/api/identify').length, 0, 'a reading with a bad check digit was sent to be looked up');
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, 'the frame went out before the camera had a chance to read again');
  // The good reading arrives inside the wait and takes the ordinary road (after the press's own
  // MIN_CAPTURE_INTERVAL_MS, which a pressed misread spends like any press).
  app.hub.lost();
  await holdSteady(app, CODE, 1800);
  assert.equal(app.state, 'asking', `a good read after a misread did not open the pad (state=${app.state})`);
  await app.wait((await fallbackMs(app)) + 100);
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, 'the misread fallback fired although a good read had arrived');
  app.stop();
});

test('an auto-fired misread is loud but never "not found"', async () => {
  const app = await launchReturning();
  try {
    await holdSteady(app, BAD_CHECKSUM, 400);
  } catch {
    /* the auto-fire throws on a bad check digit; that is its loud signal */
  }
  app.takeErrors();
  assert.equal(app.state, 'idle', 'an auto-fired misread left the camera');
  assert.equal(sawNotFound(app), false, 'an auto-fired misread showed "not found"');
  app.hub.lost();
  app.stop();
});

test('misreads with no good read for the wait: the frame is read off the pack, and that name is the answer', async () => {
  const app = await launchReturning({ seed: DEVELOPER, server: { '/api/identify/pack': packRoute() } });
  await pressScan(app, BAD_CHECKSUM);
  app.hub.lost();
  await app.wait((await fallbackMs(app)) + 150);
  assert.equal(app.state, 'asking', `the misread fallback did not open the price pad (state=${app.state})`);
  assert.equal(sawNotFound(app), false, 'the misread fallback asked for the name instead of reading the frame');
  await typePrice(app, app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9']);
  const sent = app.server.callsTo('/api/identify/pack');
  assert.equal(sent.length, 1, 'the frame was not sent exactly once after the misread wait ran out');
  assert.equal(sent[0].method, 'POST');
  assert.equal(typeof sent[0].body?.frame, 'string', 'the frame route was called without a frame');
  assert.ok(sent[0].body.frame.length > 0 && !sent[0].body.frame.startsWith('data:'), 'the frame is empty or not bare base64');
  assert.equal(sent[0].body.gtin, BAD_CHECKSUM, 'the misread digits did not ride with the frame');
  assert.equal(app.server.callsTo('/api/identify').filter((c) => c.query.gtin === BAD_CHECKSUM).length, 0, 'the misread was also looked up as a barcode');
  assert.equal(sawNotFound(app), false, 'a named answer was drawn as "not found"');
  assert.match(app.text(), /Sea Salt Coconut Sandwich Cookies/, 'the name read off the pack is not on screen');
  app.stop();
});

test('a barcode nothing names: the server asks for the frame, the frame is sent, and its name is the answer', async () => {
  const identify = async (call) => {
    if (call.query.preview === '1') return { kind: 'catalogue', outcome: 'not_in_catalogue', barcode: call.query.gtin, identity: null, preview: true };
    assert.equal(call.query.canSendFrame, '1', 'the scan did not tell the server it holds a frame');
    return { kind: 'catalogue', outcome: 'frame_wanted', offerManualEntry: false, catalogueUp: true, barcode: call.query.gtin, identity: null, range: null, verdict: null, noNameReasons: ['off_not_found', 'frame_wanted'] };
  };
  const app = await launchReturning({ seed: DEVELOPER, server: { '/api/identify': identify, '/api/identify/pack': packRoute() } });
  await pressScan(app, CODE);
  await typePrice(app, app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9']);
  const sent = app.server.callsTo('/api/identify/pack');
  assert.equal(sent.length, 1, 'the frame was not sent when the server asked for it');
  assert.equal(sent[0].body?.gtin, CODE);
  assert.equal(typeof sent[0].body?.frame, 'string', 'the frame route was called without a frame');
  assert.equal(sawNotFound(app), false, 'the scan ended on "not found" although the frame named the item');
  assert.match(app.text(), /Sea Salt Coconut Sandwich Cookies/, 'the name read off the pack is not on screen');
  app.stop();
});

test('control: a barcode the catalogue names never sends a frame', async () => {
  const app = await launchReturning({ server: { '/api/identify/pack': packRoute() } });
  await pressScan(app, CODE);
  await typePrice(app, app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9']);
  assert.equal(app.atVerdict(), true, 'setup: the catalogue hit did not reach the verdict');
  assert.match(app.text(), new RegExp(KD.name));
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, 'a frame was sent for a barcode the catalogue named');
  app.stop();
});
