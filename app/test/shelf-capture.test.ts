/**
 * Item 16, 2026-09-17: continuous shelf capture, storage only.
 *
 * His words: "Cropped photos of what the camera sees can be constantly sent to
 * the server to be saved."; the build rules: never slows the viewfinder or the
 * scan, no model call per crop, covered by the photo consent, throttled.
 *
 * What is proven here: the send/skip decision (consent, busy, offline, gap, cap,
 * same view, black frame), the crop geometry, the server's own consent check,
 * size and daily cap, that nothing on the path calls a model, and that the
 * screen only starts it when the eye is live and stops it with the screen.
 * NOT proven, because it cannot be off a phone: battery cost, data use, and how
 * much of a real shelf changes between frames. Both need a real-phone
 * measurement before the beta; SHELF_MIN_GAP_MS and SHELF_MAX_PER_VISIT are the
 * dials.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldSendShelf,
  signatureOf,
  signatureDistance,
  coverCrop,
  shelfSize,
  SHELF_START,
  SHELF_MIN_GAP_MS,
  SHELF_MAX_PER_VISIT,
  SHELF_MAX_SIDE,
} from '../src/eye/shelf.ts';
import { saveShelfFrame, resetShelfCountsForTests, SHELF_DAILY_CAP } from '../src/shelf.ts';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const sigA = new Array(48).fill(0.3);
const sigB = new Array(48).fill(0.7);
const ok = { now: 100_000, consent: true, busy: false, online: true, signature: sigA, mean: 90 };

test('the first picture is sent when everything allows it', () => {
  const v = shouldSendShelf(SHELF_START, ok);
  assert.equal(v.send, true);
});

test('no consent means no picture, whatever else is true', () => {
  const v = shouldSendShelf(SHELF_START, { ...ok, consent: false });
  assert.equal(v.send, false);
  assert.match((v as { why: string }).why, /consent/);
});

test('nothing is sent while a scan is under way, or offline', () => {
  assert.equal(shouldSendShelf(SHELF_START, { ...ok, busy: true }).send, false, 'a picture was kept during a scan');
  assert.equal(shouldSendShelf(SHELF_START, { ...ok, online: false }).send, false);
});

test('pictures are spaced by the minimum gap', () => {
  const first = shouldSendShelf(SHELF_START, ok);
  assert.ok(first.send);
  const soon = shouldSendShelf(first.next, { ...ok, now: ok.now + SHELF_MIN_GAP_MS - 1, signature: sigB });
  assert.equal(soon.send, false, 'two pictures inside the minimum gap');
  const later = shouldSendShelf(first.next, { ...ok, now: ok.now + SHELF_MIN_GAP_MS, signature: sigB });
  assert.equal(later.send, true);
});

test('the same view is not sent twice, a new one is', () => {
  const first = shouldSendShelf(SHELF_START, ok);
  assert.ok(first.send);
  const t = ok.now + SHELF_MIN_GAP_MS * 2;
  assert.equal(shouldSendShelf(first.next, { ...ok, now: t, signature: sigA }).send, false, 'a phone held still sent the same shelf again');
  assert.equal(shouldSendShelf(first.next, { ...ok, now: t, signature: sigB }).send, true);
});

test('a visit is capped', () => {
  let state = SHELF_START;
  let sent = 0;
  let t = 0;
  for (let i = 0; i < SHELF_MAX_PER_VISIT + 25; i += 1) {
    t += SHELF_MIN_GAP_MS;
    const v = shouldSendShelf(state, { ...ok, now: t, signature: i % 2 ? sigA : sigB });
    if (v.send) {
      sent += 1;
      state = v.next;
    }
  }
  assert.equal(sent, SHELF_MAX_PER_VISIT, 'the per-visit cap did not hold');
});

test('a covered lens is not a shelf', () => {
  assert.equal(shouldSendShelf(SHELF_START, { ...ok, mean: 3 }).send, false);
});

test('signatures tell two different frames apart and the same frame together', () => {
  const frame = (v: number) => ({ width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4).fill(v) });
  assert.ok(signatureDistance(signatureOf(frame(40)), signatureOf(frame(40))) < 1e-9);
  assert.ok(signatureDistance(signatureOf(frame(40)), signatureOf(frame(200))) > 0.4);
});

test('the crop is what the shopper can see, and stored pictures are bounded', () => {
  // A landscape frame in a tall portrait viewfinder: cover crops the sides.
  const c = coverCrop(1920, 1080, 390, 844);
  assert.ok(c.width < 1920 && c.height === 1080, 'a landscape frame was not cropped to a portrait view');
  assert.ok(Math.abs(c.x - (1920 - c.width) / 2) < 1e-6, 'the crop is not centred');
  assert.deepEqual(coverCrop(1080, 1920, 1080, 1920), { x: 0, y: 0, width: 1080, height: 1920 });
  const s = shelfSize(3000, 2000);
  assert.equal(Math.max(s.width, s.height), SHELF_MAX_SIDE);
  assert.deepEqual(shelfSize(640, 480), { width: 640, height: 480 }, 'a small crop was upscaled');
});

/* ------------------------------------------------------------ the server */

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const body = (over: Record<string, unknown> = {}) => ({
  deviceId: 'device-abcdef12',
  frame: jpeg.toString('base64'),
  width: 640,
  height: 480,
  takenAt: '2026-09-19T10:00:00.000Z',
  ...over,
});

let dir = '';
const env = () => ({ ...process.env, SHIN_PHOTOS: dir });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shin-shelf-'));
  resetShelfCountsForTests();
});

test('a consented frame is stored as a file with a note beside it', () => {
  const r = saveShelfFrame(body(), { env: env(), keep: () => true, photoId: () => true, free: () => 1e12, now: new Date('2026-09-19T10:00:05Z') });
  assert.equal(r.status, 204);
  const folder = join(dir, 'shelf', '2026-09-19', 'device-abcdef12');
  const files = readdirSync(folder);
  assert.ok(files.some((f) => f.endsWith('.jpg')), 'no picture was written');
  assert.ok(files.some((f) => f.endsWith('.json')), 'no note was written beside it');
});

test('without photo consent the server stores nothing', () => {
  const r = saveShelfFrame(body(), { env: env(), keep: () => false, photoId: () => true, free: () => 1e12 });
  assert.equal(r.status, 403);
  assert.equal(existsSync(join(dir, 'shelf')), false, 'a frame was written for a device that did not consent');
});

test('something that is not an image, or has no device, is refused', () => {
  assert.equal(saveShelfFrame(body({ frame: Buffer.from('not an image at all').toString('base64') }), { env: env(), keep: () => true, photoId: () => true, free: () => 1e12 }).status, 400);
  assert.equal(saveShelfFrame(body({ deviceId: '../../etc' }), { env: env(), keep: () => true, photoId: () => true, free: () => 1e12 }).status, 400);
  assert.equal(saveShelfFrame(null, { env: env(), keep: () => true, photoId: () => true, free: () => 1e12 }).status, 400);
});

test('a device cannot store more than the daily cap', () => {
  const now = new Date('2026-09-19T10:00:00Z');
  let last = 204;
  for (let i = 0; i < SHELF_DAILY_CAP + 3; i += 1) {
    last = saveShelfFrame(body(), { env: env(), keep: () => true, photoId: () => true, free: () => 1e12, now }).status;
  }
  assert.equal(last, 429, 'the server has no floor under the phone\'s own throttle');
});

/* ------------------------------------------------------------- the wiring */

test('the route exists, is POST-only, and calls storage and no model', () => {
  const server = src('../server.ts');
  const at = server.indexOf("url.pathname === '/api/shelf/frame'");
  assert.notEqual(at, -1, 'the shelf route is gone');
  const route = server.slice(at, at + 900);
  assert.ok(route.includes("req.method !== 'POST'"), 'the shelf route accepts a GET');
  assert.ok(route.includes('saveShelfFrame(body)'), 'the route does not store through saveShelfFrame');
  assert.ok(!/gemini|identify|anthropic|model|price\(/i.test(route), 'the shelf route reaches a model');
  const inviteAt = server.indexOf('inviteAllows(req.headers[INVITE_HEADER])');
  assert.ok(inviteAt !== -1 && inviteAt < at, 'the shelf route sits ahead of the invite check');
  const store = src('../src/shelf.ts');
  assert.ok(!/gemini|anthropic|identify/i.test(store.replace(/^\s*\*.*$/gm, '')), 'the storage module reaches a model');
  assert.ok(store.includes('keepPhoto'), 'the server does not check the photo consent itself');
});

test('the phone side is consent-gated, idle-only, throttled, and stops with the screen', () => {
  const glue = src('../public/js/eye-shelf.js');
  assert.ok(glue.includes('consentOn()') && glue.includes('isBusy()'), 'the sampler does not check consent and busy');
  assert.ok(glue.includes('shouldSendShelf('), 'the sampler does not use the tested decision');
  assert.ok(glue.includes('whenIdle('), 'the work is not deferred to idle time');
  assert.ok(glue.includes('inFlight'), 'nothing stops two pictures being processed at once');
  assert.ok(!/identifyPhoto|api\.price|identify\(/.test(glue), 'the sampler calls a scan route');
  const screen = src('../public/js/screens/camera.js');
  assert.ok(screen.includes("consentOn: () => store.consent().photos === true"), 'the screen does not pass the photo consent');
  assert.ok(screen.includes("isBusy: () => cam.dataset.state !== 'idle'"), 'the screen does not stand the sampler down during a scan');
  assert.ok(screen.includes('stopShelfCapture();'), 'the sampler outlives the screen');
  const api = src('../public/js/api.js');
  assert.ok(api.includes('/api/shelf/frame'), 'api.js has no shelf upload');
});
