/**
 * Everything this lane added, hit over a real socket.
 *
 * Plan items 7a, 7c, 8a, 8b, 9, 10, 11, 12, 1j, 19d, 39a, 39c.
 *
 * RUNS A REAL SERVER, and the reason is the same one `photo-route.test.ts`
 * gives: every case here is about the HTTP edge rather than about a function.
 * A 401 is a header check running before route matching, a 400 is a scan id
 * that names nothing, a `scanId` in a response body is two routes agreeing
 * about a field name with a client lane that is writing against it right now.
 * An in-process call to a handler with a fake request would be the test
 * agreeing with the code.
 *
 * THE ONE THING FAKED IS THE CATALOGUE, through `setCatalogueForTests`. The
 * real one is 4.13 GB and is not on a machine that runs tests, and without a
 * `byGtin` the identify route answers `catalogueUp: false`, writes no scan row
 * and has no id to return -- so every assertion about plan item 7a would be an
 * assertion about the offline path. The scan write, the telemetry columns, the
 * consent refusal, the store fields and the response shape are all shipped
 * code in every test below.
 *
 * THE SHOP LOOKUP IS FAKED TOO, through `setStoreFetcherForTests`, because
 * this lane's contract forbids a network call in a test and OpenStreetMap is
 * somebody else's server. The fixture is a real Overpass response shape.
 *
 * Both stores are pointed at temp files BEFORE the modules load, because each
 * resolves its path once at import.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-beta-routes-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
// No catalogue: the lookup is faked. The file is missing inside a folder that
// exists, which is exactly the state `startup.ts` is written to allow through.
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
// 0 asks the OS for a free port. The main session's server usually holds 4173.
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
// Scans are one Gemini call now; a recorded Gemini answers, and no key leaves the machine.
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setCatalogueForTests, setStoreFetcherForTests, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { openScanStore, getScan, allScans } = await import('../src/scans.ts');
const { ratingFor, ratingHistory } = await import('../src/ratings.ts');
const { readEvents } = await import('../src/events.ts');
const { resetStoreCache } = await import('../src/stores.ts');
const { setErrorSinkForTests } = await import('../src/errlog.ts');

let port = 0;

/** One catalogue row, in the shape `identify()` reads off `byGtin`. */
const ROW = {
  code: '0068100084245',
  name: 'Kraft Dinner Original',
  brands: 'Kraft',
  quantity: '225 g',
  sizeValue: 225,
  sizeUnit: 'g',
  soldInCanada: true,
  leafCategory: 'Macaroni',
  categoryPath: ['Groceries'],
  source: 'openfoodfacts',
};

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: (code: string) => (code === ROW.code ? ROW : null) });
  setGeminiTransportForTests(fakeTransport().transport);
});

after(async () => {
  setCatalogueForTests(null);
  setStoreFetcherForTests(null);
  setErrorSinkForTests(null);
  delete process.env.SHIN_INVITE_CODE;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const base = () => `http://127.0.0.1:${port}`;

function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${base()}${path}`, { headers });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The scan id from an identify call, which is the thing item 7a exists for. */
async function scanOnce(deviceId: string, extra = ''): Promise<number> {
  const res = await get(`/api/identify?gtin=${ROW.code}&deviceId=${deviceId}${extra}`);
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { scanId?: number; product: unknown };
  assert.ok(typeof seen.scanId === 'number', 'the identify response carried no scanId');
  return seen.scanId as number;
}

/* ------------------------- 7a, the scan id comes back -------------------- */

test('the identify response carries the id of the row it just wrote', async () => {
  const id = await scanOnce('d-7a');
  const row = getScan(id);
  assert.ok(row, 'the id in the response names no row');
  assert.equal(row!.device_id, 'd-7a');
  assert.equal(row!.resolved_code, ROW.code);
  assert.equal(row!.outcome, 'answered');
});

test('a scan Gemini could not answer gets an id too, because that row is worth pointing at', async () => {
  setGeminiTransportForTests(fakeTransport(() => ({ status: 503, text: 'unavailable' })).transport);
  try {
    const res = await get('/api/identify?gtin=0000000000000&deviceId=d-7a-miss');
    const seen = (await res.json()) as { scanId?: number; product: unknown };
    assert.equal(seen.product, null);
    assert.ok(typeof seen.scanId === 'number');
    assert.ok(getScan(seen.scanId!)!.failure_class, 'the failed call left no failure class on its row');
  } finally {
    setGeminiTransportForTests(fakeTransport().transport);
  }
});

/* ------------------------ 9e, the conditions of a scan ------------------- */

test('the app version, the platform and the latency land on the row', async () => {
  const id = await scanOnce('d-9e', '&appVersion=0.1.0&platform=ios');
  const row = getScan(id)!;
  assert.equal(row.app_version, '0.1.0');
  assert.equal(row.platform, 'ios');
  // Measured, so it is a number. Not asserted to be nonzero: a local barcode
  // lookup can genuinely take under a millisecond, and a test that demanded
  // otherwise would be demanding the product be slow.
  assert.equal(typeof row.latency_ms, 'number');
});

test('a client that reports nothing about itself writes nulls, not empty strings', async () => {
  const id = await scanOnce('d-9e-quiet');
  const row = getScan(id)!;
  assert.equal(row.app_version, null);
  assert.equal(row.platform, null);
});

/* ------------------- 6c and 11, consent gates the location --------------- */

test('consent defaults to photos kept and location off, for a device that has never been asked', async () => {
  // Location: his ruling of 2026-09-14 (docs/decisions.md, "Consent is off
  // until answered") stands. Photos: changed 2026-09-19 (beta gap item 13),
  // "save as much data as possible" and the wording delegated to the builder,
  // so a device with no row keeps photos until it says no. consent.ts's header.
  const res = await get('/api/consent?deviceId=d-consent-new');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { photos: true, location: false, updatedAt: null });
});

test('no cell is written for a device that never touched consent, because the default is off', async () => {
  const id = await scanOnce('d-default-off', '&cell=43.2609,-79.9192&storeId=node/1&storeName=Somewhere');
  const row = getScan(id)!;
  assert.equal(row.cell, null, 'a location was kept for a device that never said yes');
  assert.equal(row.store_id, null);
  assert.equal(row.store_name, null);
});

test('the exact position is never written, consent or not, even when a client sends it', async () => {
  // The cell stays coarse by design (2026-09-13, reaffirmed 2026-09-14). An
  // older client, or one push of this app, sent lat/lon beside the cell; the
  // server is the half that has to hold the line against either.
  await post('/api/consent', { deviceId: 'd-exact', photos: false, location: true });
  const id = await scanOnce(
    'd-exact',
    '&cell=43.2609,-79.9192&lat=43.26091&lon=-79.91923&accuracy=12.5&locatedAt=2026-09-14T12:00:00.000Z',
  );
  const row = getScan(id)!;
  assert.equal(row.cell, '43.26,-79.92', 'the coarse cell is the one location fact kept, and it was not');
  assert.equal(row.exact_lat, null, 'an exact latitude was written down');
  assert.equal(row.exact_lon, null);
  assert.equal(row.exact_accuracy, null);
  assert.equal(row.exact_at, null);
});

test('after consent, the cell is written, and it is written coarse', async () => {
  const stored = await post('/api/consent', { deviceId: 'd-location', photos: false, location: true });
  assert.deepEqual(await stored.json(), { stored: true });

  const id = await scanOnce('d-location', '&cell=43.2609,-79.9192&storeId=node/1&storeName=Somewhere');
  const row = getScan(id)!;
  // Snapped by the server, so a client that sent four decimal places does not
  // get four decimal places stored. This is the privacy promise, checked.
  assert.equal(row.cell, '43.26,-79.92');
  assert.equal(row.store_id, 'node/1');
  assert.equal(row.store_name, 'Somewhere');
});

test('without location consent, neither the cell nor the exact position is written', async () => {
  await post('/api/consent', { deviceId: 'd-exact-off', photos: false, location: false });
  const id = await scanOnce(
    'd-exact-off',
    '&cell=43.2609,-79.9192&lat=43.26091&lon=-79.91923&accuracy=12.5&locatedAt=2026-09-14T12:00:00.000Z',
  );
  const row = getScan(id)!;
  assert.equal(row.cell, null);
  assert.equal(row.exact_lat, null);
  assert.equal(row.exact_lon, null);
  assert.equal(row.exact_accuracy, null);
  assert.equal(row.exact_at, null);
});

test('a lone coordinate with no partner is never written', async () => {
  await post('/api/consent', { deviceId: 'd-exact-lone', photos: false, location: true });
  const id = await scanOnce('d-exact-lone', '&lat=43.26091');
  const row = getScan(id)!;
  assert.equal(row.exact_lat, null, 'a latitude with no longitude was written down');
  assert.equal(row.exact_lon, null);
});

test('consent reads back what was written, with a timestamp', async () => {
  const res = await get('/api/consent?deviceId=d-location');
  const seen = (await res.json()) as { photos: boolean; location: boolean; updatedAt: string | null };
  assert.equal(seen.photos, false);
  assert.equal(seen.location, true);
  assert.ok(seen.updatedAt && !Number.isNaN(Date.parse(seen.updatedAt)));
});

test('withdrawing consent takes effect on the next scan', async () => {
  await post('/api/consent', { deviceId: 'd-location', photos: false, location: false });
  const id = await scanOnce('d-location', '&cell=43.26,-79.92');
  assert.equal(getScan(id)!.cell, null, 'a location was kept after consent was withdrawn');
});

test('anything that is not literally true reads as no', async () => {
  // A client sending the string "true" is a real thing, and consent is the one
  // place a client bug must fail towards keeping less.
  await post('/api/consent', { deviceId: 'd-truthy', photos: 'true', location: 1 });
  assert.deepEqual((await (await get('/api/consent?deviceId=d-truthy')).json()) as object, {
    photos: false,
    location: false,
    updatedAt: (await (await get('/api/consent?deviceId=d-truthy')).json() as { updatedAt: string }).updatedAt,
  });
});

test('consent without a device is refused rather than filed under nobody', async () => {
  assert.equal((await get('/api/consent')).status, 400);
  assert.equal((await post('/api/consent', { photos: true, location: true })).status, 400);
});

/* ---------------------------- 8a and 8b, ratings ------------------------- */

test('a thumbs-up is stored against the scan it was about', async () => {
  const id = await scanOnce('d-rate');
  const res = await post('/api/scan-rating', { deviceId: 'd-rate', scanId: id, rating: 'up' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stored: true });
  const row = ratingFor(id)!;
  assert.equal(row.rating, 'up');
  assert.equal(row.device_id, 'd-rate');
  assert.equal(row.reason, null);
});

test('a second rating overwrites the first rather than adding a second row', async () => {
  const id = await scanOnce('d-rate-twice');
  await post('/api/scan-rating', { deviceId: 'd-rate-twice', scanId: id, rating: 'up' });
  await post('/api/scan-rating', { deviceId: 'd-rate-twice', scanId: id, rating: 'down', reason: 'wrong_price' });
  const row = ratingFor(id)!;
  assert.equal(row.rating, 'down');
  assert.equal(row.reason, 'wrong_price');
  const store = openScanStore();
  const count = store.db!.prepare('SELECT COUNT(*) AS n FROM scan_rating WHERE scan_id = ?').get(id) as {
    n: number;
  };
  assert.equal(Number(count.n), 1, 'a second tap wrote a second latest row');
  // Item 13 (2026-09-19): the first tap is not lost, it is history.
  const taps = ratingHistory(id);
  assert.deepEqual(
    taps.map((t) => t.rating),
    ['up', 'down'],
    'the first rating was overwritten instead of kept',
  );
});

test('a reason on a thumbs-up is dropped rather than losing the thumb over it', async () => {
  const id = await scanOnce('d-rate-updown');
  await post('/api/scan-rating', { deviceId: 'd-rate-updown', scanId: id, rating: 'up', reason: 'too_slow' });
  assert.equal(ratingFor(id)!.reason, null);
});

test('a reason this server has not shipped is dropped, and the thumb is kept', async () => {
  const id = await scanOnce('d-rate-chip');
  const res = await post('/api/scan-rating', {
    deviceId: 'd-rate-chip',
    scanId: id,
    rating: 'down',
    reason: 'the mascot was rude',
  });
  assert.equal(res.status, 200);
  assert.equal(ratingFor(id)!.rating, 'down');
  assert.equal(ratingFor(id)!.reason, null);
});

test('the undo deletes it, and asking twice is still success', async () => {
  const id = await scanOnce('d-rate-undo');
  await post('/api/scan-rating', { deviceId: 'd-rate-undo', scanId: id, rating: 'down' });
  const first = await post('/api/scan-rating/delete', { deviceId: 'd-rate-undo', scanId: id });
  assert.deepEqual(await first.json(), { deleted: true });
  assert.equal(ratingFor(id), null);
  // A double-tapped undo must not read as a failure to a queue that would then
  // retry it forever.
  assert.equal((await post('/api/scan-rating/delete', { deviceId: 'd-rate-undo', scanId: id })).status, 200);
});

test('a rating with no scan id, or one that names nothing, is a 400', async () => {
  for (const body of [
    { deviceId: 'd-rate-bad', rating: 'up' },
    { deviceId: 'd-rate-bad', scanId: 0, rating: 'up' },
    { deviceId: 'd-rate-bad', scanId: 'seven', rating: 'up' },
    { deviceId: 'd-rate-bad', scanId: 999_999, rating: 'up' },
  ]) {
    const res = await post('/api/scan-rating', body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} was accepted`);
  }
});

test('a rating that is not up or down is a 400, and so is a rating with no device', async () => {
  const id = await scanOnce('d-rate-shape');
  assert.equal((await post('/api/scan-rating', { deviceId: 'd-rate-shape', scanId: id, rating: 'meh' })).status, 400);
  assert.equal((await post('/api/scan-rating', { scanId: id, rating: 'up' })).status, 400);
});

test('the profile screen can see the rated counts', async () => {
  const id = await scanOnce('d-rate-counts');
  await post('/api/scan-rating', { deviceId: 'd-rate-counts', scanId: id, rating: 'down', reason: 'no_price' });
  const seen = (await (await get('/api/scans?deviceId=d-rate-counts')).json()) as {
    rated: { up: number; down: number; reasons: Record<string, number> };
  };
  assert.equal(seen.rated.down, 1);
  assert.equal(seen.rated.up, 0);
  assert.equal(seen.rated.reasons.no_price, 1);
});

/* ------------------------------- 10, events ------------------------------ */

test('a client event is stored and comes back in the export reader', async () => {
  const res = await post('/api/event', {
    deviceId: 'd-event',
    type: 'app_opened',
    payload: { cold: true },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stored: true });
  const rows = readEvents({ deviceId: 'd-event' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'app_opened');
  assert.deepEqual(JSON.parse(rows[0].payload!), { cold: true });
});

test('an event with no device or no type is a 400', async () => {
  assert.equal((await post('/api/event', { type: 'x' })).status, 400);
  assert.equal((await post('/api/event', { deviceId: 'd' })).status, 400);
});

test('a payload too big for the log is refused with a sentence, not stored truncated', async () => {
  const res = await post('/api/event', { deviceId: 'd-event-big', type: 'x', payload: { s: 'x'.repeat(5000) } });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /bytes of JSON/);
});

test('the server writes its own events: that a Gemini call was made, and how it ended', async () => {
  await scanOnce('d-server-events');
  setGeminiTransportForTests(fakeTransport(() => ({ status: 503, text: 'unavailable' })).transport);
  try {
    await get('/api/identify?gtin=0000000000000&deviceId=d-server-events');
  } finally {
    setGeminiTransportForTests(fakeTransport().transport);
  }
  const calls = readEvents({ deviceId: 'd-server-events' }).filter((r) => r.type === 'model_call');
  assert.equal(calls.length, 2, 'no event recorded each Gemini call');
  const failures = calls.map((r) => (JSON.parse(String(r.payload)) as { failure: string | null }).failure);
  assert.ok(failures.includes(null), 'no event recorded the call that answered');
  assert.ok(failures.some((x) => x !== null), 'no event recorded the call that failed');
});

/* ------------------------- 10, track.js's own door ------------------------ */

test('a batch of events is stored one at a time through the same path as /api/event', async () => {
  const res = await post('/api/events/batch', {
    events: [
      { deviceId: 'd-batch', type: 'app_open', payload: { standalone: false } },
      { deviceId: 'd-batch', type: 'tap', payload: { label: 'shutter' } },
      { deviceId: 'd-batch', type: 'screen_view', payload: { screen: 'camera' } },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stored: 3, dropped: 0, received: 3 });
  const rows = readEvents({ deviceId: 'd-batch' });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.type).sort(), ['app_open', 'screen_view', 'tap']);
});

test('one malformed event in a batch is dropped, and the other 199 are not', async () => {
  const events = [
    { deviceId: 'd-batch-partial', type: 'tap', payload: {} }, // no deviceId/type below, dropped
    { type: 'tap' }, // missing deviceId
    ...Array.from({ length: 198 }, (_, i) => ({ deviceId: 'd-batch-partial', type: 'tap', payload: { i } })),
  ];
  const res = await post('/api/events/batch', { events });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { stored: number; dropped: number; received: number };
  assert.equal(seen.received, 200);
  assert.equal(seen.dropped, 1, 'the one malformed event was not the only thing dropped');
  assert.equal(seen.stored, 199);
  assert.equal(readEvents({ deviceId: 'd-batch-partial' }).length, 199);
});

test('a batch over the per-request cap is truncated, not refused', async () => {
  const events = Array.from({ length: 250 }, (_, i) => ({ deviceId: 'd-batch-cap', type: 'tap', payload: { i } }));
  const res = await post('/api/events/batch', { events });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { stored: number; dropped: number; received: number };
  // received names what the client sent; stored is capped at 200 regardless.
  assert.equal(seen.received, 250);
  assert.equal(seen.stored, 200);
  assert.equal(readEvents({ deviceId: 'd-batch-cap' }).length, 200);
});

test('events is required and must be an array', async () => {
  assert.equal((await post('/api/events/batch', {})).status, 400);
  assert.equal((await post('/api/events/batch', { events: 'nope' })).status, 400);
});

test('the batch door sits behind the same invite guard as every other route', async () => {
  process.env.SHIN_INVITE_CODE = 'let-me-in';
  try {
    const res = await post('/api/events/batch', { events: [{ deviceId: 'd', type: 'x' }] });
    assert.equal(res.status, 401);
    const allowed = await post(
      '/api/events/batch',
      { events: [{ deviceId: 'd-batch-invited', type: 'x' }] },
      { 'x-shin-invite': 'let-me-in' },
    );
    assert.equal(allowed.status, 200);
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

/* ------------------------------- 11b, stores ----------------------------- */

const OVERPASS_FIXTURE = JSON.stringify({
  elements: [
    { type: 'way', id: 11, center: { lat: 43.2601, lon: -79.9201 }, tags: { name: 'Near Mart', shop: 'supermarket', 'addr:housenumber': '75', 'addr:street': 'King St E' } },
    { type: 'node', id: 12, lat: 43.2612, lon: -79.9215, tags: { name: 'Middle Mart', shop: 'convenience' } },
    { type: 'node', id: 13, lat: 43.2700, lon: -79.9300, tags: { name: 'Third Mart', shop: 'supermarket' } },
    { type: 'node', id: 14, lat: 43.2800, lon: -79.9400, tags: { name: 'Fourth Mart', shop: 'supermarket' } },
  ],
});

test('the store route offers at most three, nearest first, with a hint on each', async () => {
  resetStoreCache();
  setStoreFetcherForTests(async () => OVERPASS_FIXTURE);
  const res = await get('/api/stores?cell=43.26,-79.92');
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { stores: { id: string; name: string; hint: string }[] };
  assert.equal(seen.stores.length, 3);
  assert.deepEqual(seen.stores.map((s) => s.name), ['Near Mart', 'Middle Mart', 'Third Mart']);
  assert.equal(seen.stores[0].hint, '75 King St E');
});

test('a lookup that fails is an empty list and a 200, never an error the screen has to handle', async () => {
  resetStoreCache();
  setStoreFetcherForTests(async () => {
    throw new Error('overpass answered 429');
  });
  const res = await get('/api/stores?cell=44.00,-79.00');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()) as object, { stores: [] });
});

test('a cell that is not a cell is a 400 that says what a cell looks like', async () => {
  const res = await get('/api/stores?cell=somewhere');
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /two decimal places/);
});

/* ------------------ 7c and 19d, corrections attach to a scan ------------- */

test('a correction with a scan id marks that row, not the last one matching', async () => {
  const first = await scanOnce('d-7c');
  const second = await scanOnce('d-7c');
  assert.notEqual(first, second);

  const res = await post('/api/correction', {
    clientId: 'c-7c-1',
    deviceId: 'd-7c',
    scanId: first,
    code: ROW.code,
    label: ROW.name,
    seller: 'Test Mart',
    priceCents: 499,
    seenOn: '2026-09-11',
  });
  assert.deepEqual((await res.json()) as { stored: boolean }, { stored: true, id: 1 } as never);

  // By id: the FIRST row is the corrected one. The last-answered lookup would
  // have found the second, which is the silent wrong answer item 7c removes.
  assert.equal(getScan(first)!.outcome, 'corrected');
  assert.equal(getScan(second)!.outcome, 'answered');
});

test('the typed price and the store land on the scan row the correction named', async () => {
  await post('/api/consent', { deviceId: 'd-9c', photos: false, location: true });
  const id = await scanOnce('d-9c');
  await post('/api/correction', {
    clientId: 'c-9c-1',
    deviceId: 'd-9c',
    scanId: id,
    code: ROW.code,
    seller: 'Test Mart',
    priceCents: 599,
    seenOn: '2026-09-11',
    cell: '43.2609,-79.9192',
    storeId: 'node/12',
    storeName: 'Middle Mart',
  });
  const row = getScan(id)!;
  assert.equal(row.typed_price_cents, 599);
  assert.equal(row.store_name, 'Middle Mart');
  assert.equal(row.cell, '43.26,-79.92');
});

test('without a scan id the last-answered lookup still works, because old clients have none', async () => {
  const id = await scanOnce('d-7c-old');
  const res = await post('/api/correction', {
    clientId: 'c-7c-old',
    deviceId: 'd-7c-old',
    code: ROW.code,
    seller: 'Test Mart',
    priceCents: 450,
    seenOn: '2026-09-11',
  });
  assert.equal(((await res.json()) as { stored: boolean }).stored, true);
  assert.equal(getScan(id)!.outcome, 'corrected');
});

/*
 * PLAN ITEM 19d, THE TESTER-VISIBLE DEFECT.
 *
 * Before the fix this posted, answered `stored: true`, and filed the price
 * under `text:kraft dinner original`. The only reader, `correctionsFor` in
 * price/src/corrections.ts, takes a code and a product id and returns [] when
 * both are null: it cannot match a text subject and never will. So the tester
 * saw their price accepted and it could never appear in any verdict, which is
 * exactly the shape a corrections screen sends for anything the catalogue
 * refused -- the case where somebody is most motivated to type a price in.
 */
test('a price with nothing to attach it to is refused, in the route own shape', async () => {
  const res = await post('/api/correction', {
    clientId: 'c-19d',
    deviceId: 'd-19d',
    label: 'some cereal nobody identified',
    seller: 'Test Mart',
    priceCents: 399,
    seenOn: '2026-09-11',
  });
  assert.equal(res.status, 200, 'a refusal here is a 200 with a sentence, as this route documents');
  const seen = (await res.json()) as { stored: boolean; why: string };
  assert.equal(seen.stored, false);
  assert.match(seen.why, /no product attached/);
  // And the aggression points at the situation, never at the person.
  assert.ok(!/you (did|failed|forgot)/i.test(seen.why));
});

test('and a scan id is enough to attach one, even when the client echoed no code', async () => {
  const id = await scanOnce('d-19d-fixed');
  const res = await post('/api/correction', {
    clientId: 'c-19d-fixed',
    deviceId: 'd-19d-fixed',
    scanId: id,
    seller: 'Test Mart',
    priceCents: 399,
    seenOn: '2026-09-11',
  });
  const seen = (await res.json()) as { stored: boolean };
  assert.equal(seen.stored, true, 'the scan the price was about was not used to attach it');
  assert.equal(getScan(id)!.outcome, 'corrected');
  assert.equal(getScan(id)!.typed_price_cents, 399);
});

/* -------------------------------- 12, user id ---------------------------- */

test('every table the beta writes carries a nullable user id, and nothing fills it', async () => {
  const id = await scanOnce('d-12');
  await post('/api/scan-rating', { deviceId: 'd-12', scanId: id, rating: 'up' });
  await post('/api/event', { deviceId: 'd-12', type: 'app_opened' });
  await post('/api/consent', { deviceId: 'd-12', photos: false, location: false });
  const db = openScanStore().db!;
  for (const table of ['scan', 'scan_rating', 'event', 'consent']) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).map(
      (c) => c.name,
    );
    assert.ok(columns.includes('user_id'), `${table} has no user_id column`);
  }
  assert.equal(getScan(id)!.user_id, null);
  // And the link table exists and is empty, which is plan item 12b exactly.
  const linked = db.prepare('SELECT COUNT(*) AS n FROM device_user').get() as { n: number };
  assert.equal(Number(linked.n), 0);
});

/* --------------------------------- 39c, ops ------------------------------ */

test('the uptime ping answers, and says whether the scan log and the catalogue are up', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { ok: boolean; uptimeSeconds: number; scanLog: boolean; catalogueUp: boolean };
  assert.equal(seen.ok, true);
  assert.equal(typeof seen.uptimeSeconds, 'number');
  assert.equal(seen.scanLog, true);
  // The flag that matters: a server whose catalogue did not attach is not
  // healthy, and a ping that only says the process is alive is green through
  // exactly that outage.
  assert.equal(seen.catalogueUp, true);
});

test('the latency reader reports a p95 per day and per kind', async () => {
  await scanOnce('d-39c');
  const seen = (await (await get('/api/latency?days=1')).json()) as {
    days: number;
    latency: { day: string; kind: string; count: number; p95Ms: number }[];
  };
  assert.equal(seen.days, 1);
  const barcode = seen.latency.find((r) => r.kind === 'barcode');
  assert.ok(barcode, 'no barcode row in the latency report');
  assert.ok(barcode!.count > 0);
  assert.equal(typeof barcode!.p95Ms, 'number');
  // The combined row exists beside the per-kind ones, so one number is
  // available without anybody having to add them up wrongly.
  assert.ok(seen.latency.some((r) => r.kind === 'all'));
});

/* ------------------------------ 39a, error log --------------------------- */

/*
 * RETIRED with the catalogue answer (beta gap item 2). This test manufactured a
 * post-scan throw with a BigInt in a catalogue row; a scan no longer reads the
 * catalogue, and every value in a Gemini answer is parsed JSON, so there is no
 * longer a manufacturable serialisation failure on that path. The catch that
 * logs `where`, `deviceId` and `scanId` is still in server.ts and is not
 * exercised here.
 */

/* --------------------------------- 1j, invite ---------------------------- */

test('with no invite code configured, every route answers as it always did', async () => {
  assert.equal((await get('/api/attribution')).status, 200);
});

test('with a code configured, an API call without the header is refused', async () => {
  process.env.SHIN_INVITE_CODE = 'let-me-in';
  try {
    const res = await get('/api/attribution');
    assert.equal(res.status, 401);
    assert.match(((await res.json()) as { error: string }).error, /closed beta/);
    assert.equal((await get('/api/attribution', { 'x-shin-invite': 'wrong' })).status, 401);
    assert.equal((await get('/api/attribution', { 'x-shin-invite': 'let-me-in' })).status, 200);
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

test('the door is in front of every API route, including the writes', async () => {
  process.env.SHIN_INVITE_CODE = 'let-me-in';
  try {
    assert.equal((await post('/api/event', { deviceId: 'd', type: 'x' })).status, 401);
    assert.equal((await get('/api/scans')).status, 401);
    assert.equal((await get('/api/consent?deviceId=d')).status, 401);
    assert.equal((await get('/api/nonsense')).status, 401, 'a wrong path answered before the door did');
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

test('the uptime ping answers without a code, because a rotated secret must not blind the monitor', async () => {
  process.env.SHIN_INVITE_CODE = 'let-me-in';
  try {
    assert.equal((await get('/api/health')).status, 200);
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

test('the screens are not behind the door, because a locked-out browser looks like a broken site', async () => {
  process.env.SHIN_INVITE_CODE = 'let-me-in';
  try {
    const res = await get('/index.html');
    assert.notEqual(res.status, 401);
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

/* ------------------------- nothing was lost on the way ------------------- */

test('every scan this file made is still one row each, and none of them dropped', () => {
  const store = openScanStore();
  assert.equal(store.dropped, 0, store.droppedWhy);
  assert.ok(allScans(store).length > 0);
});
