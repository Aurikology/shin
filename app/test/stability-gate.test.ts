/**
 * Item 5, 2026-09-19: reject blurry or moving frames, with a forced-capture
 * escape hatch, so a scan can never hang forever.
 *
 * Copy from, build-order item 5, all sugar-no-scanner-demo:
 *   - motion gate: current and previous RGBA buffers compared at a stride of
 *     16 bytes, mean absolute difference >= 13 rejects the frame
 *     (scanner-app.tsx:914).
 *   - forced capture: after waiting 1250ms for a stable frame, the shot fires
 *     anyway, bypassing both the blur and motion gates (scanner-app.tsx:899).
 *   - their own blur floor is 4.1, but that is `luminanceEdgeScore`, a mean
 *     neighbour-luminance-difference score, a different formula on a
 *     different scale than `sharpnessOf()`'s variance of the Laplacian, so it
 *     does not transfer unit for unit; `MIN_ABSOLUTE_SHARPNESS` is picked on
 *     our own scale instead (see its comment in capture.ts).
 *
 * `StabilityGate` is pure (every method takes what it needs, no DOM) except
 * for its own `Date.now()` calls, so timing tests use `node:test`'s mock
 * timers to advance a fake `Date` in exact steps rather than real sleeps:
 * the gate's own window/eviction arithmetic needs the boundary hit close to
 * exactly, which a real timer's jitter cannot promise on this machine.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  StabilityGate,
  motionScore,
  forcedCaptureDue,
  MIN_ABSOLUTE_SHARPNESS,
  MOTION_THRESHOLD,
  FORCED_CAPTURE_MS,
} from '../src/eye/capture.ts';

const box = (x = 100, y = 100, width = 120, height = 40) => ({ x, y, width, height });
const frame = (fill: number, width = 8, height = 8) => ({
  data: new Uint8ClampedArray(width * height * 4).fill(fill),
  width,
  height,
});

test('mean absolute difference between two identical buffers is zero', () => {
  assert.equal(motionScore(frame(50), frame(50)), 0);
});

test('mean absolute difference reflects how far apart two buffers are', () => {
  assert.equal(motionScore(frame(50), frame(80)), 30);
});

test('a big enough difference clears the motion threshold; a small one does not', () => {
  assert.ok(motionScore(frame(0), frame(0 + MOTION_THRESHOLD)) >= MOTION_THRESHOLD);
  assert.ok(motionScore(frame(0), frame(MOTION_THRESHOLD - 1)) < MOTION_THRESHOLD);
});

test('mismatched frame sizes score as no motion rather than throwing', () => {
  assert.equal(motionScore(frame(0, 4, 4), frame(200, 8, 8)), 0);
});

test('forced capture is not due before its budget, and is due at or after it', () => {
  assert.equal(forcedCaptureDue(1000, 1000 + FORCED_CAPTURE_MS - 1), false);
  assert.equal(forcedCaptureDue(1000, 1000 + FORCED_CAPTURE_MS), true);
  assert.equal(forcedCaptureDue(null, 999999), false, 'a gate that never opened forced a capture');
});

/** Runs `body` with `Date.now()` fully mocked, advancing by `stepMs` before
 * every call `body` makes to it, and always cleans the mock up after. */
function withFakeClock(stepMs: number, body: (tick: () => void) => void): void {
  mock.timers.enable({ apis: ['Date'] });
  try {
    body(() => mock.timers.tick(stepMs));
  } finally {
    mock.timers.reset();
  }
}

test('an entirely blurry window never settles, even though every frame agrees with the others', () => {
  withFakeClock(10, (tick) => {
    const gate = new StabilityGate(30, 0.06);
    const tooBlurry = MIN_ABSOLUTE_SHARPNESS - 1;
    let settled = false;
    for (let i = 0; i < 6; i += 1) {
      if (gate.update(box(), tooBlurry, 1000)) settled = true;
      tick();
    }
    assert.equal(settled, false, 'a window that is uniformly too blurry still passed the relative test alone');
  });
});

test('a sharp, still window settles once it has held for long enough', () => {
  withFakeClock(10, (tick) => {
    const gate = new StabilityGate(30, 0.06);
    const plentySharp = MIN_ABSOLUTE_SHARPNESS + 50;
    let settled = false;
    for (let i = 0; i < 6; i += 1) {
      if (gate.update(box(), plentySharp, 1000)) settled = true;
      tick();
    }
    assert.ok(settled, 'a genuinely sharp, still window never settled: the floor broke the ordinary case');
  });
});

test('a moving frame resets the gate even when the reported box has not drifted', () => {
  withFakeClock(10, (tick) => {
    const gate = new StabilityGate(30, 0.06);
    const plentySharp = MIN_ABSOLUTE_SHARPNESS + 50;
    let settledBeforeMotion = false;
    for (let i = 0; i < 3; i += 1) {
      if (gate.update(box(), plentySharp, 1000, frame(50))) settledBeforeMotion = true;
      tick();
    }
    // A big jump in the raw pixels, same reported box (a detector that has
    // not caught up yet is exactly the case a box-only drift check misses).
    const movedDuringHold = gate.update(box(), plentySharp, 1000, frame(50 + MOTION_THRESHOLD + 20));
    assert.equal(settledBeforeMotion, false, 'the window settled before it had even held long enough to test motion');
    assert.equal(movedDuringHold, false, 'a strided pixel diff over the motion threshold did not reset the gate');
  });
});
