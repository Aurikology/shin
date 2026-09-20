/**
 * Item 18 (docs/scanner-build-order-2026-09-19.md, section 18), ruling 8
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): same-origin enforcement on every scan route (a missing
 * Origin is allowed and marked, a mismatched one is refused), plus a
 * frame-embedding block header on every response.
 *
 * Item 19 (build-order section 19): a demo scan route that answers with a
 * fixed sample and never calls a provider, whose row is marked as demo so it
 * is never counted as a real scan anywhere a rate is read, including the
 * profile screen.
 *
 * Both items share one server-level test file because both are about the
 * request/response edge rather than about a function, the same reason
 * `server-beta-routes.test.ts` gives for running a real socket.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-origin-demo-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_ACCESS_LOG = join(dir, 'access.log');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { getScan } = await import('../src/scans.ts');
const { summariseScans } = await import('../src/scan-summary.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setGeminiTransportForTests(fakeTransport().transport);
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

const base = () => `http://127.0.0.1:${port}`;

/* ------------------------------- item 18 ---------------------------------- */

test('a scan route with no Origin header is allowed through', async () => {
  const res = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-none`);
  assert.equal(res.status, 200);
});

test('a scan route with a matching Origin is allowed through', async () => {
  const res = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-match`, {
    headers: { origin: base() },
  });
  assert.equal(res.status, 200);
});

test('a scan route with a mismatched Origin is refused with a 403, and reaches no Gemini call', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const res = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-bad`, {
    headers: { origin: 'https://not-shin.example.com' },
  });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0, 'a refused, cross-origin request still spent a Gemini call');
  setGeminiTransportForTests(fakeTransport().transport);
});

test('a route outside the scan set is not gated by Origin at all', async () => {
  const res = await fetch(`${base()}/api/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://not-shin.example.com' },
    body: JSON.stringify({ deviceId: 'origin-nonscan', type: 'x' }),
  });
  assert.notEqual(res.status, 403, 'a non-scan route was gated by Origin, which is not its threat model');
});

test('every response carries the frame-embedding block, including a plain 404', async () => {
  const res = await fetch(`${base()}/this-route-does-not-exist`);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});

/* ------------------------------- item 19 ---------------------------------- */

test('the demo route answers a fixed sample, with no provider call', async () => {
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const res = await fetch(`${base()}/api/identify/demo?deviceId=demo-a`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.demo, true);
  assert.equal(body.product.name, 'Kraft Dinner Original');
  assert.equal(body.product.brand, 'Kraft');
  assert.equal(calls.length, 0, 'the demo route reached a real provider call');
  setGeminiTransportForTests(fakeTransport().transport);
});

test('the demo route\'s row is marked as demo', async () => {
  const res = await fetch(`${base()}/api/identify/demo?deviceId=demo-b`);
  const body = (await res.json()) as any;
  assert.ok(typeof body.scanId === 'number', 'the demo scan left no row to check');
  const row = getScan(body.scanId) as unknown as { is_demo: number };
  assert.equal(row.is_demo, 1, 'the demo scan row was not marked as demo');
});

test('a demo scan is never counted by summariseScans, including this device\'s own weekly count', async () => {
  const before = summariseScans('demo-count-device');
  await fetch(`${base()}/api/identify/demo?deviceId=demo-count-device`);
  const after = summariseScans('demo-count-device');
  assert.equal(after.scans, before.scans, 'a demo scan was counted in the overall total');
  assert.equal(after.thisDevice?.scansThisWeek, before.thisDevice?.scansThisWeek, 'a demo scan was counted in this device\'s weekly count');
});
