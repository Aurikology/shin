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
import { readFileSync, existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parsePack, lookupCode } from '../public/js/pack.js';

const PACK_PATH = fileURLToPath(new URL('../../catalogue/data/pack-grocery.bin.br', import.meta.url));

const KNOWN_CODE = 270013810754n;
const KNOWN_NAME = 'Extra Lean Ground Beef';
const KNOWN_BRAND = 'Farm Boy';
const MADE_UP_CODE = 9999999999999n;

/*
 * The pack is a build artifact, not a fixture, and catalogue/data/ is
 * gitignored -- 9.1 GB, every byte re-fetchable by the scripts in
 * catalogue/src. So on a fresh clone, and in any git worktree that has not
 * built it, this file is simply not there.
 *
 * These five tests used to fail in that case, which meant `npm test` was red
 * out of the box and stayed red, and five permanent failures are worse than
 * none: they train everyone to read a red suite as normal, and the next real
 * failure hides among them. A test that cannot pass on a clean checkout is a
 * broken gate rather than a strict one.
 *
 * Skipped, not replaced with a fixture: the comment at the top of this file
 * is right that a fixture would only prove this module agrees with itself.
 * Where the pack exists these tests are unchanged and still run.
 */
const HAVE_PACK = existsSync(PACK_PATH);
const NEEDS_PACK = HAVE_PACK
  ? false
  : 'catalogue/data/pack-grocery.bin.br is not built here; run the catalogue export to cover this';

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

test('a known barcode resolves to the product the pack itself names', { skip: NEEDS_PACK }, async () => {
  const buffer = loadRealPackBuffer();

  const prepareStart = performance.now();
  const parsed = parsePack(buffer);
  const prepareMs = performance.now() - prepareStart;

  /*
   * THIS USED TO BE A HARD-CODED 122,101, AND THAT NUMBER EARNED ITS KEEP BEFORE
   * IT BECAME A LIABILITY.
   *
   * On 2026-09-26 it was the only thing in the repository that noticed a real
   * defect: an export came back with 116,998 rows, and the cause turned out to be
   * a loader overwriting 5,115 food rows' `source` with a deposit registry's,
   * which moved them out of the grocery scope while leaving them in the
   * catalogue. No count from the loader, no answer, and no other test saw it.
   *
   * But a constant cannot tell "the pack shrank because something broke" from
   * "the pack changed because the catalogue changed", and it goes red on every
   * legitimate load. So it is now the real invariant: the pack's own header count
   * equals the number of rows in the scope it claims to hold, read out of the
   * catalogue. Where the catalogue is not built, a floor stands in, because a
   * pack an order of magnitude short is still obviously wrong.
   */
  const CATALOGUE = fileURLToPath(new URL('../../catalogue/data/catalogue.db', import.meta.url));
  if (existsSync(CATALOGUE)) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(CATALOGUE, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 120000');
    const inScope = Object.values(
      db.prepare("SELECT count(*) FROM product WHERE sold_in_canada = 1 AND source = 'openfoodfacts'").get() ?? {},
    )[0];
    db.close();
    // The exporter refuses codes longer than 14 digits, which no scanner can
    // produce, so the pack is allowed to be a little short of the scope. It is
    // never allowed to be longer, and never allowed to be short by much.
    assert.ok(
      parsed.count <= inScope && inScope - parsed.count < 500,
      `the pack holds ${parsed.count} rows and the grocery scope holds ${inScope}`,
    );
  } else {
    assert.ok(parsed.count > 100_000, `the pack holds only ${parsed.count} rows`);
  }

  const lookupStart = performance.now();
  const hit = lookupCode(parsed, KNOWN_CODE);
  const lookupMs = performance.now() - lookupStart;

  console.log(`load + prepare (${parsed.count.toLocaleString()} rows, ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB decompressed): ${prepareMs.toFixed(3)} ms`);
  console.log(`single lookup: ${lookupMs.toFixed(4)} ms`);

  assert.ok(hit, 'known barcode should resolve');
  assert.equal(hit.code, KNOWN_CODE.toString());
  assert.equal(hit.name, KNOWN_NAME);
  assert.equal(hit.brands, KNOWN_BRAND);
});

test('a made-up barcode returns null, not a neighbour', { skip: NEEDS_PACK }, () => {
  const buffer = loadRealPackBuffer();
  const parsed = parsePack(buffer);
  assert.equal(lookupCode(parsed, MADE_UP_CODE), null);
});

test('a truncated pack is rejected before it can be searched', { skip: NEEDS_PACK }, () => {
  const buffer = loadRealPackBuffer();
  // Cut it off partway through the offset table: past the header and codes,
  // but before the layout it declares can possibly be satisfied.
  const truncated = buffer.slice(0, 2000);
  assert.throws(() => parsePack(truncated), /truncated/);
});

test('a corrupted magic is rejected rather than silently mis-parsed', { skip: NEEDS_PACK }, () => {
  const buffer = loadRealPackBuffer();
  const corrupted = buffer.slice(0);
  new Uint8Array(corrupted, 0, 8).set(Buffer.from('NOTAPACK', 'latin1'));
  assert.throws(() => parsePack(corrupted), /bad magic/);
});

test('a blob whose declared length does not match the file is rejected', { skip: NEEDS_PACK }, () => {
  const buffer = loadRealPackBuffer();
  // Chop bytes off the very end, after the offset table, so the header and
  // offsets all look fine and only the blob is short of what they promise.
  const shortBlob = buffer.slice(0, buffer.byteLength - 1000);
  assert.throws(() => parsePack(shortBlob), /mismatch/);
});
