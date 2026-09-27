/**
 * Item 2 (docs/scanner-build-order-2026-09-19.md, section 2), ruling 2
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): the check-digit function and zero-pad normalization
 * run BEFORE a Gemini call is spent, and exactly one canonical digit string
 * is ever sent.
 *
 * Pure tests of `src/barcode.ts` first (no server, no network), then one
 * server-level proof that an unrepairable reading is refused before a
 * Gemini call is made, and a repairable one reaches Gemini in its padded
 * form rather than as read.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { canonicalGtin, gtinVariants, isValidGtin } from '../src/barcode.ts';

test('a real, correctly-read barcode is its own canonical form', () => {
  assert.equal(canonicalGtin('0068100084245'), '0068100084245');
});

test('a barcode missing its leading zeros is repaired by zero-padding, not refused', () => {
  // 68100084245 is the same barcode as 0068100084245 with a leading zero a
  // scanner sometimes drops. Which padded length wins is not the point (more
  // than one can check out); that it is repaired, and ends in the digits as
  // read, is.
  const repaired = canonicalGtin('68100084245');
  assert.ok(repaired, 'a repairable reading was refused instead of repaired');
  assert.ok(isValidGtin(repaired!));
  assert.match(repaired!, /68100084245$/);
});

test('whitespace and dashes are stripped before the check digit runs', () => {
  assert.equal(canonicalGtin('0068-1000-84245'), '0068100084245');
  assert.equal(canonicalGtin('0068 1000 84245'), '0068100084245');
});

test('a reading that cannot be made to check out in any padding is null, not a guess', () => {
  assert.equal(canonicalGtin('1234567890123'), null);
  assert.equal(canonicalGtin(''), null);
  assert.equal(canonicalGtin('abc'), null);
});

test('gtinVariants tries the as-read digits first, so a caller checking a cache never misses an exact hit', () => {
  const variants = gtinVariants('0068100084245');
  assert.equal(variants[0], '0068100084245');
});

test('isValidGtin rejects a length GS1 never issues', () => {
  assert.equal(isValidGtin('123'), false);
  assert.equal(isValidGtin('0068100084245'), true);
});

/* ------------------------- the server-level proof ------------------------- */

const dir = mkdtempSync(join(tmpdir(), 'shin-barcode-route-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { getScan } = await import('../src/scans.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (q: string) =>
  fetch(`http://127.0.0.1:${port}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

test('a barcode that cannot be made to check out is refused before the paid call, and spends nothing', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const { status, body } = await identify('gtin=1234567890123&deviceId=barcode-refuse');
  assert.equal(status, 200, 'a refusal is still a 200, the same as every other marked answer');
  assert.equal(body.failure, 'invalid_barcode');
  assert.equal(body.lowConfidence, true);
  assert.equal(calls.length, 0, 'an unrepairable reading reached Gemini');
  assert.ok(typeof body.scanId === 'number', 'the refusal left no row to look at later');
  assert.equal(getScan(body.scanId)!.failure_class, 'invalid_barcode');
});

test('a barcode missing its leading zeros still reaches Gemini, in its one repaired form', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const { status } = await identify('gtin=68100084245&deviceId=barcode-repair');
  assert.equal(status, 200);
  assert.equal(calls.length, 1, 'a repairable reading was refused instead of repaired');
  assert.match(String(calls[0].body.model ?? ''), /^gemini-/);
  const sent = JSON.stringify(calls[0].body.input ?? calls[0].body);
  assert.match(sent, /68100084245/, 'the barcode never reached Gemini at all');
  assert.doesNotMatch(sent, /"68100084245"/, 'the unpadded, as-read digits reached Gemini rather than the padded canonical form');
});

test('a printed UPC-E (fails EAN-8) is not refused: it reaches Gemini once, as its 12-digit UPC-A', async () => {
  // 7B.8, RULINGS.md "Always answer". The Coke Zero can from catalogue/test/upce.test.ts.
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const { status, body } = await identify('gtin=06781901&deviceId=barcode-upce');
  assert.equal(status, 200);
  assert.notEqual(body.failure, 'invalid_barcode', 'a real printed UPC-E was refused as invalid');
  assert.equal(calls.length, 1);
  const sent = JSON.stringify(calls[0].body.input ?? calls[0].body);
  assert.match(sent, /067000008191/, 'the expanded UPC-A never reached Gemini');
  assert.doesNotMatch(sent, /06781901/, 'the compressed as-read digits reached Gemini rather than the one canonical form');
});
