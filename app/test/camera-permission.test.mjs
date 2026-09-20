/**
 * Item 9 (scanner-build-order-2026-09-19.md): distinguish camera permission
 * refusal from a generic camera error on the live camera screen.
 *
 * Before this, `startCamera()` (camera.js, module-private, not inside the
 * render closure) swallowed every `getUserMedia` rejection into one falsy
 * `stream`, so a denied permission and a machine with no camera at all were
 * the same event (failure.md D9.1). `startCamera` now answers with
 * `{ stream, reason }`, `reason` one of `'granted' | 'denied' | 'unavailable'`,
 * read off `err.name` the same way onboarding.js's `askCamera` already
 * classifies a denial.
 *
 * `startCamera` is async and touches `navigator`/`video`, so per this app's
 * zero-DOM-dependency decision (photo-screen.test.mjs's header) its source is
 * cut out and RUN here against stubs, the same way camera-icons.test.mjs runs
 * the click dispatch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CAMERA = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8')
  .replace(/\r\n/g, '\n');

const START = 'async function startCamera(video) {';
const END = 'function stopCamera(stream) {';

function between(text, from, to) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `the closing marker ${JSON.stringify(to)} is gone`);
  return text.slice(a, b);
}

const SRC = between(CAMERA, START, END);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Runs the real `startCamera` body against a stub `navigator`/`video`. */
function run(navigator, video = { play: () => Promise.resolve() }) {
  const fn = new AsyncFunction('video', 'navigator', SRC.slice(START.length, SRC.lastIndexOf('}')));
  return fn(video, navigator);
}

test('no getUserMedia at all is unavailable, not denied', async () => {
  const out = await run({ mediaDevices: undefined });
  assert.deepEqual(out, { stream: false, reason: 'unavailable' });
});

test('a NotAllowedError is denied, distinctly from any other camera error', async () => {
  const err = Object.assign(new Error('no'), { name: 'NotAllowedError' });
  const out = await run({ mediaDevices: { getUserMedia: () => Promise.reject(err) } });
  assert.deepEqual(out, { stream: false, reason: 'denied' });
});

test('a camera error that is not a permission refusal is unavailable, never denied', async () => {
  const err = Object.assign(new Error('no camera'), { name: 'NotFoundError' });
  const out = await run({ mediaDevices: { getUserMedia: () => Promise.reject(err) } });
  assert.deepEqual(out, { stream: false, reason: 'unavailable' });
});

test('a granted stream answers reason: granted, carrying the real stream', async () => {
  const fakeStream = { getTracks: () => [] };
  const video = { play: () => Promise.resolve() };
  const out = await run({ mediaDevices: { getUserMedia: () => Promise.resolve(fakeStream) } }, video);
  assert.deepEqual(out, { stream: fakeStream, reason: 'granted' });
  assert.equal(video.srcObject, fakeStream, 'the stream was never attached to the video element');
});

/* --------------------------------------------------- the docked denial line */

test('a denied permission sets cameraDenied, which showInitialIdleContent reads once and clears', () => {
  const resolveBlock = CAMERA.slice(CAMERA.indexOf('startCamera(video).then(({ stream: s, reason }) => {'),
    CAMERA.indexOf('startCaptureQueue(sendQueuedCapture)'));
  assert.match(resolveBlock, /cameraDenied = !s && reason === 'denied';/, 'a denied permission no longer sets the one-time flag');

  const idleFn = CAMERA.slice(CAMERA.indexOf('function showInitialIdleContent()'), CAMERA.indexOf('function showAimHint()'));
  assert.match(idleFn, /if \(cameraDenied\) \{/, 'showInitialIdleContent no longer checks the denial flag');
  const ifBlock = idleFn.slice(idleFn.indexOf('if (cameraDenied) {'));
  assert.match(ifBlock, /cameraDenied = false;/, 'the denial line is not one-time: the flag is never cleared');
  assert.match(ifBlock, /dockSay\('idle', 'cam_camera_denied', \{\}, 'idle-breath'\);/, 'the denial does not say the dedicated cam_camera_denied line');
});
