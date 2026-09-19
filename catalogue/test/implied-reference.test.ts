/**
 * Audit rows 21 and 39, catalogue side.
 *
 * Row 21: what users' own ratings say about the shelf prices they typed, for a product with
 * at least 5 rated scans from at least 3 devices, stored as an `implied_reference` row marked
 * user-derived and untrusted. It reads ONLY the person's rating (a thumb, up or down) and the
 * price they typed, never Gemini's zone or verdict. Row 39: the offers and reviews Gemini
 * returned are kept with the entry.
 *
 * Fixtures are built through `recordUserScan`, the same door the server uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createUserCatalogue, recordUserScan, type UserCatalogue, type UserScanInput } from '../src/user-catalogue.ts';
import {
  MIN_DEVICES,
  MIN_RATED_SCANS,
  computeImpliedReferences,
  impliedReferences,
  median,
  readStandingRatings,
  type StandingRating,
} from '../src/implied-reference.ts';

const fresh = (): UserCatalogue => createUserCatalogue(':memory:');
const CA = { country: 'CA', region: null, currency: 'CAD', name: 'Canada' } as never;
const US = { country: 'US', region: null, currency: 'USD', name: 'United States' } as never;

function scan(uc: UserCatalogue, over: UserScanInput): void {
  const r = recordUserScan({ gtin: '0068100084245', name: 'Kraft Dinner Original', brand: 'Kraft', quantity: '225 g', market: CA, ...over }, { log: uc });
  assert.notEqual(r.outcome, 'dropped', r.reason ?? '');
}

let nextScan = 1;
/** One scan at a typed price, and the standing rating its person gave it (none when `rating` is null). */
function rated(
  uc: UserCatalogue,
  ratings: StandingRating[],
  o: { deviceId: string; priceCents: number; rating: 'up' | 'down' | null; reason?: string | null; market?: unknown },
): void {
  const scanId = String(nextScan++);
  scan(uc, { deviceId: o.deviceId, priceCents: o.priceCents, scanId, market: (o.market ?? CA) as never });
  if (o.rating) ratings.push({ scanId, deviceId: o.deviceId, rating: o.rating, reason: o.reason ?? null });
}

/**
 * Five rated scans from three devices: thumbs-up at 200 and 300, thumbs-down at 500 (wrong
 * product), 600 (wrong price) and 400 (no reason).
 */
function fiveFromThree(uc: UserCatalogue, ratings: StandingRating[], market: unknown = CA): void {
  rated(uc, ratings, { deviceId: 'd1', priceCents: 200, rating: 'up', market });
  rated(uc, ratings, { deviceId: 'd2', priceCents: 300, rating: 'up', market });
  rated(uc, ratings, { deviceId: 'd3', priceCents: 500, rating: 'down', reason: 'wrong_product', market });
  rated(uc, ratings, { deviceId: 'd1', priceCents: 600, rating: 'down', reason: 'wrong_price', market });
  rated(uc, ratings, { deviceId: 'd2', priceCents: 400, rating: 'down', market });
}

test('the bar is 5 rated scans and 3 devices', () => {
  assert.equal(MIN_RATED_SCANS, 5);
  assert.equal(MIN_DEVICES, 3);
});

test('five rated scans from three devices give the median typed price on thumbs-up scans', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  fiveFromThree(uc, ratings);
  const result = computeImpliedReferences(uc, ratings);
  assert.equal(result.error, null);
  assert.equal(result.written.length, 1);
  const [row] = impliedReferences(uc);
  assert.equal(row.upMedianCents, 250, 'the median of 200 and 300, the two thumbs-up prices');
  assert.equal(row.upScans, 2);
  assert.equal(row.downScans, 3);
  assert.equal(row.wrongProductScans, 1, 'only the thumbs-down whose reason was wrong product');
  assert.equal(row.ratedScans, 5);
  assert.equal(row.devices, 3);
});

test('it is not circular: what Gemini said about a scan never changes the number', () => {
  // Same five rated scans twice. In the second, every scan also carries a Gemini "verdict"
  // (a zone read back through the user's lines) that DISAGREES with the person's own thumb:
  // Gemini says 'bad' on the two scans they thumbed up and 'good' on the three they thumbed down.
  // Built the way the first version was fed, through the legacy columns that used to hold it.
  const plain = fresh();
  const plainRatings: StandingRating[] = [];
  fiveFromThree(plain, plainRatings);
  const withZone = fresh();
  const zoneRatings: StandingRating[] = [];
  fiveFromThree(withZone, zoneRatings);
  const setZone = withZone.db!.prepare('UPDATE user_observation SET verdict = ?, verdict_source = ? WHERE price_cents = ?');
  for (const cents of [200, 300]) setZone.run('bad', 'zone', cents);
  for (const cents of [500, 600, 400]) setZone.run('good', 'zone', cents);
  // The old reading of the zone would have made the "good" median the median of 400, 500 and
  // 600, which is 500. The person's thumbs-up prices are 200 and 300: 250.
  computeImpliedReferences(plain, plainRatings);
  computeImpliedReferences(withZone, zoneRatings);
  const [a] = impliedReferences(plain);
  const [b] = impliedReferences(withZone);
  assert.equal(b.upMedianCents, 250, "Gemini's zone leaked into the median");
  assert.deepEqual(b, { ...a, ref: b.ref }, "Gemini's zone changed the row");
  assert.notEqual(b.upMedianCents, 500, 'the circular reading is what the old code produced');
});

test('a scan nobody rated is not a rated scan, whatever its price', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  fiveFromThree(uc, ratings);
  rated(uc, ratings, { deviceId: 'd4', priceCents: 250, rating: null });
  rated(uc, ratings, { deviceId: 'd5', priceCents: 260, rating: null });
  const [row] = computeImpliedReferences(uc, ratings).written;
  assert.equal(row.ratedScans, 5);
  assert.equal(row.devices, 3, 'unrated scans add neither a rated scan nor a device');
});

test('a rating with no typed price does not count', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  fiveFromThree(uc, ratings);
  const scanId = String(nextScan++);
  scan(uc, { deviceId: 'd6', scanId }); // no price typed
  ratings.push({ scanId, deviceId: 'd6', rating: 'up', reason: null });
  const [row] = computeImpliedReferences(uc, ratings).written;
  assert.equal(row.ratedScans, 5);
  assert.equal(row.devices, 3);
});

test('devices are counted from the device that gave the rating', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  // Six scans all made on one phone, rated by three different people: three devices rated.
  for (let i = 0; i < 6; i += 1) {
    const scanId = String(nextScan++);
    scan(uc, { deviceId: 'scanner', priceCents: 200 + i, scanId });
    ratings.push({ scanId, deviceId: `rater${i % 3}`, rating: 'up', reason: null });
  }
  const [row] = computeImpliedReferences(uc, ratings).written;
  assert.equal(row.devices, 3);
});

test('four rated scans is too thin, and so is five from two devices', () => {
  const four = fresh();
  const r4ratings: StandingRating[] = [];
  rated(four, r4ratings, { deviceId: 'd1', priceCents: 200, rating: 'up' });
  rated(four, r4ratings, { deviceId: 'd2', priceCents: 300, rating: 'up' });
  rated(four, r4ratings, { deviceId: 'd3', priceCents: 500, rating: 'down' });
  rated(four, r4ratings, { deviceId: 'd3', priceCents: 600, rating: 'down' });
  const r4 = computeImpliedReferences(four, r4ratings);
  assert.equal(r4.written.length, 0);
  assert.equal(r4.tooThin, 1);
  assert.equal(impliedReferences(four).length, 0);

  const twoDevices = fresh();
  const twoRatings: StandingRating[] = [];
  for (let i = 0; i < 6; i += 1) rated(twoDevices, twoRatings, { deviceId: i % 2 === 0 ? 'a' : 'b', priceCents: 200 + i, rating: 'up' });
  assert.equal(computeImpliedReferences(twoDevices, twoRatings).written.length, 0, 'six scans from two devices is not enough');
});

test('a group with no thumbs-up has no median, and says so', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  for (let i = 0; i < 5; i += 1) rated(uc, ratings, { deviceId: `d${i}`, priceCents: 300 + i, rating: 'down', reason: 'too_slow' });
  const [row] = computeImpliedReferences(uc, ratings).written;
  assert.equal(row.upMedianCents, null);
  assert.equal(row.upScans, 0);
  assert.equal(row.downScans, 5);
});

test('prices in different countries or currencies are never blended', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  fiveFromThree(uc, ratings, CA);
  fiveFromThree(uc, ratings, US);
  const written = computeImpliedReferences(uc, ratings).written;
  assert.equal(written.length, 2);
  assert.deepEqual(written.map((w) => w.country).sort(), ['CA', 'US']);
  assert.ok(written.every((w) => w.ratedScans === 5), 'the two countries were pooled');
});

test('the row is marked user-derived and untrusted, and it is recomputed rather than accumulated', () => {
  const uc = fresh();
  const ratings: StandingRating[] = [];
  fiveFromThree(uc, ratings);
  computeImpliedReferences(uc, ratings);
  computeImpliedReferences(uc, ratings);
  const raw = uc.db!.prepare('SELECT source, trusted FROM implied_reference').all() as unknown as { source: string; trusted: number }[];
  assert.equal(raw.length, 1, 'a second run added a second row instead of recomputing');
  assert.equal(raw[0].source, 'user_derived');
  assert.equal(raw[0].trusted, 0);
});

test('the device id is stored only as a one-way key', () => {
  const uc = fresh();
  scan(uc, { deviceId: 'my-secret-device-id', priceCents: 200 });
  const keys = uc.db!.prepare('SELECT device_key FROM user_observation').all() as unknown as { device_key: string }[];
  assert.equal(keys.length, 1);
  assert.notEqual(keys[0].device_key, 'my-secret-device-id');
  assert.match(keys[0].device_key, /^[0-9a-f]{16}$/);
});

test('the standing ratings are read from the scan store (an undo deletes the standing row)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-ratings-'));
  try {
    const path = join(dir, 'scans.db');
    const db = new DatabaseSync(path);
    // The shape migration 3 gives scan_rating: one standing row per scan; an undo deletes it.
    db.exec('CREATE TABLE scan_rating (scan_id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, rating TEXT NOT NULL, reason TEXT, rated_at TEXT NOT NULL)');
    const put = db.prepare('INSERT INTO scan_rating (scan_id, device_id, rating, reason, rated_at) VALUES (?,?,?,?,?)');
    put.run(7, 'devA', 'up', null, '2026-09-19T00:00:00Z');
    put.run(8, 'devB', 'down', 'wrong_product', '2026-09-19T00:00:00Z');
    db.close();
    const read = readStandingRatings(path);
    assert.equal(read.error, null);
    assert.deepEqual(
      read.ratings.map((r) => [r.scanId, r.deviceId, r.rating, r.reason]),
      [['7', 'devA', 'up', null], ['8', 'devB', 'down', 'wrong_product']],
    );
    assert.ok(readStandingRatings(join(dir, 'missing.db')).error, 'a store that is not there is a returned error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file with the first-shape implied_reference table is rebuilt in the new shape at open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-uc-'));
  try {
    const path = join(dir, 'user-catalogue.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE implied_reference (ref TEXT NOT NULL, country TEXT NOT NULL, currency TEXT NOT NULL, rated_scans INTEGER NOT NULL,
      devices INTEGER NOT NULL, good_median_cents REAL, good_scans INTEGER NOT NULL, bad_median_cents REAL, bad_scans INTEGER NOT NULL,
      zone_verdict_scans INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'user_derived', trusted INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL, PRIMARY KEY (ref, country, currency)) STRICT`);
    old.close();
    const uc = createUserCatalogue(path);
    assert.ok(uc.db, uc.droppedWhy);
    const cols = (uc.db!.prepare('PRAGMA table_info(implied_reference)').all() as unknown as { name: string }[]).map((c) => c.name);
    assert.ok(cols.includes('up_median_cents') && !cols.includes('good_median_cents') && !cols.includes('zone_verdict_scans'), cols.join());
    uc.db!.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('an unopened catalogue is a returned error, never a throw', () => {
  const closed: UserCatalogue = { path: 'x', db: null, dropped: 0, droppedWhy: 'not open' };
  const result = computeImpliedReferences(closed, []);
  assert.equal(result.error, 'not open');
  assert.deepEqual(result.written, []);
});

test('row 39: offers and reviews are kept untrusted with the scan id, and an entry without them is unchanged', () => {
  const uc = fresh();
  scan(uc, {
    scanId: '42',
    priceCents: 350,
    offers: [
      { retailer: 'Shop A', price: 3.49, unitPrice: 1.55, inMedian: true, raw: { retailer: 'Shop A', price: 3.49 } },
      { retailer: 'Shop B', price: 4.1, unitPrice: 1.82, inMedian: false, raw: { retailer: 'Shop B' } },
    ],
    reviews: [{ rating: 4.5, count: 120, summary: 'Liked.', url: 'https://example.com/r' }],
  });
  const offers = uc.db!.prepare('SELECT * FROM user_offer ORDER BY id').all() as unknown as Record<string, unknown>[];
  const reviews = uc.db!.prepare('SELECT * FROM user_review').all() as unknown as Record<string, unknown>[];
  assert.equal(offers.length, 2);
  assert.equal(offers[0].scan_id, '42');
  assert.equal(offers[0].trusted, 0);
  assert.equal(offers[0].retailer, 'Shop A');
  assert.equal(offers[0].in_median, 1);
  assert.equal(offers[1].in_median, 0);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].scan_id, '42');
  assert.equal(reviews[0].trusted, 0);
  assert.equal(reviews[0].review_count, 120);

  const plain = fresh();
  scan(plain, { scanId: '43', priceCents: 350 });
  assert.equal((plain.db!.prepare('SELECT COUNT(*) AS n FROM user_offer').get() as { n: number }).n, 0);
  assert.equal((plain.db!.prepare('SELECT COUNT(*) AS n FROM user_observation').get() as { n: number }).n, 1);
});

test('row 39: a file made before the new columns and tables gets them at open', () => {
  const uc = fresh();
  const cols = (uc.db!.prepare('PRAGMA table_info(user_observation)').all() as unknown as { name: string }[]).map((c) => c.name);
  for (const c of ['device_key', 'verdict', 'verdict_source']) assert.ok(cols.includes(c), `${c} missing`);
});
