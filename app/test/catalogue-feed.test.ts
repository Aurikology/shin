/**
 * ITEM 15, wired: every Gemini answer feeds the user catalogue.
 *
 * Nothing reaches Google (the transport is a recorded double, Jamin's rule 8).
 * Each test has its negative beside it, and the first one is the one that must go
 * red if the call from the scan path to `recordUserScan` is removed: it reads the
 * user catalogue back after a real scan over a real socket.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport, httpBody } from './gemini-double.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-feed-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_USER_CATALOGUE = join(dir, 'user-catalogue.db');
process.env.PORT = '0';
process.env.GEMINI_API_KEY = 'test-key-never-sent-anywhere';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_MODEL;
delete process.env.SHIN_MODEL_PROVIDER;

const { server, setGeminiTransportForTests, setSpendGuardForTests, setCatalogueForTests, setUserCatalogueForTests, settleBackgroundChecks } =
  await import('../server.ts');
const { openScanStore } = await import('../src/scans.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');
const { createUserCatalogue } = await import('../../catalogue/src/user-catalogue.ts');

let port = 0;
const base = () => `http://127.0.0.1:${port}`;
let uc = createUserCatalogue(':memory:');

const identify = (q: string) =>
  fetch(`${base()}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const rows = <T>(sql: string): T[] => uc.db!.prepare(sql).all() as unknown as T[];

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  setSpendGuardForTests(null);
  setGeminiTransportForTests(fakeTransport().transport);
  uc = createUserCatalogue(':memory:');
  setUserCatalogueForTests(uc);
  // Item 1's repeat-scan cache is keyed on the barcode alone, and this file
  // reuses fixture barcodes across tests; without clearing, a test after the
  // first to scan one would be served the cached answer instead of making
  // its own call, which is item 1's real behaviour but not what these tests
  // (written before the cache existed) are checking.
  clearRepeatCacheForTests();
});
after(async () => {
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  setUserCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

test('a Gemini answer reaches the user catalogue as a user-sourced, untrusted entry, with the user\'s market', async () => {
  const { status, body } = await identify('gtin=0068100084245&deviceId=feed-1&country=CA&currency=CAD');
  assert.equal(status, 200);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original');
  await settleBackgroundChecks();
  const products = rows<{ name: string; brand: string; gtin: string; source: string; trusted: number; orig_value: number; orig_unit: string }>(
    'SELECT * FROM user_product',
  );
  assert.equal(products.length, 1, 'the scan did not reach recordUserScan');
  assert.equal(products[0].name, 'Kraft Dinner Original');
  assert.equal(products[0].brand, 'Kraft');
  assert.equal(products[0].gtin, '68100084245', 'the barcode is stored digits-only, leading zeros dropped');
  assert.equal(products[0].source, 'user_scan');
  assert.equal(products[0].trusted, 0);
  assert.equal(products[0].orig_value, 225);
  assert.equal(products[0].orig_unit, 'g');
  const obs = rows<{ country: string; currency: string }>('SELECT country, currency FROM user_observation');
  assert.deepEqual([obs[0].country, obs[0].currency], ['CA', 'CAD']);
});

test('no location sent means no country and no currency are stored, never Canada', async () => {
  await identify('gtin=0068100084245&deviceId=feed-2');
  await settleBackgroundChecks();
  const obs = rows<{ country: string | null; currency: string | null }>('SELECT country, currency FROM user_observation');
  assert.equal(obs.length, 1);
  assert.equal(obs[0].country, null);
  assert.equal(obs[0].currency, null);
});

test('the same product scanned twice is one entry, not two', async () => {
  await identify('gtin=0068100084245&deviceId=feed-3');
  // Item 1's repeat-scan cache is keyed on the barcode alone, and a cache hit
  // returns before the catalogue-feed step runs at all (a cached answer
  // writes no new observation). This test is proving catalogue dedup across
  // two INDEPENDENT Gemini answers for the same product, not the cache, so
  // the second scan is cleared to a fresh miss rather than served from cache.
  clearRepeatCacheForTests();
  await identify('gtin=0068100084245&deviceId=feed-3');
  await settleBackgroundChecks();
  assert.equal(rows('SELECT id FROM user_product').length, 1);
  assert.equal(rows('SELECT id FROM user_observation').length, 2);
});

test('an answer that names no product adds nothing, and the scan still answers', async () => {
  setGeminiTransportForTests(fakeTransport(() => ({ text: httpBody('this is not json at all') })).transport);
  const { status } = await identify('gtin=0068100084245&deviceId=feed-4');
  assert.equal(status, 200);
  await settleBackgroundChecks();
  assert.equal(rows('SELECT id FROM user_product').length, 0);
});

test('a catalogue that cannot be written never slows or fails the answer', async () => {
  setUserCatalogueForTests(createUserCatalogue(join(dir, 'no', 'such', 'dir', '\0bad.db')));
  const { status, body } = await identify('gtin=0068100084245&deviceId=feed-5');
  assert.equal(status, 200);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original');
  await settleBackgroundChecks();
});

test('feeding the catalogue does not consult it to answer: the answer is still Gemini\'s', async () => {
  let asked = 0;
  setCatalogueForTests({
    byGtin: () => {
      asked += 1;
      return { code: '0068100084245', name: 'CATALOGUE NAME', brands: 'X', quantity: '1', sizeValue: 1, sizeUnit: 'g', soldInCanada: true };
    },
  });
  const { body } = await identify('gtin=0068100084245&deviceId=feed-6');
  await settleBackgroundChecks();
  assert.equal(asked, 0);
  assert.equal(body.product, null);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original');
});
