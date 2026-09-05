/**
 * Runs against the REAL grocery pack on disk, not a fixture, because the
 * one thing worth proving is that this module's understanding of
 * export-pack.ts's layout still matches what export-pack.ts actually wrote
 * today. A fixture would only prove this module agrees with itself.
 *
 * The known barcode (270013810754, "Extra Lean Ground Beef" / "Farm Boy")
 * and the confirmed-absent one (9999999999999) were both found by reading
 * the pack directly with a throwaway script, not guessed and not carried
 * over from another file -- see the session report for the exact commands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parsePack, lookupCode } from '../public/js/pack.js';

const PACK_PATH = fileURLToPath(new URL('../../catalogue/data/pack-grocery.bin.br', import.meta.url));

const KNOWN_CODE = 270013810754n;
const KNOWN_NAME = 'Extra Lean Ground Beef';
const KNOWN_BRAND = 'Farm Boy';
const MADE_UP_CODE = 9999999999999n;

function loadRealPackBuffer() {
  const compressed = readFileSync(PACK_PATH);
  const decompressed = brotliDecompressSync(compressed);
  // Copy into a plain ArrayBuffer: a Node Buffer is a view over a pooled
  // ArrayBuffer that is usually larger than the Buffer itself, and parsePack
  // treats byte 0 of the ArrayBuffer as byte 0 of the file, the same
  // assumption an ArrayBuffer from fetch().arrayBuffer() gets to make.
  const buffer = new ArrayBuffer(decompressed.byteLength);
  new Uint8Array(buffer).set(decompressed);
  return buffer;
}

test('a known barcode resolves to the product the pack itself names', () => {
  const buffer = loadRealPackBuffer();

  const prepareStart = performance.now();
  const parsed = parsePack(buffer);
  const prepareMs = performance.now() - prepareStart;

  assert.equal(parsed.count, 122101, 'row count should match the grocery scope as exported');

  const lookupStart = performance.now();
  const hit = lookupCode(parsed, KNOWN_CODE);
  const lookupMs = performance.now() - lookupStart;

  console.log(`load + prepare (122,101 rows, ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB decompressed): ${prepareMs.toFixed(3)} ms`);
  console.log(`single lookup: ${lookupMs.toFixed(4)} ms`);

  assert.ok(hit, 'known barcode should resolve');
  assert.equal(hit.code, KNOWN_CODE.toString());
  assert.equal(hit.name, KNOWN_NAME);
  assert.equal(hit.brands, KNOWN_BRAND);
});

test('a made-up barcode returns null, not a neighbour', () => {
  const buffer = loadRealPackBuffer();
  const parsed = parsePack(buffer);
  assert.equal(lookupCode(parsed, MADE_UP_CODE), null);
});

test('a truncated pack is rejected before it can be searched', () => {
  const buffer = loadRealPackBuffer();
  // Cut it off partway through the offset table: past the header and codes,
  // but before the layout it declares can possibly be satisfied.
  const truncated = buffer.slice(0, 2000);
  assert.throws(() => parsePack(truncated), /truncated/);
});

test('a corrupted magic is rejected rather than silently mis-parsed', () => {
  const buffer = loadRealPackBuffer();
  const corrupted = buffer.slice(0);
  new Uint8Array(corrupted, 0, 8).set(Buffer.from('NOTAPACK', 'latin1'));
  assert.throws(() => parsePack(corrupted), /bad magic/);
});

test('a blob whose declared length does not match the file is rejected', () => {
  const buffer = loadRealPackBuffer();
  // Chop bytes off the very end, after the offset table, so the header and
  // offsets all look fine and only the blob is short of what they promise.
  const shortBlob = buffer.slice(0, buffer.byteLength - 1000);
  assert.throws(() => parsePack(shortBlob), /mismatch/);
});
