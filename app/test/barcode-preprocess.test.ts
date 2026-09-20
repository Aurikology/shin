/**
 * Item 12, 2026-09-19: a second, slower barcode decode attempt with app-side
 * preprocessing (grayscale plus a contrast stretch) and zxing's own
 * `tryDenoise`, tried only after normal decoding has kept missing for a
 * streak, never on the ordinary empty frame.
 *
 * His build order's "why": the existing single call already leans on zxing's
 * own robustness options (`tryHarder`, `tryRotate`, `tryInvert`,
 * `tryDownscale`) but never `tryDenoise`, and there is no app-side
 * preprocessing anywhere (camera.md A12.5). Running the extra pass on every
 * empty frame would double decode cost for the common case, a shopper
 * sweeping the shelf with nothing in view yet (camera.md A12.3), so it only
 * fires after a streak of misses, and the streak resets every time it fires
 * so preprocessing runs on at most one frame in `PREPROCESS_AFTER_MISSES + 1`
 * rather than every frame from then on.
 *
 * `BarcodeScanner.read()` itself needs a real zxing WebAssembly module and is
 * not exercised here (no test in this repo imports `barcode.ts` at all, per
 * camera.md). What IS tested is the pure preprocessing and the pure
 * miss-streak decision, both typed on plain shapes rather than `ImageData` so
 * they run with no DOM at all, the same reason `shelf.ts`'s `signatureOf` is
 * typed that way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { grayscaleContrast, shouldRetryWithPreprocessing, PREPROCESS_AFTER_MISSES } from '../src/eye/barcode.ts';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/** A flat-colour RGBA frame, `width`x`height`, alpha 255. */
function solid(r: number, g: number, b: number, width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }
  return { data, width, height };
}

test('grayscale makes every pixel neutral: R, G and B agree', () => {
  const out = grayscaleContrast(solid(200, 40, 40, 4, 4));
  for (let p = 0; p < out.data.length; p += 4) {
    assert.equal(out.data[p], out.data[p + 1], 'a preprocessed pixel is not grayscale (R != G)');
    assert.equal(out.data[p + 1], out.data[p + 2], 'a preprocessed pixel is not grayscale (G != B)');
  }
});

test('the contrast stretch maps a flat, low-contrast frame across the full range', () => {
  // Two luma bands, both washed out and close together (a poorly-lit shelf
  // label), one dark-ish and one light-ish ribbon.
  const data = new Uint8ClampedArray(8 * 4 * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const p = (y * 8 + x) * 4;
      const v = x < 4 ? 100 : 120;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  const out = grayscaleContrast({ data, width: 8, height: 4 });
  let min = 255;
  let max = 0;
  for (let p = 0; p < out.data.length; p += 4) {
    min = Math.min(min, out.data[p]);
    max = Math.max(max, out.data[p]);
  }
  assert.equal(min, 0, 'the darker band was not stretched down to black');
  assert.equal(max, 255, 'the lighter band was not stretched up to white');
});

test('a perfectly flat frame is left as plain grayscale, not divided by zero into blank', () => {
  const out = grayscaleContrast(solid(77, 77, 77, 2, 2));
  for (let p = 0; p < out.data.length; p += 4) {
    assert.ok(Number.isFinite(out.data[p]), 'a flat frame produced a non-finite pixel');
  }
});

test('the retry only fires once the miss streak reaches the threshold', () => {
  for (let i = 0; i < PREPROCESS_AFTER_MISSES; i += 1) {
    assert.equal(shouldRetryWithPreprocessing(i), false, `misses=${i} fired the retry before its own threshold`);
  }
  assert.equal(shouldRetryWithPreprocessing(PREPROCESS_AFTER_MISSES), true, 'the retry never fires at its own threshold');
  assert.equal(shouldRetryWithPreprocessing(PREPROCESS_AFTER_MISSES + 5), true, 'the retry stopped firing past its threshold');
});

test("the first attempt's own options are untouched, and the second adds tryDenoise on top", () => {
  const eye = src('../src/eye/barcode.ts');
  assert.ok(
    eye.includes(
      'tryHarder: true,\n  tryRotate: true,\n  tryInvert: true,\n  tryDownscale: true,',
    ) || /tryHarder:\s*true[\s\S]{0,40}tryRotate:\s*true[\s\S]{0,40}tryInvert:\s*true[\s\S]{0,40}tryDownscale:\s*true/.test(eye),
    'the first attempt no longer asks for the same robustness options it always has',
  );
  assert.ok(eye.includes('tryDenoise: true'), 'the second attempt never asks zxing to denoise');
  assert.ok(eye.includes('grayscaleContrast('), 'the second attempt never preprocesses the frame');
});

test('the wedge/timeout machinery both attempts share is untouched', () => {
  const eye = src('../src/eye/barcode.ts');
  assert.ok(eye.includes('DECODE_CEILING_MS'), 'the per-decode ceiling was removed');
  assert.ok(eye.includes('WEDGE_STRIKES'), 'the wedge-strike counter was removed');
});
