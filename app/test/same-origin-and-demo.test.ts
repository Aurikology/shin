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

const { server } = await import('../server.ts');
const { getScan } = await import('../src/scans.ts');
const { summariseScans } = await import('../src/scan-summary.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
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

test('a scan route with a mismatched Origin is refused with a 403', async () => {
  const res = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-bad`, {
    headers: { origin: 'https://not-shin.example.com' },
  });
  assert.equal(res.status, 403);
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

/* ----------------------- the packaged app's CORS --------------------------
 * 2026-11-07. Measured from this server's own access log: between
 * 2026-10-28T04:28Z and 2026-11-07T03:39Z the packaged build sent 78168
 * OPTIONS requests and one GET, and completed no call at all. Three separate
 * refusals produced that, so there are tests for all three rather than one for
 * the preflight: the preflight was answered 405 by each POST route's method
 * check, the scan routes answered 403 because `capacitor://localhost` parses to
 * host `localhost` and never equals the server's host, and no response carried
 * an Access-Control-Allow-Origin even when the request itself was allowed.
 *
 * Each of these was run against the unfixed server first and seen to fail.
 */

const APP_ORIGIN = 'capacitor://localhost';

test("the packaged app's preflight to a POST route is answered, not 405'd", async () => {
  const res = await fetch(`${base()}/api/events/batch`, {
    method: 'OPTIONS',
    headers: {
      origin: APP_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, x-shin-device',
    },
  });
  assert.equal(res.status, 204, 'the preflight was refused, so the browser never sends the POST');
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('the preflight allows every header api.js actually sends', async () => {
  const res = await fetch(`${base()}/api/events/batch`, {
    method: 'OPTIONS',
    headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
  });
  const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  // The list in public/js/api.js `headers()`, plus the POST bodies' content-type.
  for (const h of [
    'content-type',
    'x-shin-invite',
    'x-shin-shutter',
    'x-shin-locale',
    'x-shin-lang',
    'x-shin-device',
    'x-shin-device-key',
    'x-shin-plus',
  ]) {
    assert.ok(allowed.includes(h), `${h} is sent by api.js but the preflight does not allow it`);
  }
});

test('the preflight is cached, so one call does not cost two round trips', async () => {
  const res = await fetch(`${base()}/api/events/batch`, {
    method: 'OPTIONS',
    headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
  });
  const maxAge = Number(res.headers.get('access-control-max-age'));
  assert.ok(maxAge > 0, 'no Max-Age means the browser preflights before every single call');
});

test("a scan route accepts the packaged app's Origin instead of refusing it 403", async () => {
  const res = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-capacitor`, {
    headers: { origin: APP_ORIGIN },
  });
  assert.equal(res.status, 200, 'the only client the testers have was refused by the origin check');
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
});

test('a real response carries Allow-Origin too, not just the preflight', async () => {
  // A preflight that passes and an answer with no Allow-Origin is still a CORS
  // error in the client: the call is made, the money is spent, the answer is
  // discarded. So this asserts on the POST itself, not on the OPTIONS.
  const res = await fetch(`${base()}/api/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
    body: JSON.stringify({ deviceId: 'origin-capacitor-post', type: 'x' }),
  });
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
  assert.equal(res.headers.get('vary'), 'Origin', 'without Vary a cache can cross two origins answers');
});

test('a stranger origin gets no CORS headers and its preflight is refused', async () => {
  const pre = await fetch(`${base()}/api/events/batch`, {
    method: 'OPTIONS',
    headers: { origin: 'https://not-shin.example.com', 'access-control-request-method': 'POST' },
  });
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null, 'a stranger was handed an allow header');

  const real = await fetch(`${base()}/api/catalogue`, {
    headers: { origin: 'https://not-shin.example.com' },
  });
  assert.equal(real.headers.get('access-control-allow-origin'), null);
});

test('a request with no Origin is not given CORS headers it never asked for', async () => {
  const res = await fetch(`${base()}/api/health`);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('every origin a packaged build can send is accepted, not just the one in the log', async () => {
  // native/capacitor.config.json sets iosScheme and androidScheme to https, so
  // a rebuild sends https://localhost while the build on the phones today sends
  // capacitor://localhost. Allowing only the measured one breaks the next build.
  for (const origin of ['capacitor://localhost', 'ionic://localhost', 'https://localhost']) {
    const pre = await fetch(`${base()}/api/events/batch`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST' },
    });
    assert.equal(pre.status, 204, `${origin} had its preflight refused`);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);

    const scan = await fetch(`${base()}/api/identify?gtin=0068100084245&deviceId=origin-${encodeURIComponent(origin)}`, {
      headers: { origin },
    });
    assert.equal(scan.status, 200, `${origin} was refused by the scan route's origin check`);
  }
});

/* ------------------------------- item 19 ---------------------------------- */

test('the demo route answers a fixed sample', async () => {
  const res = await fetch(`${base()}/api/identify/demo?deviceId=demo-a`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.demo, true);
  assert.equal(body.product.name, 'Kraft Dinner Original');
  assert.equal(body.product.brand, 'Kraft');
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
