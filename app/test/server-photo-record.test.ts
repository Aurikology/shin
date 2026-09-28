/**
 * The photo route's half of the complete scan record, at the socket.
 *
 * Plan items 7a, 9a, 9b, 9e, 13c and 39d.
 *
 * SEPARATE FROM `server-beta-routes.test.ts` for one reason: this file needs
 * the model double, and a double is installed per process. `photo-route.test.ts`
 * already covers the door (the cap on the body, the magic bytes, the rate
 * limit, the outcome mapping); this covers what is now WRITTEN DOWN when a
 * photo comes through, which is everything plan item 9 added and none of which
 * that file was written to know about.
 *
 * THE MODEL DOUBLE GOES IN THROUGH `setGeminiTransportForTests`, the way
 * `photo-route.test.ts` builds one, so the timeout, the retry policy and the
 * failure classification under test are the real ones rather than a second
 * implementation written here.
 *
 * WHAT THIS FILE CANNOT CHECK, said rather than skipped: the spend cap being
 * WIRED against a real model. The real path needs the Gemini SDK and a key.
 * What is checked here is the half that can be: a `spend_cap_reached` failure
 * coming back from a model travels out of this route with its own sentence
 * and its own failure class, rather than being flattened into "that photo
 * could not be read" -- which is what the cap is for, since taking the photo
 * again cannot work when the budget is spent.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-photo-record-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

process.env.GEMINI_API_KEY = 'test-key-never-sent';
// Named, because the photo route declines on an unnamed key. See photo-route.test.ts.
process.env.SHIN_GEMINI_TIER = 'paid';
const { server, setGeminiTransportForTests, setSpendGuardForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { spendCapRefusalMessage } = await import('../../identify/src/cap.ts');
const { openScanStore, getScan, allScans, geminiCallsForScan } = await import('../src/scans.ts');
const { photoExists, sweepPhotos } = await import('../src/photos.ts');
const { readEvents } = await import('../src/events.ts');
import type { MessagesClient } from '../../identify/src/model.ts';

let port = 0;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  setGeminiTransportForTests(null);
  setSpendGuardForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

/* ----------------------------- the doubles ----------------------------- */

const READING = {
  front_text: ['KRAFT DINNER', 'Original', '225 g'],
  barcode_digits: null,
  count: null,
  language_seen: 'en',
  brand: 'Kraft',
  name: 'Dinner',
  variant: 'Original',
  size_value: 225,
  size_unit: 'g',
  category: 'grocery',
  visible_text: 'KRAFT DINNER Original 225 g',
  alternates: [],
  self_confidence: 0.9,
  uncertainty: null,
};

function answeringClient(payload: unknown): MessagesClient {
  return {
    messages: {
      create: async () =>
        ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }) as never,
    },
  };
}

const useModel = (_client?: MessagesClient) => {
  setSpendGuardForTests(null);
  setGeminiTransportForTests(fakeTransport().transport);
};
/** The day's budget is spent: the guard in front of the call says no. */
const useSpentBudget = () => {
  setGeminiTransportForTests(fakeTransport().transport);
  setSpendGuardForTests(() => false);
};

/** A real 1x1 PNG, so the magic-byte check is reading a genuine header. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const base = () => `http://127.0.0.1:${port}`;

function postPhoto(body: Record<string, unknown>) {
  return fetch(`${base()}/api/identify/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: PNG_1x1.toString('base64'), sharpness: 80, ...body }),
  });
}

function postJson(path: string, body: unknown) {
  return fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ------------------------------- the tests ------------------------------ */

test('the photo response carries the id of the row it just wrote', async () => {
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-7a', appVersion: '0.1.0', platform: 'android' });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { scanId?: number; unchecked: { name: string } | null };
  assert.ok(seen.unchecked, 'Gemini named nothing');
  assert.ok(typeof seen.scanId === 'number', 'the photo response carried no scanId');
  assert.equal(getScan(seen.scanId!)!.kind, 'photo');
});

test('what Gemini said is kept whole, on the row that points at the scan', async () => {
  useModel();
  const res = await postPhoto({ deviceId: 'p-9b' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.source, 'gemini');
  assert.ok(row.model_json, 'the model output was not written down');
  const model = JSON.parse(row.model_json!) as Record<string, unknown>;
  assert.match(String(model.readAs), /^Kraft Dinner Original/);
  // The image is not in there. This column is backed up nightly to a laptop.
  assert.ok(!JSON.stringify(model).includes(PNG_1x1.toString('base64').slice(0, 20)));
  const stored = geminiCallsForScan(scanId);
  assert.equal(stored.length, 1);
  assert.match(String(stored[0].response_raw), /Kraft Dinner Original/);
  assert.ok(!stored[0].request_json.includes(PNG_1x1.toString('base64').slice(0, 20)), 'raw image bytes were stored');
});

test('the conditions of the call are on the row', async () => {
  useModel();
  const res = await postPhoto({ deviceId: 'p-9e', appVersion: '0.2.0', platform: 'ios' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.app_version, '0.2.0');
  assert.equal(row.platform, 'ios');
  assert.equal(typeof row.latency_ms, 'number');
  // No per-call cost figure is written: no sourced 2.5 token rate exists in
  // this repo. The tokens, the search count and the billing basis are on the
  // Gemini call row, so a cost can be derived, not guessed.
  assert.equal(geminiCallsForScan(scanId)[0].input_tokens, 1000);
});

test('a photo is not kept when the device has explicitly opted out', async () => {
  // Photos default ON (2026-09-19): opting out explicitly here exercises the
  // written-no path, which is a different row from no row, and must win.
  await postJson('/api/consent', { deviceId: 'p-9a-no', photos: false, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9a-no' });
  const { scanId } = (await res.json()) as { scanId: number };
  assert.equal(getScan(scanId)!.photo_path, null, 'a photograph was kept after an explicit opt-out');
});

test('no photo is kept for a device that never touched consent, because photos default off', async () => {
  // D-148: the standing ruling "Location and photo consent default off until
  // answered". Photos defaulted on from 2026-09-19 until D-148. The test
  // below is the other half: a written yes is kept.
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-default-off' });
  const { scanId } = (await res.json()) as { scanId: number };
  assert.equal(getScan(scanId)!.photo_path, null, 'a photograph was kept for a device that was never asked');
});

test('and it is kept, keyed by the scan id, once the device has', async () => {
  assert.deepEqual(
    (await (await postJson('/api/consent', { deviceId: 'p-9a-yes', photos: true, location: false })).json()) as object,
    { stored: true },
  );
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9a-yes' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.photo_path, `${scanId}.png`, 'the photo path is not the scan id');
  assert.ok(photoExists(row.photo_path!), 'the row claims a file that is not on disk');
});

test('withdrawing photo consent stops the next one being kept', async () => {
  await postJson('/api/consent', { deviceId: 'p-9a-yes', photos: false, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9a-yes' });
  const { scanId } = (await res.json()) as { scanId: number };
  assert.equal(getScan(scanId)!.photo_path, null);
});

/*
 * PLAN ITEM 39d, RETIRED 2026-09-14. Collecting everything means photos are
 * kept forever unless SHIN_PHOTO_RETENTION_DAYS names a real window, so the
 * old "ninety days by default" test now sets that window explicitly rather
 * than relying on a default that no longer sweeps at all. The clock is still
 * injected, so this proves the shipped function rather than a copy of its
 * arithmetic, and it still runs in milliseconds.
 */
test('a photograph past a configured retention window is deleted and its path is cleared', async () => {
  await postJson('/api/consent', { deviceId: 'p-39d', photos: true, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-39d' });
  const { scanId } = (await res.json()) as { scanId: number };
  const kept = getScan(scanId)!.photo_path!;
  assert.ok(photoExists(kept));

  process.env.SHIN_PHOTO_RETENTION_DAYS = '90';
  try {
    // Eighty-nine days on: still inside the window, still there.
    const soon = new Date(Date.now() + 89 * 24 * 60 * 60 * 1000);
    assert.equal(sweepPhotos(soon).deleted, 0);
    assert.ok(photoExists(kept), 'a photo was deleted a day early');

    // Ninety-one days on: gone from disk and gone from the row.
    const later = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    const result = sweepPhotos(later);
    assert.ok(result.deleted >= 1);
    assert.ok(!photoExists(kept), 'the file outlived the retention window');
    assert.equal(getScan(scanId)!.photo_path, null, 'the row still claims a file that is gone');
    // The scan itself survives. The photograph is the part with a date on it.
    assert.equal(getScan(scanId)!.kind, 'photo');
  } finally {
    delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  }
});

test('with no retention window set, a photo is never swept, however far the clock runs', async () => {
  await postJson('/api/consent', { deviceId: 'p-39d-forever', photos: true, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-39d-forever' });
  const { scanId } = (await res.json()) as { scanId: number };
  const kept = getScan(scanId)!.photo_path!;
  assert.ok(photoExists(kept));

  delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  // A thousand days out. Forever means forever, not a long default.
  const farFuture = new Date(Date.now() + 1000 * 24 * 60 * 60 * 1000);
  const result = sweepPhotos(farFuture);
  assert.equal(result.deleted, 0);
  assert.equal(result.considered, 0);
  assert.equal(result.keptForever, true);
  assert.ok(photoExists(kept), 'a photo was swept with no retention window configured');
  assert.equal(getScan(scanId)!.photo_path, kept);
});

test('the retention window is a setting, so the privacy wording and the behaviour move together', async () => {
  await postJson('/api/consent', { deviceId: 'p-39d-short', photos: true, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-39d-short' });
  const { scanId } = (await res.json()) as { scanId: number };
  process.env.SHIN_PHOTO_RETENTION_DAYS = '1';
  try {
    sweepPhotos(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    assert.equal(getScan(scanId)!.photo_path, null);
  } finally {
    delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  }
});

/*
 * PLAN ITEM 13c, the half this file can reach. The cap's own wiring is at
 * construction and is named in this file's header as uncheckable here.
 */
test('a spent budget keeps its own sentence instead of becoming "take it again"', async () => {
  useSpentBudget();
  const res = await postPhoto({ deviceId: 'p-cap' });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { failure: string; categoryWhy: string; scanId: number };
  assert.equal(seen.failure, 'spend_cap_reached');
  assert.equal(seen.categoryWhy, spendCapRefusalMessage());
  assert.ok(!/closer/i.test(seen.categoryWhy));
});

test('a capped scan records as capped, is charged nothing, and never reaches Gemini', async () => {
  const t = fakeTransport();
  setGeminiTransportForTests(t.transport);
  setSpendGuardForTests(() => false);
  const res = await postPhoto({ deviceId: 'p-cap-row' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.failure_class, 'spend_cap_reached');
  assert.equal(row.model_cost_cents, null);
  assert.equal(t.calls.length, 0, 'a spent budget still sent a request to Gemini');
});

test('the server writes a model_call event carrying the model, the family and the one pass', async () => {
  useModel();
  await postPhoto({ deviceId: 'p-event' });
  const rows = readEvents({ deviceId: 'p-event' });
  const call = rows.find((r) => r.type === 'model_call');
  assert.ok(call, 'no model_call event was written');
  const payload = JSON.parse(call!.payload!) as { model: string; family: string; passes: number; failure: string | null };
  assert.match(payload.model, /^gemini-/);
  assert.ok(['2.5', '3.x'].includes(payload.family));
  assert.equal(payload.passes, 1);
  assert.equal(payload.failure, null);
});

test('nothing in this file dropped a scan', () => {
  const store = openScanStore();
  assert.equal(store.dropped, 0, store.droppedWhy);
  assert.ok(allScans(store).length > 0);
});
