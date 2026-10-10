/**
 * THE PACK READ IS DEVELOPER-ONLY, ON THE PHONE. And D-232: a barcode the
 * camera keeps seeing but cannot read is said out loud, with typing offered.
 *
 * RULINGS.md "A scan never ends with no result", amended 2026-10-10. Jamin:
 * "sending picture to claude is a developer only setting". The camera frame
 * leaves the phone only when the Developer row's switch is on; it is off by
 * default, so a shopper never sends `canSendFrame` and never calls
 * `/api/identify/pack`. A misread with the switch off ends on typing the name,
 * logged loudly with the reason.
 *
 * D-232: zxing never hands the screen an EAN-13 whose check digit fails, so a
 * damaged grocery barcode used to leave the camera aiming with nothing said.
 * The eye now reports a barcode it keeps seeing but cannot decode
 * (`onUnreadable`); the screen tells the shopper plainly and offers typing the
 * name, and with the switch on it takes the developer path (the frame).
 *
 * The real camera screen and the real You page under the ux-b5 harness; the
 * eye and the server are stubbed and every server call is recorded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, pressScan, typePrice, verdictAt, CODE } from './ux/ux-b5-harness.test.mjs';

const BAD_CHECKSUM = '0068100084240';
const DEV_ON = { 'shin.dev': '1', 'shin.dev.packRead': '1' };
const DEV_SWITCH_OFF = { 'shin.dev': '1' };
const READ = { name: 'Sea Salt Coconut Sandwich Cookies', brand: 'Oreo', size: '97 g' };

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

/** The server's answer for a barcode nothing names: frame_wanted when the client may send one, typing otherwise. */
function missRoute(seen) {
  return async (call) => {
    if (call.query.preview === '1') return { kind: 'catalogue', outcome: 'not_in_catalogue', barcode: call.query.gtin, identity: null, preview: true };
    seen.push(call);
    if (call.query.canSendFrame === '1') {
      return { kind: 'catalogue', outcome: 'frame_wanted', offerManualEntry: false, catalogueUp: true, barcode: call.query.gtin, identity: null, range: null, verdict: null, noNameReasons: ['off_not_found', 'frame_wanted'] };
    }
    return { kind: 'catalogue', outcome: 'not_in_catalogue', offerManualEntry: true, catalogueUp: true, barcode: call.query.gtin, identity: null, range: null, verdict: null, noNameReasons: ['off_not_found', 'pack_read_developer_only'], scanId: 12 };
  };
}

async function fallbackMs(app) {
  const { MISREAD_FALLBACK_MS } = await app.mod('screens/camera.js');
  assert.equal(typeof MISREAD_FALLBACK_MS, 'number', 'the camera screen does not say how long a misread keeps reading');
  return MISREAD_FALLBACK_MS;
}

/** console.error, captured for one launch: the loud log a missing name must leave. */
function captureErrors() {
  const lines = [];
  const real = console.error;
  console.error = (...args) => { lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
  return { lines, restore: () => { console.error = real; } };
}

const PRICE = (app) => (app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9']);

test('a shopper (switch never touched): the scan never says it holds a frame and no frame is ever sent', async () => {
  const seen = [];
  const app = await launchReturning({ server: { '/api/identify': missRoute(seen), '/api/identify/pack': packRoute() } });
  await pressScan(app, CODE);
  await typePrice(app, PRICE(app));
  assert.ok(seen.length >= 1, 'setup: the priced barcode lookup never reached the server');
  assert.equal(seen.some((c) => c.query.canSendFrame === '1'), false, 'a shopper told the server it holds a camera frame: the pack read is developer-only');
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, "a shopper's camera frame was sent to be read by Claude");
  app.stop();
});

test('a shopper misread: no frame after the wait; typing is offered and the reason is logged loudly', async () => {
  const log = captureErrors();
  try {
    const app = await launchReturning({ server: { '/api/identify/pack': packRoute() } });
    await pressScan(app, BAD_CHECKSUM);
    app.hub.lost();
    await app.wait((await fallbackMs(app)) + 150);
    assert.equal(app.server.callsTo('/api/identify/pack').length, 0, "a shopper's misread sent the camera frame to Claude");
    assert.ok(app.has('[data-act="unreadable-typeit"]'), `after the misread wait a shopper was not offered typing the name (state=${app.state}); text: ${app.text().slice(0, 200)}`);
    assert.ok(log.lines.some((l) => /pack_read_developer_only/.test(l)), `the misread that ended on typing was not logged with its reason: ${JSON.stringify(log.lines)}`);
    app.stop();
  } finally {
    log.restore();
  }
});

test('a developer with the switch on: the scan says it holds a frame, and the frame is sent when asked', async () => {
  const seen = [];
  const app = await launchReturning({ seed: DEV_ON, server: { '/api/identify': missRoute(seen), '/api/identify/pack': packRoute() } });
  await pressScan(app, CODE);
  await typePrice(app, PRICE(app));
  assert.ok(seen.some((c) => c.query.canSendFrame === '1'), 'control failed: with the developer switch on the scan did not offer the frame');
  const sent = app.server.callsTo('/api/identify/pack');
  assert.equal(sent.length, 1, 'with the developer switch on, the frame was not sent when the server asked for it');
  assert.equal(typeof sent[0].body?.frame, 'string');
  assert.match(app.text(), /Sea Salt Coconut Sandwich Cookies/, 'the name read off the pack is not on screen');
  app.stop();
});

test('a developer device with the switch off sends no frame, from a scan or from a misread', async () => {
  const seen = [];
  const app = await launchReturning({ seed: DEV_SWITCH_OFF, server: { '/api/identify': missRoute(seen), '/api/identify/pack': packRoute() } });
  await pressScan(app, CODE);
  await typePrice(app, PRICE(app));
  assert.equal(seen.some((c) => c.query.canSendFrame === '1'), false, 'the developer row is showing but its switch is off, and the scan still offered the frame');
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, 'a frame was sent with the developer switch off');
  app.stop();
});

test('the Developer row has the pack-read switch, off by default, and a tap turns it on', async () => {
  const app = await launchReturning({ seed: { 'shin.dev': '1' }, search: '?s=you' });
  if (app.screen !== 'you') await app.tap('[data-act="you"]', 'You');
  assert.equal(app.screen, 'you', `setup: the You page did not open (screen=${app.screen})`);
  const sw = app.root.querySelector('[data-pack-read-switch]');
  assert.ok(sw, 'the Developer row has no switch for sending the picture to Claude');
  assert.equal(sw.getAttribute('aria-checked'), 'false', 'the pack-read switch is not off by default');
  await app.tap('[data-pack-read-switch]', 'pack read switch');
  assert.equal(app.root.querySelector('[data-pack-read-switch]').getAttribute('aria-checked'), 'true', 'a tap did not turn the pack-read switch on');
  const { packReadOn } = await app.mod('dev-mode.js');
  assert.equal(packReadOn(), true, 'the switch shows on, but the setting the camera reads is still off');
  app.stop();
});

test('D-232: a barcode the eye keeps seeing but cannot read is said plainly, and typing the name is offered', async () => {
  const app = await launchReturning();
  const h = app.hub.handlers;
  assert.equal(typeof h?.onUnreadable, 'function', 'the camera screen does not listen for a barcode the eye sees but cannot read, so a damaged barcode leaves the shopper aiming with nothing on screen');
  h.onUnreadable({ value: BAD_CHECKSUM, format: 'EAN13', box: null, frames: 20 });
  await app.wait(50);
  assert.equal(app.state, 'idle', 'the camera left the viewfinder for an unreadable barcode');
  assert.ok(app.has('[data-act="unreadable-typeit"]'), `no way to type the name was offered for an unreadable barcode; text: ${app.text().slice(0, 200)}`);
  assert.match(app.root.querySelector('.cam-shin')?.textContent ?? '', /can.t read/i, 'Pexi did not say plainly that it cannot read the barcode');
  assert.equal(app.server.callsTo('/api/identify/pack').length, 0, "a shopper's unreadable barcode sent the frame to Claude");
  await app.tap('[data-act="unreadable-typeit"]', 'type the name');
  assert.ok(app.has('[data-textroute-input]'), 'tapping "type the name" did not open the name field');
  app.stop();
});

test('D-232, developer path: with the switch on an unreadable barcode sends the frame after the misread wait', async () => {
  const app = await launchReturning({ seed: DEV_ON, server: { '/api/identify/pack': packRoute() } });
  app.hub.handlers.onUnreadable?.({ value: BAD_CHECKSUM, format: 'EAN13', box: null, frames: 20 });
  await app.wait((await fallbackMs(app)) + 150);
  await typePrice(app, PRICE(app));
  const sent = app.server.callsTo('/api/identify/pack');
  assert.equal(sent.length, 1, 'with the developer switch on, an unreadable barcode did not send its frame');
  assert.equal(sent[0].body?.gtin, BAD_CHECKSUM, 'the unreadable digits did not ride with the frame');
  app.stop();
});
