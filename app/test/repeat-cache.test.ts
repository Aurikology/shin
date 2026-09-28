/**
 * Item 1 (docs/scanner-build-order-2026-09-19.md, section 1), ruling 1
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): a persistent, restart-surviving cache of a barcode's
 * last real Gemini answer. Identity is never treated as stale on a timer; the
 * price is served up to six hours old, with a background refresh kicked off
 * once it passes one hour.
 *
 * `src/repeat-cache.ts`'s own pure functions first (no server), then the
 * server-level proof that a repeat scan spends no second Gemini call, that a
 * stale-but-under-ceiling hit triggers exactly one background refresh, and
 * that a spend-cap refusal is never remembered as if it were Gemini's answer.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import {
  openRepeatCache,
  recallCachedScan,
  rememberCachedScan,
  claimRefresh,
  releaseRefresh,
  repeatCacheKey,
  allCachedScans,
  activeRepeatCache,
  PRICE_MAX_AGE_MS,
  REFRESH_AFTER_MS,
} from '../src/repeat-cache.ts';

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), 'shin-repeat-cache-')), 'repeat-cache.db');
}

test('repeatCacheKey includes the barcode, market and currency; a different market is a different key', () => {
  const a = repeatCacheKey('0068100084245', 'CA', 'CAD');
  const b = repeatCacheKey('0068100084245', 'US', 'USD');
  assert.notEqual(a, b);
  assert.equal(a, repeatCacheKey('0068100084245', 'CA', 'CAD'));
});

test('a fresh write is recalled whole, with no refresh due', () => {
  const store = openRepeatCache(tempPath());
  rememberCachedScan('0068100084245', 'CA', 'CAD', { run: 1 }, { block: 1 }, 42);
  const hit = recallCachedScan('0068100084245', 'CA', 'CAD');
  assert.ok(hit);
  assert.deepEqual(hit!.run, { run: 1 });
  assert.deepEqual(hit!.block, { block: 1 });
  assert.equal(hit!.scanId, 42);
  assert.equal(hit!.needsRefresh, false);
  void store;
});

test('a hit past one hour is still served, but marked needing a refresh', () => {
  openRepeatCache(tempPath());
  const anHourAndAMinuteAgo = new Date(Date.now() - (REFRESH_AFTER_MS + 60_000));
  rememberCachedScan('0068100084245', 'CA', 'CAD', { r: 1 }, { b: 1 }, 1, anHourAndAMinuteAgo);
  const hit = recallCachedScan('0068100084245', 'CA', 'CAD');
  assert.ok(hit, 'a hit under six hours old must still be served');
  assert.equal(hit!.needsRefresh, true);
});

test('a hit past six hours is not served at all', () => {
  openRepeatCache(tempPath());
  const sixHoursAndAMinuteAgo = new Date(Date.now() - (PRICE_MAX_AGE_MS + 60_000));
  rememberCachedScan('0068100084245', 'CA', 'CAD', { r: 1 }, { b: 1 }, 1, sixHoursAndAMinuteAgo);
  const hit = recallCachedScan('0068100084245', 'CA', 'CAD');
  assert.equal(hit, null, 'a hit past the six-hour ceiling was still served as fresh');
});

test('claimRefresh lets exactly one caller in; a second claim on the same key is refused until released', () => {
  openRepeatCache(tempPath());
  rememberCachedScan('0068100084245', 'CA', 'CAD', { r: 1 }, { b: 1 }, 1);
  assert.equal(claimRefresh('0068100084245', 'CA', 'CAD'), true, 'the first claim was refused');
  assert.equal(claimRefresh('0068100084245', 'CA', 'CAD'), false, 'a second concurrent claim on the same key was allowed');
  releaseRefresh('0068100084245', 'CA', 'CAD');
  assert.equal(claimRefresh('0068100084245', 'CA', 'CAD'), true, 'a claim stayed refused after being released');
});

/* ------------------------- the server-level proof ------------------------- */

const dir = mkdtempSync(join(tmpdir(), 'shin-repeat-cache-route-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests, setSpendGuardForTests, settleBackgroundChecks } = await import('../server.ts');
const { fakeTransport, goodAnswer, httpBody } = await import('./gemini-double.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
beforeEach(() => {
  setSpendGuardForTests(null);
  clearRepeatCacheForTests();
});
after(async () => {
  setGeminiTransportForTests(null);
  setSpendGuardForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (q: string) =>
  fetch(`http://127.0.0.1:${port}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

test('a repeat scan of the same barcode makes zero further Gemini calls', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const first = await identify('gtin=0068100084245&deviceId=cache-a');
  assert.equal(calls.length, 1);
  const second = await identify('gtin=0068100084245&deviceId=cache-b');
  assert.equal(calls.length, 1, 'a repeat scan of an already-cached barcode spent a second Gemini call');
  assert.equal(second.body.product?.name ?? second.body.unchecked?.name, first.body.product?.name ?? first.body.unchecked?.name);
});

test('a cache hit older than one hour still answers from cache, and triggers exactly one background refresh', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const first = await identify('gtin=0068100084245&deviceId=stale-a');
  assert.equal(calls.length, 1);

  // Re-stamp the row the real call just wrote as past the one-hour mark,
  // keeping the SAME run and block the real call produced (a hand-built
  // fake shape here would break `wireFor`, which expects the real thing):
  // this is what "the same answer, but it has been a while" looks like on
  // disk, and is exactly what a background-refresh test can control
  // deterministically without waiting a real hour.
  const store = activeRepeatCache()!;
  const rows = allCachedScans(store);
  const row = rows.find((r) => r.cache_key.startsWith('0068100084245'));
  assert.ok(row, 'the first scan left no cache row to re-stamp');
  const hit = recallCachedScan('0068100084245', null, null)!;
  assert.ok(hit, 'the first scan left no cache hit to re-stamp');
  const staleAt = new Date(Date.now() - (61 * 60_000));
  rememberCachedScan('0068100084245', null, null, hit.run, hit.block, first.body.scanId, staleAt);

  await identify('gtin=0068100084245&deviceId=stale-b');
  await settleBackgroundChecks();
  assert.equal(calls.length, 2, 'a hit past the one-hour mark never triggered exactly one background refresh');
});

test('a spend-cap refusal is never cached as Gemini\'s answer', async () => {
  const { transport } = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer())) }));
  setGeminiTransportForTests(transport);
  setSpendGuardForTests(() => false);
  const capped = await identify('gtin=0068100084245&deviceId=cap-cache-a');
  assert.equal(capped.body.failure, 'spend_cap_reached');

  setSpendGuardForTests(null);
  const { calls, transport: real } = fakeTransport();
  setGeminiTransportForTests(real);
  const after2 = await identify('gtin=0068100084245&deviceId=cap-cache-b');
  assert.equal(calls.length, 1, 'the spend-cap refusal was served back as a cached answer once the cap lifted');
  assert.notEqual(after2.body.failure, 'spend_cap_reached');
});

test('a cache hit is served with the time it was really checked, not the time it was replayed', async () => {
  /*
   * RULING 1's OWN CONDITION. It permits replaying a stored Gemini answer
   * because "the price is cached for six hours and ALWAYS SHOWN WITH WHEN IT
   * WAS CHECKED". `wireFor` stamped `new Date()` on every response, so the
   * replay claimed it had just been checked. Harmless while nothing rendered
   * the field; a printed untruth from the moment the sheet started saying
   * "Checked just now" (2026-09-21).
   */
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const first = await identify('gtin=0068100084245&deviceId=checked-a');
  assert.equal(calls.length, 1);
  const fresh = first.body.grounded?.fetchedAt;
  assert.ok(typeof fresh === 'string', 'a fresh answer carried no fetchedAt at all');

  // Re-stamp the row three hours back, inside the six hour ceiling so it is
  // still served, and past the one hour mark so the refresh path runs too.
  const hit = recallCachedScan('0068100084245', null, null)!;
  assert.ok(hit, 'the first scan left no cache row to re-stamp');
  const threeHoursAgo = new Date(Date.now() - (3 * 60 * 60_000));
  rememberCachedScan('0068100084245', null, null, hit.run, hit.block, first.body.scanId, threeHoursAgo);

  const replayed = await identify('gtin=0068100084245&deviceId=checked-b');
  await settleBackgroundChecks();
  const served = replayed.body.grounded?.fetchedAt;
  assert.ok(typeof served === 'string', 'a replayed answer carried no fetchedAt');

  const servedMs = Date.parse(served);
  assert.ok(Number.isFinite(servedMs), `a replayed answer carried an unreadable fetchedAt: ${served}`);
  // Within a second of the re-stamped time, and emphatically not "now".
  assert.ok(
    Math.abs(servedMs - threeHoursAgo.getTime()) < 1000,
    `a three hour old cache hit was served as checked at ${served}`,
  );
  assert.ok(
    Date.now() - servedMs > 60_000,
    'a replayed answer claimed it had just been checked, which is what ruling 1 forbids',
  );
});
