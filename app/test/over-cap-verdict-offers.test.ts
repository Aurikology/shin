/**
 * Audit rows 16, 32, 20, 39 and 21 (docs/audit-google-doc-2026-09-19.md), server and data side.
 *
 *   16 and 32  Crossing the daily soft spend cap never refuses a scan: it marks the scan
 *              `over_cap` and logs a loud line. Only the hard runaway ceiling stops a call,
 *              and it still answers HTTP 200, marked, kind and retryable.
 *   20         The good-deal verdict (the zone Gemini returned against the user's lines, and
 *              the lines used) is its own field on the scan row.
 *   39         The offers and reviews Gemini returned are kept with the user catalogue entry,
 *              untrusted, with the scan id.
 *
 * Every test here is written to fail if the behaviour it names is removed. Nothing reaches
 * Google (the transport is a recorded double).
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport, goodAnswer, httpBody } from './gemini-double.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-overcap-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
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
const { getScan, openScanStore } = await import('../src/scans.ts');
const { setErrorSinkForTests } = await import('../src/errlog.ts');
const { schemaVersion } = await import('../src/migrations.ts');
const { createUserCatalogue } = await import('../../catalogue/src/user-catalogue.ts');

let port = 0;
let uc = createUserCatalogue(':memory:');
let calls: ReturnType<typeof fakeTransport>['calls'] = [];
let logged: string[] = [];
const base = () => `http://127.0.0.1:${port}`;

function install(fn?: Parameters<typeof fakeTransport>[0]) {
  const t = fakeTransport(fn);
  calls = t.calls;
  setGeminiTransportForTests(t.transport);
}
const identify = (q: string) =>
  fetch(`${base()}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const rows = <T>(sql: string): T[] => uc.db!.prepare(sql).all() as unknown as T[];
const scanRow = (id: number) => getScan(id) as unknown as Record<string, unknown>;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  setSpendGuardForTests(null);
  install();
  uc = createUserCatalogue(':memory:');
  setUserCatalogueForTests(uc);
  logged = [];
  setErrorSinkForTests((line) => logged.push(line));
});
after(async () => {
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  setUserCatalogueForTests(null);
  setSpendGuardForTests(null);
  setErrorSinkForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

const SOFT = { allowed: true, overCap: true, spentCad: 11, capCad: 10, hardCapCad: 100 };

test('row 16/32: a scan past the SOFT cap is answered in full, marked over_cap on its row, and logged loudly', async () => {
  setSpendGuardForTests(() => SOFT);
  const { status, body } = await identify('gtin=0068100084245&deviceId=cap-soft');
  assert.equal(status, 200);
  assert.equal(calls.length, 1, 'the soft cap refused a scan');
  assert.equal(body.failure, null);
  assert.equal(body.overCap, true);
  assert.equal(body.retryable, false);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original', 'the answer is the real one');
  assert.equal(scanRow(body.scanId).over_cap, 1);
  const line = logged.map((l) => JSON.parse(l) as { where: string; scanId: number; message: string }).find((l) => l.where === 'spend.over_cap');
  assert.ok(line, 'no loud line was logged for a scan past the cap');
  assert.equal(line.scanId, body.scanId);
  assert.match(line.message, /SOFT CAP EXCEEDED/);
  await settleBackgroundChecks();
});

test('row 16/32: a scan under the cap carries no mark and logs nothing', async () => {
  const { body } = await identify('gtin=0068100084245&deviceId=cap-under');
  assert.equal(body.overCap, false);
  assert.equal(scanRow(body.scanId).over_cap, 0);
  assert.equal(logged.filter((l) => l.includes('spend.over_cap')).length, 0);
  await settleBackgroundChecks();
});

test('row 16/32: the HARD ceiling is a marked, kind, retryable 200, never an error status, and sends nothing', async () => {
  setSpendGuardForTests(() => false);
  const { status, body } = await identify('gtin=0068100084245&deviceId=cap-hard');
  assert.equal(status, 200);
  assert.equal(body.failure, 'spend_cap_reached');
  assert.equal(body.retryable, true);
  assert.equal(body.overCap, true);
  assert.match(body.categoryWhy, /try again/i);
  assert.equal(calls.length, 0);
  assert.equal(scanRow(body.scanId).over_cap, 1);
  assert.ok(logged.some((l) => l.includes('HARD CEILING')), 'the hard ceiling was not logged loudly');
  await settleBackgroundChecks();
});

const ZONED = (zone: string | null) =>
  goodAnswer({
    price_verdict: {
      ...(goodAnswer().price_verdict as object),
      thresholds_used: { under_pct: 15, over_pct: 25 },
      shelf: zone === null ? null : { unit_price: 1.2, pct_vs_median: -60, position: 12, zone, label: 'Under your line' },
    },
  });

test('row 20: the good-deal zone Gemini returned and the lines used are their own fields on the scan row', async () => {
  install(() => ({ text: httpBody(JSON.stringify(ZONED('under_your_line'))) }));
  const { body } = await identify(
    `gtin=0068100084245&deviceId=verdict-1&shelfPriceCents=120&thresholds=${encodeURIComponent(JSON.stringify({ underPct: 15, overPct: 25 }))}`,
  );
  const row = scanRow(body.scanId);
  assert.equal(row.verdict_zone, 'under_your_line');
  // Only the fields this row pins; the thresholds object may carry more (a great line, a unit).
  assert.deepEqual(
    (({ underPct, overPct, source }) => ({ underPct, overPct, source }))(JSON.parse(String(row.verdict_thresholds_json))),
    { underPct: 15, overPct: 25, source: 'user' },
  );
  await settleBackgroundChecks();
});

test('row 20: no shelf price means no verdict zone, and the lines used are still recorded', async () => {
  const { body } = await identify('gtin=0068100084245&deviceId=verdict-2');
  const row = scanRow(body.scanId);
  assert.equal(row.verdict_zone, null, 'a zone was invented for a scan with no shelf price');
  assert.equal(JSON.parse(String(row.verdict_thresholds_json)).source, 'default');
  await settleBackgroundChecks();
});

test('row 20: migration 13 exists, is applied, and is append-only after 12', () => {
  assert.ok(schemaVersion(openScanStore(process.env.SHIN_SCANS).db!) >= 13);
});

test('row 39: the offers and reviews Gemini returned are kept with the entry, untrusted, with the scan id', async () => {
  const { body } = await identify('gtin=0068100084245&deviceId=offers-1&country=CA&currency=CAD');
  await settleBackgroundChecks();
  const offers = rows<{ scan_id: string; source: string; trusted: number; retailer: string | null; raw_json: string }>('SELECT * FROM user_offer');
  const reviews = rows<{ scan_id: string; source: string; trusted: number; summary: string; rating: number }>('SELECT * FROM user_review');
  assert.equal(offers.length, 3, 'the three offers in the answer were not kept');
  assert.equal(reviews.length, 1);
  for (const r of [...offers, ...reviews]) {
    assert.equal(r.scan_id, String(body.scanId), 'an offer or review lost its scan id');
    assert.equal(r.trusted, 0);
    assert.equal(r.source, 'gemini_scan');
  }
  assert.equal(reviews[0].summary, 'Liked.');
  assert.equal(reviews[0].rating, 4.5);
  assert.ok(JSON.parse(offers[0].raw_json) !== null, 'the offer as Gemini gave it was not kept');
});

test('row 39: keeping offers changes nothing about the answer, and the catalogue is still not consulted to answer', async () => {
  let asked = 0;
  setCatalogueForTests({
    byGtin: () => {
      asked += 1;
      return null;
    },
  } as never);
  const { body } = await identify('gtin=0068100084245&deviceId=offers-2');
  assert.equal(asked, 0);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original');
  setCatalogueForTests(null);
  await settleBackgroundChecks();
});
