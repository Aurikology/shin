/**
 * D-232: A BARCODE THE CAMERA KEEPS SEEING BUT CANNOT READ.
 *
 * zxing never emits an EAN-13 whose check digit fails: by default it drops the
 * result before the app sees it, so a damaged grocery barcode left the camera
 * aiming with nothing on screen ("A scan never ends with no result"). zxing
 * does expose it: `returnErrors: true` hands back the result with
 * `isValid: false` and a ChecksumError. This file proves that against the real
 * WebAssembly reader (a synthesized EAN-13, no camera, no network), and that
 * the eye's watch turns a sustained run of those into one `onUnreadable` within
 * a few seconds, never on a passing frame and never after a good read.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* ImageData is a browser global; the reader only needs its three fields. */
class FakeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb';
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === 'number') {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? a.length / 4 / b;
    }
  }
}
(globalThis as Record<string, unknown>).ImageData ??= FakeImageData;

const { prepareZXingModule } = await import('zxing-wasm/reader');
const wasm = readFileSync(require.resolve('zxing-wasm/reader').replace(/[\\/]dist[\\/].*$/, '/dist/reader/zxing_reader.wasm'));
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });

const { BarcodeScanner } = await import('../src/eye/barcode.ts');
const unreadable = await import('../src/eye/unreadable.ts').catch(() => null);

/* An EAN-13 drawn module by module, so a wrong check digit can be printed on purpose. */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).reverse().join(''));
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13(code: string, scale = 3, quiet = 12, height = 80): FakeImageData {
  const d = [...code].map(Number);
  let m = '101';
  for (let i = 1; i <= 6; i += 1) m += PARITY[d[0]!]![i - 1] === 'L' ? L[d[i]!] : G[d[i]!];
  m += '01010';
  for (let i = 7; i <= 12; i += 1) m += R[d[i]!];
  m = '0'.repeat(quiet) + m + '101' + '0'.repeat(quiet);
  const width = m.length * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = m[Math.floor(x / scale)] === '1' ? 0 : 255;
      const p = (y * width + x) * 4;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return new FakeImageData(data, width, height);
}

const GOOD = '0068100084245';
const DAMAGED = '0068100084240'; // the same code with its check digit wrong

let scanner: InstanceType<typeof BarcodeScanner>;
before(async () => {
  scanner = new BarcodeScanner();
  await scanner.warm();
});

test('control: the real reader decodes a good EAN-13 and reports nothing unreadable', async () => {
  const seen = await scanner.read(ean13(GOOD) as unknown as ImageData);
  assert.ok(seen, 'the reader did not decode the frame at all (module not loaded?)');
  assert.deepEqual(seen.map((s) => s.value), [GOOD], 'control failed: a clean EAN-13 was not read');
  assert.deepEqual(scanner.lastUnreadable ?? [], [], 'a good read was also reported as unreadable');
});

test('a damaged EAN-13 is never a reading, but the reader says it saw one it could not read', async () => {
  const seen = await scanner.read(ean13(DAMAGED) as unknown as ImageData);
  assert.ok(seen, 'the reader did not decode the frame at all');
  assert.deepEqual(seen, [], 'a barcode whose check digit fails was handed on as a reading');
  const missed = scanner.lastUnreadable;
  assert.ok(Array.isArray(missed), 'the reader exposes nothing about a barcode it saw but could not read');
  assert.equal(missed.length, 1, `the damaged barcode was not reported as seen-but-unreadable: ${JSON.stringify(missed)}`);
  assert.equal(missed[0]!.value, DAMAGED, 'the unreadable digits were not kept, so the developer path has nothing to send');
});

test('the watch speaks once a damaged barcode has stayed in view a few seconds, not on a passing frame', () => {
  assert.ok(unreadable, 'there is no watch for a barcode the camera keeps seeing but cannot read (src/eye/unreadable.ts)');
  const { UnreadableWatch, UNREADABLE_DEFAULTS } = unreadable;
  assert.ok(UNREADABLE_DEFAULTS.afterMs >= 1000 && UNREADABLE_DEFAULTS.afterMs <= 4000, `the hint waits ${UNREADABLE_DEFAULTS.afterMs} ms, not "a few seconds"`);
  const w = new UnreadableWatch();
  const s = { value: DAMAGED, format: 'EAN13', box: null };
  let fired: ReturnType<typeof w.push> = null;
  let at = -1;
  for (let t = 0; t <= 5000; t += 100) {
    const out = w.push(t, 0, [s]);
    if (out && !fired) { fired = out; at = t; }
    else assert.equal(out, null, `the watch spoke a second time at ${t} ms for the same barcode`);
  }
  assert.ok(fired, 'five seconds of a damaged barcode in view and the watch never spoke');
  assert.ok(at >= UNREADABLE_DEFAULTS.afterMs && at <= UNREADABLE_DEFAULTS.afterMs + 200, `the watch spoke at ${at} ms`);
  assert.equal(fired.value, DAMAGED);
  assert.ok(fired.frames >= UNREADABLE_DEFAULTS.minFrames);

  const brief = new UnreadableWatch();
  for (let t = 0; t < 400; t += 100) assert.equal(brief.push(t, 0, [s]), null, 'a passing frame made the watch speak');
  for (let t = 400; t < 5000; t += 100) assert.equal(brief.push(t, 0, []), null, 'the watch spoke about a barcode that left the frame');
});

test('a good read ends the watch: no hint after the code has been read', () => {
  assert.ok(unreadable, 'there is no watch (src/eye/unreadable.ts)');
  const w = new unreadable.UnreadableWatch();
  const s = { value: DAMAGED, format: 'EAN13', box: null };
  for (let t = 0; t < 1500; t += 100) assert.equal(w.push(t, 0, [s]), null);
  assert.equal(w.push(1500, 1, []), null);
  for (let t = 1600; t < 2500; t += 100) assert.equal(w.push(t, 0, [s]), null, 'the run before the good read counted toward the hint');
});

test('the eye is wired: the reader asks zxing for errors, and the camera and eye-attach pass onUnreadable on', () => {
  const barcode = readFileSync(new URL('../src/eye/barcode.ts', import.meta.url), 'utf8');
  const camera = readFileSync(new URL('../src/eye/camera.ts', import.meta.url), 'utf8');
  const attach = readFileSync(new URL('../public/js/eye-attach.js', import.meta.url), 'utf8');
  assert.match(barcode, /returnErrors: true/, 'the reader does not ask zxing for the barcodes it could not read');
  assert.match(camera, /onUnreadable/, 'the camera never tells the screen about an unreadable barcode');
  assert.match(attach, /onUnreadable/, 'eye-attach.js drops the unreadable signal before the screen hears it');
});
