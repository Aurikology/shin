/**
 * D-249: the barcode reader's WebAssembly module is compiled once per page,
 * not once per camera visit.
 *
 * zxing-wasm drops its loaded module whenever `prepareZXingModule` is called
 * with overrides whose values are not `===` to the last ones. Every camera
 * visit builds a new `BarcodeScanner`, and its constructor used to pass a
 * fresh `locateFile` arrow, so every visit compiled the 22 MB module again
 * (eleven compiles after ten trips to Saved and back, measured in a browser
 * 2026-10-29). The probe below is zxing's own cache: asking it for the module
 * with the same overrides hands back the same promise only if nothing in
 * between threw it away.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareZXingModule } from 'zxing-wasm/reader';
import { BarcodeScanner, overridesFor } from '../src/eye/barcode.ts';

const URL_ = '/js/vendor/zxing_reader.wasm';

test('the same .wasm address always gets the same overrides object', () => {
  assert.equal(overridesFor(URL_), overridesFor(URL_));
  assert.notEqual(overridesFor(URL_), overridesFor('/elsewhere.wasm'));
});

test('a second camera visit keeps the module the first one loaded', () => {
  new BarcodeScanner({ wasmUrl: URL_ });
  // The module the first visit would load. Never awaited: in Node the address
  // does not resolve, and only the promise's identity is the point.
  const first = prepareZXingModule({ overrides: overridesFor(URL_), fireImmediately: true });
  first.catch(() => {});
  new BarcodeScanner({ wasmUrl: URL_ });
  const second = prepareZXingModule({ overrides: overridesFor(URL_), fireImmediately: true });
  second.catch(() => {});
  assert.equal(second, first, 'a new scanner threw away the loaded module, so every camera visit compiles it again');
});
