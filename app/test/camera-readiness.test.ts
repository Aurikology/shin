/**
 * Item 13, 2026-09-19: continuous autofocus, and an explicit wait for camera
 * readiness before the frame loop starts.
 *
 * Copy from, build-order item 13: continuous autofocus is requested only when
 * the track's own capabilities advertise it, `applyConstraints({advanced:
 * [{focusMode:"continuous"}]})` wrapped in try/catch as best effort (sugar-
 * no-scanner-demo, scanner-app.tsx:1004); the video element is polled for
 * readiness rather than trusted the instant `play()` resolves (scanner-app.tsx:997).
 *
 * The two pure decisions here (does this device even offer continuous focus,
 * has the video actually produced a frame yet) are tested directly. The real
 * getUserMedia/applyConstraints wiring needs a phone and is pinned as source
 * text instead, the convention `torch-setting.test.ts` uses for the torch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { videoIsReady, supportsContinuousFocus } from '../src/eye/camera.ts';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/** A slice between two literal markers that FAILS LOUDLY rather than running away. */
function between(text: string, from: string, to: string, what: string): string {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  const slice = text.slice(a, b);
  assert.ok(slice.length < text.length / 2, `${what}: the slice swept past its end`);
  return slice;
}

test('a video with real dimensions is ready; a video still at 0x0 is not', () => {
  assert.equal(videoIsReady({ videoWidth: 0, videoHeight: 0 }), false, 'a blank video reported ready');
  assert.equal(videoIsReady({ videoWidth: 0, videoHeight: 480 }), false, 'one dimension still at 0 reported ready');
  assert.equal(videoIsReady({ videoWidth: 640, videoHeight: 0 }), false, 'one dimension still at 0 reported ready');
  assert.equal(videoIsReady({ videoWidth: 640, videoHeight: 480 }), true, 'a real frame reported not ready');
});

test('continuous focus is only recognised when the track actually advertises it', () => {
  assert.equal(supportsContinuousFocus(undefined), false, 'no capabilities at all counted as support');
  assert.equal(supportsContinuousFocus({}), false, 'an empty capabilities object counted as support');
  assert.equal(
    supportsContinuousFocus({ focusMode: ['fixed', 'manual'] }),
    false,
    'a device without continuous in its list counted as support',
  );
  assert.equal(
    supportsContinuousFocus({ focusMode: ['fixed', 'continuous'] }),
    true,
    'a device that lists continuous was not recognised',
  );
});

test('start() asks for continuous focus as best effort, guarded by the capability check', () => {
  const eye = src('../src/eye/camera.ts');
  const focus = between(
    eye,
    'async #requestContinuousFocus(): Promise<void> {',
    'async #waitUntilReady(',
    '#requestContinuousFocus()',
  );
  assert.ok(focus.includes('supportsContinuousFocus'), 'the focus request never checks the capability first');
  assert.ok(focus.includes('try {') && focus.includes('catch'), 'the focus request is not wrapped as best effort');
  assert.ok(focus.includes("focusMode: 'continuous'"), 'continuous is not the mode being requested');
  assert.ok(eye.includes('this.#requestContinuousFocus()'), 'start() never calls the focus request');
});

test('the loop does not start until an explicit readiness wait has run', () => {
  const eye = src('../src/eye/camera.ts');
  const start = between(eye, 'async start(): Promise<void> {', '  stop(): void {', 'start()');
  const readyIdx = start.indexOf('#waitUntilReady');
  const runIdx = start.indexOf('this.#running = true');
  assert.notEqual(readyIdx, -1, 'start() never waits for readiness');
  assert.notEqual(runIdx, -1, 'start() never sets #running');
  assert.ok(readyIdx < runIdx, 'the readiness wait does not run before the loop starts, so "not ready" is still implicit');
  assert.ok(eye.includes('get ready()'), 'there is no way for a caller to read whether the camera is ready');
});
