/**
 * Audit rows 21 and 39, catalogue side.
 *
 * Row 21: a median back-computed from users' own verdicts, for a product with at least 5
 * rated scans from at least 3 devices: the median shelf price among scans rated good or
 * great, and among scans rated bad, stored as an `implied_reference` row marked user-derived
 * and untrusted. Row 39: the offers and reviews Gemini returned are kept with the entry.
 *
 * Fixtures are built through `recordUserScan`, the same door the server uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserCatalogue, recordUserScan, type UserCatalogue, type UserScanInput } from '../src/user-catalogue.ts';
import {
  MIN_DEVICES,
  MIN_RATED_SCANS,
  computeImpliedReferences,
  impliedReferences,
  median,
  verdictFromZone,
} from '../src/implied-reference.ts';

const fresh = (): UserCatalogue => createUserCatalogue(':memory:');
const CA = { country: 'CA', region: null, currency: 'CAD', name: 'Canada' } as never;
const US = { country: 'US', region: null, currency: 'USD', name: 'United States' } as never;

function scan(uc: UserCatalogue, over: UserScanInput): void {
  const r = recordUserScan({ gtin: '0068100084245', name: 'Kraft Dinner Original', brand: 'Kraft', quantity: '225 g', market: CA, ...over }, { log: uc });
  assert.notEqual(r.outcome, 'dropped', r.reason ?? '');
}

/** Five rated scans from three devices: good at 200 and 300, bad at 500 and 600, fair at 400. */
function fiveFromThree(uc: UserCatalogue, market = CA): void {
  scan(uc, { deviceId: 'd1', priceCents: 200, verdict: 'good', verdictSource: 'zone', market });
  scan(uc, { deviceId: 'd2', priceCents: 300, verdict: 'great', verdictSource: 'user', market });
  scan(uc, { deviceId: 'd3', priceCents: 500, verdict: 'bad', verdictSource: 'zone', market });
  scan(uc, { deviceId: 'd1', priceCents: 600, verdict: 'bad', verdictSource: 'zone', market });
  scan(uc, { deviceId: 'd2', priceCents: 400, verdict: 'fair', verdictSource: 'zone', market });
}

test('the bar is 5 rated scans and 3 devices', () => {
  assert.equal(MIN_RATED_SCANS, 5);
  assert.equal(MIN_DEVICES, 3);
});

test('five rated scans from three devices give the good/great median and the bad median', () => {
  const uc = fresh();
  fiveFromThree(uc);
  const result = computeImpliedReferences(uc);
  assert.equal(result.error, null);
  assert.equal(result.written.length, 1);
  const [row] = impliedReferences(uc);
  assert.equal(row.goodMedianCents, 250, 'the median of 200 and 300');
  assert.equal(row.goodScans, 2);
  assert.equal(row.badMedianCents, 550, 'the median of 500 and 600');
  assert.equal(row.badScans, 2);
  assert.equal(row.ratedScans, 5, 'a fair verdict counts toward the bar and toward neither median');
  assert.equal(row.devices, 3);
  assert.equal(row.zoneVerdictScans, 4, 'how many verdicts were Gemini zone placements is kept on the row');
});

test('four rated scans is too thin, and so is five from two devices', () => {
  const four = fresh();
  scan(four, { deviceId: 'd1', priceCents: 200, verdict: 'good' });
  scan(four, { deviceId: 'd2', priceCents: 300, verdict: 'good' });
  scan(four, { deviceId: 'd3', priceCents: 500, verdict: 'bad' });
  scan(four, { deviceId: 'd3', priceCents: 600, verdict: 'bad' });
  const r4 = computeImpliedReferences(four);
  assert.equal(r4.written.length, 0);
  assert.equal(r4.tooThin, 1);
  assert.equal(impliedReferences(four).length, 0);

  const twoDevices = fresh();
  for (let i = 0; i < 6; i += 1) scan(twoDevices, { deviceId: i % 2 === 0 ? 'a' : 'b', priceCents: 200 + i, verdict: 'good' });
  assert.equal(computeImpliedReferences(twoDevices).written.length, 0, 'six scans from two devices is not enough');
});

test('scans with no verdict or no price never count toward the bar', () => {
  const uc = fresh();
  fiveFromThree(uc);
  // Two more that must not count: no verdict, and a verdict with no price.
  scan(uc, { deviceId: 'd4', priceCents: 250 });
  scan(uc, { deviceId: 'd5', verdict: 'good' });
  const [row] = computeImpliedReferences(uc).written;
  assert.equal(row.ratedScans, 5);
  assert.equal(row.devices, 3);
});

test('prices in different countries or currencies are never blended', () => {
  const uc = fresh();
  fiveFromThree(uc, CA);
  fiveFromThree(uc, US);
  const written = computeImpliedReferences(uc).written;
  assert.equal(written.length, 2);
  assert.deepEqual(written.map((w) => w.country).sort(), ['CA', 'US']);
  assert.ok(written.every((w) => w.ratedScans === 5), 'the two countries were pooled');
});

test('the row is marked user-derived and untrusted, and it is recomputed rather than accumulated', () => {
  const uc = fresh();
  fiveFromThree(uc);
  computeImpliedReferences(uc);
  computeImpliedReferences(uc);
  const raw = uc.db!.prepare('SELECT source, trusted FROM implied_reference').all() as unknown as { source: string; trusted: number }[];
  assert.equal(raw.length, 1, 'a second run added a second row instead of recomputing');
  assert.equal(raw[0].source, 'user_derived');
  assert.equal(raw[0].trusted, 0);
});

test('the device id is stored only as a one-way key', () => {
  const uc = fresh();
  scan(uc, { deviceId: 'my-secret-device-id', priceCents: 200, verdict: 'good' });
  const keys = uc.db!.prepare('SELECT device_key FROM user_observation').all() as unknown as { device_key: string }[];
  assert.equal(keys.length, 1);
  assert.notEqual(keys[0].device_key, 'my-secret-device-id');
  assert.match(keys[0].device_key, /^[0-9a-f]{16}$/);
});

test('median and the zone reading', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(verdictFromZone('under_your_line'), 'good');
  assert.equal(verdictFromZone('middle'), 'fair');
  assert.equal(verdictFromZone('over_your_line'), 'bad');
  assert.equal(verdictFromZone(null), null);
  assert.equal(verdictFromZone('nonsense'), null);
});

test('an unopened catalogue is a returned error, never a throw', () => {
  const closed: UserCatalogue = { path: 'x', db: null, dropped: 0, droppedWhy: 'not open' };
  const result = computeImpliedReferences(closed);
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
