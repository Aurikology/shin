/**
 * Item 21, 2026-09-19: detect a scene change mid-burst and cancel a capture
 * that has not gone out yet. Ruling, followed exactly: a scene change never
 * hides an answer already paid for, it only cancels something not yet sent.
 * That is why this lives entirely inside `#doCapture()`'s burst, before
 * `onCapture` ever fires -- once `onCapture` has fired the shot has gone out
 * and this feature does not touch it (camera.md A21's own rule-check flags
 * exactly that distinction as needing his word; this build only does the
 * pre-send half, which needs no one's word).
 *
 * Copy from, build-order item 21, sugar-no-scanner-demo:
 *   - two-strike debounce: one mismatched frame is tolerated, the counter
 *     must reach 2 before a scene change is declared (scanner-app.tsx:869).
 *
 * `sceneChanged` is the pure decision: given a sequence of frame signatures
 * (the first is the anchor a burst started with), has the scene moved on for
 * two frames running. It reuses `shelf.ts`'s own `signatureOf`/
 * `signatureDistance` and its `SHELF_MIN_CHANGE` bar for "different enough to
 * count as a new view", rather than inventing a second threshold for the
 * same question. The bitmap-to-signature plumbing inside `#doCapture()`
 * needs a real `OffscreenCanvas` and is pinned as source text instead, the
 * convention the rest of `camera.ts` uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sceneChanged } from '../src/eye/camera.ts';
import { SHELF_MIN_CHANGE } from '../src/eye/shelf.ts';

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

const same = new Array(48).fill(0.3);
const moved = new Array(48).fill(0.3 + SHELF_MIN_CHANGE + 0.05);

test('a burst that never leaves the same scene never reports a change', () => {
  assert.equal(sceneChanged([same, same, same, same]), false);
});

test('one mismatched frame alone is tolerated, not declared a scene change', () => {
  assert.equal(sceneChanged([same, moved, same, same]), false, 'a single bad match on its own cancelled the capture');
});

test('two consecutive mismatches declare a scene change', () => {
  assert.equal(sceneChanged([same, moved, moved, same]), true, 'two frames running past the threshold were not enough');
});

test('a strike streak that breaks does not carry over: 1, reset, 1 is not 2', () => {
  assert.equal(sceneChanged([same, moved, same, moved]), false, 'a broken streak was counted as consecutive');
});

test('fewer than two frames cannot show a change at all', () => {
  assert.equal(sceneChanged([same]), false);
  assert.equal(sceneChanged([]), false);
});

test('#doCapture() checks for a scene change before onCapture, and cancels silently', () => {
  const eye = src('../src/eye/camera.ts');
  const doCapture = between(eye, 'async #doCapture(): Promise<void> {', '\n  }\n}', '#doCapture()');
  const sceneIdx = doCapture.indexOf('sceneChanged');
  const onCaptureIdx = doCapture.indexOf('this.#events.onCapture(');
  assert.notEqual(sceneIdx, -1, '#doCapture() never checks for a scene change');
  assert.notEqual(onCaptureIdx, -1, '#doCapture() never fires onCapture at all');
  assert.ok(sceneIdx < onCaptureIdx, 'the scene-change check runs after onCapture, so it could hide an answer already sent');
  assert.ok(doCapture.includes('bitmap.close()'), 'a cancelled burst never releases its frames');
});
