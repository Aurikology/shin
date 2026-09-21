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

/**
 * The cancellation, run for real rather than pinned as source text.
 *
 * `Camera` needs a video element, `createImageBitmap` and `OffscreenCanvas`,
 * none of which node has; the three are faked below, which is enough to run
 * `#doCapture()` end to end because everything it touches on them is the
 * width, the height and the pixels. What it is NOT is a phone: the real
 * `getUserMedia`, the real burst timing and the real zxing decode are still
 * only checkable on a device.
 *
 * What this pins is the contract the camera screen is written against
 * (`app/public/js/screens/camera.js`, the shutter handler: "The eye always
 * yields a crop ... or reports trouble, so nothing here has to stand in for
 * it"). A press that ends in neither leaves the screen thinking forever.
 */
import { Camera } from '../src/eye/camera.ts';

/** A frame of one flat grey level, standing in for a whole scene. */
function fakeBitmap(level: number) {
  return { width: 64, height: 48, level, closed: false, close(this: { closed: boolean }) { this.closed = true; } };
}

function installFakeCanvas(levels: number[], failEncode = false) {
  const originals = {
    createImageBitmap: (globalThis as Record<string, unknown>).createImageBitmap,
    OffscreenCanvas: (globalThis as Record<string, unknown>).OffscreenCanvas,
    ImageData: (globalThis as Record<string, unknown>).ImageData,
  };
  const made: ReturnType<typeof fakeBitmap>[] = [];
  let n = 0;
  (globalThis as Record<string, unknown>).createImageBitmap = async () => {
    const b = fakeBitmap(levels[Math.min(n, levels.length - 1)]);
    n += 1;
    made.push(b);
    return b;
  };
  class FakeContext {
    imageSmoothingQuality = 'low';
    level = 0;
    drawImage(source: { level?: number }) { this.level = source?.level ?? 0; }
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4).fill(this.level), width: w, height: h };
    }
    async convertToBlob() {
      if (failEncode) throw new Error('the encoder gave up');
      return new Blob([new Uint8Array([1])], { type: 'image/png' });
    }
  }
  class FakeOffscreenCanvas {
    #ctx = new FakeContext();
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() { return this.#ctx; }
    convertToBlob() { return this.#ctx.convertToBlob(); }
  }
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
  if (!(globalThis as Record<string, unknown>).ImageData) {
    (globalThis as Record<string, unknown>).ImageData = class {};
  }
  return {
    made,
    restore() {
      for (const [k, v] of Object.entries(originals)) {
        if (v === undefined) delete (globalThis as Record<string, unknown>)[k];
        else (globalThis as Record<string, unknown>)[k] = v;
      }
    },
  };
}

/** A camera wired to fake frames, with every event it fired recorded. */
async function pressTheShutter(levels: number[], failEncode = false) {
  const fake = installFakeCanvas(levels, failEncode);
  const fired: string[] = [];
  const camera = new Camera({
    video: { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement,
    events: {
      onBoxes: () => {},
      onCapture: () => { fired.push('capture'); },
      onBarcode: () => {},
      onTrouble: () => { fired.push('trouble'); },
    },
  });
  try {
    await camera.capture();
  } finally {
    fake.restore();
  }
  return { fired, cancelled: camera.capturesCancelled, made: fake.made };
}

test('a steady scene still reaches onCapture through the fake frames', async () => {
  const { fired, cancelled } = await pressTheShutter([20, 20, 20, 20, 20, 20, 20]);
  assert.equal(cancelled, 0, 'a scene that never moved was read as a scene change');
  assert.deepEqual(fired, ['capture'], 'a steady burst did not deliver its crop');
});

test('a capture cancelled for a scene change still tells the screen something happened', async () => {
  const { fired, cancelled, made } = await pressTheShutter([20, 20, 220, 220, 220, 220, 220]);
  assert.equal(cancelled, 1, 'the burst that moved on was not cancelled at all');
  assert.ok(made.every((b) => b.closed), 'a cancelled burst left bitmaps open');
  assert.ok(
    fired.length > 0,
    'the shutter press ended in silence: no crop and no trouble, so the screen waits for an answer that never comes',
  );
  assert.equal(fired.includes('capture'), false, 'a cancelled capture was delivered as a crop anyway');
});

/**
 * Not item 21, the same burst's other exit. `releaseAllBut` and the close
 * after `cropTo` only run on the path where the crop succeeds; a crop that
 * throws goes straight to the catch, which reports trouble and returns with
 * the burst's frames still held. An `ImageBitmap` is real phone memory
 * (`releaseAllBut`'s own comment says so), so a shot that keeps failing in a
 * dim aisle leaks one full burst each time.
 */
test('a burst whose crop fails releases its frames instead of leaking them', async () => {
  const { fired, made } = await pressTheShutter([20, 20, 20, 20, 20, 20, 20], true);
  assert.deepEqual(fired, ['trouble'], 'a failed crop did not report trouble');
  assert.ok(made.length > 0, 'the fake burst produced no frames at all, so this proves nothing');
  assert.ok(made.every((b) => b.closed), `a failed crop left ${made.filter((b) => !b.closed).length} bitmaps open`);
});
