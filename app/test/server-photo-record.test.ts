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
 * THE MODEL DOUBLE IS A REAL `Identifier` with a fake `MessagesClient`, the
 * way `identify/test/model.test.ts` and `photo-route.test.ts` both build one,
 * so the timeout, the retry policy and the failure classification under test
 * are the real ones rather than a second implementation written here.
 *
 * WHAT THIS FILE CANNOT CHECK, said rather than skipped: the spend cap being
 * WIRED. `modelOnce` builds the capped client only when there is no test
 * double, because a double is the thing that replaces it, and the real path
 * needs the Anthropic SDK and a key. What is checked here is the half that can
 * be: a `spend_cap_reached` failure coming back from a model travels out of
 * this route with its own sentence and its own failure class, rather than
 * being flattened into "that photo could not be read" -- which is what the cap
 * is for, since taking the photo again cannot work when the budget is spent.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-photo-record-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

const { server, setIdentifierForTests } = await import('../server.ts');
const { Identifier, ModelCallError } = await import('../../identify/src/model.ts');
const { spendCapRefusalMessage } = await import('../../identify/src/cap.ts');
const { openScanStore, getScan, allScans } = await import('../src/scans.ts');
const { photoExists, sweepPhotos } = await import('../src/photos.ts');
const { readEvents } = await import('../src/events.ts');
import type { MessagesClient } from '../../identify/src/model.ts';
import type { CatalogueLookup } from '../../identify/src/identify.ts';

let port = 0;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  setIdentifierForTests(null);
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

/** What the wrapped client throws once today's dollar cap is spent. */
function cappedClient(): MessagesClient {
  return {
    messages: {
      create: async () => {
        throw new ModelCallError('spend_cap_reached', spendCapRefusalMessage());
      },
    },
  };
}

const HIT: CatalogueLookup = async () => ({
  band: 'confident',
  candidates: [
    {
      code: '0068100084245',
      name: 'Kraft Dinner Original',
      brands: 'Kraft',
      quantity: '225 g',
      sizeValue: 225,
      sizeUnit: 'g',
      categoryPath: [],
      allergens: [],
      signals: { similarity: 0.92, brandAgrees: true, sizeAgrees: true },
    },
  ],
  ring: null,
  matchedBy: 'hybrid',
});

const useModel = (client: MessagesClient, lookup: CatalogueLookup = HIT) =>
  setIdentifierForTests({ model: new Identifier('test-key-not-used', client), lookup });

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
  const seen = (await res.json()) as { scanId?: number; product: { code: string } | null };
  assert.ok(seen.product);
  assert.ok(typeof seen.scanId === 'number', 'the photo response carried no scanId');
  assert.equal(getScan(seen.scanId!)!.kind, 'photo');
});

test('what the model said is kept whole, candidates and all', async () => {
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9b' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.ok(row.model_json, 'the model output was not written down');
  const model = JSON.parse(row.model_json!) as Record<string, unknown>;
  assert.equal(model.readAs, 'Kraft Dinner');
  assert.equal((model.chosen as { code: string }).code, '0068100084245');
  assert.equal(model.tier, 'basic');
  assert.ok('candidates' in model, 'the candidate list, which never used to leave the server, is still not kept');
  assert.ok('confidence' in model);
  // The image is not in there. This column is backed up nightly to a laptop.
  assert.ok(!JSON.stringify(model).includes(PNG_1x1.toString('base64').slice(0, 20)));
});

test('the conditions of the call are on the row, and the cost is an estimate not a zero', async () => {
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9e', appVersion: '0.2.0', platform: 'ios', tier: 'pro' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.app_version, '0.2.0');
  assert.equal(row.platform, 'ios');
  assert.equal(typeof row.latency_ms, 'number');
  assert.equal(row.model_cost_cents, 0.68);
});

test('a photo is not kept when the device has explicitly opted out', async () => {
  // Photos default ON (2026-09-14): a device that never called /api/consent
  // would have its photo kept, so this test opts out first to exercise the
  // refusal path rather than a default that no longer applies to it.
  await postJson('/api/consent', { deviceId: 'p-9a-no', photos: false, location: false });
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-9a-no' });
  const { scanId } = (await res.json()) as { scanId: number };
  assert.equal(getScan(scanId)!.photo_path, null, 'a photograph was kept after an explicit opt-out');
});

test('a photo is kept for a device that never touched consent, because photos default on', async () => {
  useModel(answeringClient(READING));
  const res = await postPhoto({ deviceId: 'p-default-on' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.ok(row.photo_path, 'a photograph was not kept, though nobody opted out');
  assert.ok(photoExists(row.photo_path!), 'the row claims a file that is not on disk');
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
  useModel(cappedClient());
  const res = await postPhoto({ deviceId: 'p-cap' });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { failure: string; categoryWhy: string; scanId: number };
  assert.equal(seen.failure, 'spend_cap_reached');
  // Not flattened into the generic photo refusal on the way out. Taking the
  // photo again cannot work when the budget is spent, so the sentence that
  // says so has to survive this route.
  assert.equal(seen.categoryWhy, spendCapRefusalMessage());
  assert.ok(!/closer/i.test(seen.categoryWhy));
});

test('a capped scan records as capped, and is charged nothing', async () => {
  useModel(cappedClient());
  const res = await postPhoto({ deviceId: 'p-cap-row' });
  const { scanId } = (await res.json()) as { scanId: number };
  const row = getScan(scanId)!;
  assert.equal(row.outcome, 'refused');
  // The real class, not a generic refusal. A beta spent inside a cap must not
  // read back as a beta full of unreadable photographs.
  assert.equal(row.failure_class, 'spend_cap_reached');
  // Nothing reached the model, so nothing is recorded as spent. A 0 would be a
  // measurement; null is the absence of one.
  assert.equal(row.model_cost_cents, null);
});

test('the server writes a model_call event carrying the tier, the passes and the estimate', async () => {
  useModel(answeringClient(READING));
  await postPhoto({ deviceId: 'p-event' });
  const rows = readEvents({ deviceId: 'p-event' });
  const call = rows.find((r) => r.type === 'model_call');
  assert.ok(call, 'no model_call event was written');
  const payload = JSON.parse(call!.payload!) as { tier: string; passes: number; costCents: number | null };
  assert.equal(payload.tier, 'basic');
  assert.equal(payload.passes, 1);
  assert.equal(payload.costCents, 0.23);
});

test('nothing in this file dropped a scan', () => {
  const store = openScanStore();
  assert.equal(store.dropped, 0, store.droppedWhy);
  assert.ok(allScans(store).length > 0);
});
