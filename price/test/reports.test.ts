/**
 * Unit F, shopper reports. The headline is the plan's done-when: 15 planted
 * fake devices cannot move any range. Every database here is in memory or in a
 * fresh temp folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  allCorrections,
  openCorrectionStore,
  recordCorrection,
  type CorrectionInput,
  type CorrectionStore,
} from '../src/corrections.ts';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { priceRangeFor, type RangeResult } from '../src/range.ts';
import {
  accountWeights,
  anchorsFromPrices,
  isoWeek,
  measureAgreement,
  observationRowsFor,
  priorFromAgreement,
  reportPointsFor,
  ADMIT_WEIGHT,
  MIN_COMPARED_TO_SET_PRIOR,
} from '../src/reports.ts';

const AS_OF = '2026-09-27';
const CODE = '0068100084245';
const OTHER = '0060383689247';

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: CODE,
    seller: 'Walmart',
    sellerSku: 'sku',
    sellerName: 'Peanut Butter',
    sellerBrand: 'Kraft',
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

/** Five chains with a crawled regular price for CODE, and the same five for OTHER. */
const SHELF: readonly [string, number][] = [
  ['Walmart', 479],
  ['Loblaws', 529],
  ['Metro', 549],
  ['Sobeys', 579],
  ['FreshCo', 499],
];

function evidence(): DatabaseSync {
  const db = openPrices(':memory:');
  for (const [seller, cents] of SHELF) {
    recordObservation(db, obs({ seller, sellerSku: `${seller}-1`, priceCents: cents }));
    recordObservation(db, obs({ code: OTHER, seller, sellerSku: `${seller}-2`, priceCents: cents - 150 }));
  }
  return db;
}

let n = 0;
function report(over: Partial<CorrectionInput>): CorrectionInput {
  n += 1;
  return {
    clientId: `c-${n}`,
    deviceId: 'device-a',
    code: CODE,
    productId: null,
    label: 'Kraft Peanut Butter 1kg',
    category: 'grocery',
    seller: 'Metro',
    priceCents: 549,
    kind: 'regular',
    seenOn: '2026-09-20',
    capture: 'typed',
    ...over,
  };
}

function file(store: CorrectionStore, input: CorrectionInput): void {
  const r = recordCorrection(input);
  assert.ok(r.ok, r.ok ? '' : r.why);
  void store;
}

/**
 * Three honest testers who have each read the OTHER product's tag at the five
 * crawled chains in two separate weeks and got it right: ten verified
 * agreements each, so each carries real weight.
 */
function honestHistory(store: CorrectionStore): void {
  for (const device of ['tester-1', 'tester-2', 'tester-3']) {
    for (const seenOn of ['2026-09-14', '2026-09-21']) {
      for (const [seller, cents] of SHELF) {
        file(store, report({ deviceId: device, code: OTHER, label: 'Kraft Dinner', seller, priceCents: cents - 150, seenOn }));
      }
    }
  }
}

/** The range, computed the way a real caller would: crawled rows plus admitted report rows in one price handle. */
function rangeWith(store: CorrectionStore): { range: RangeResult; admitted: number } {
  const prices = evidence();
  const { points } = reportPointsFor(CODE, { corrections: store, prices }, AS_OF);
  for (const row of observationRowsFor(CODE, points)) recordObservation(prices, row);
  return { range: priceRangeFor({ barcode: CODE, asOf: AS_OF }, { prices }), admitted: points.length };
}

function summary(r: RangeResult): string {
  return r.basis === 'none' ? `none:${r.reason}` : `${r.basis} ${r.lowCents}-${r.highCents} median ${r.medianCents} n=${r.n}`;
}

const FAKES = Array.from({ length: 15 }, (_, i) => `fake-${i + 1}`);

const PATTERNS: readonly { name: string; cents: number }[] = [
  { name: 'far above', cents: 1999 },
  { name: 'far below', cents: 99 },
  { name: 'just above the range', cents: 599 },
  { name: 'just below the range', cents: 449 },
];

const PLACEMENTS: readonly { name: string; shop: (i: number) => string }[] = [
  { name: 'all at one shop with no crawled price', shop: () => 'Corner Grocer' },
  { name: 'one each at fifteen shops with no crawled price', shop: (i) => `Shop Number ${i}` },
  { name: 'at the crawled shops', shop: (i) => SHELF[i % SHELF.length]![0] },
];

test('15 planted fake devices cannot move the range, in any pattern or placement', () => {
  const baselineStore = openCorrectionStore(':memory:');
  honestHistory(baselineStore);
  const before = rangeWith(baselineStore);
  assert.equal(before.range.basis, 'this_product');
  assert.equal(before.admitted, 0);

  for (const pattern of PATTERNS) {
    for (const placement of PLACEMENTS) {
      const store = openCorrectionStore(':memory:');
      honestHistory(store);
      FAKES.forEach((device, i) => {
        // Each fake files every day of the week, and also agrees with every
        // other fake on OTHER, trying to vouch for each other.
        for (const seenOn of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']) {
          file(store, report({ deviceId: device, seller: placement.shop(i), priceCents: pattern.cents, seenOn }));
        }
        file(store, report({ deviceId: device, code: OTHER, label: 'x', seller: 'Corner Grocer', priceCents: 1, seenOn: '2026-09-22' }));
      });
      const after = rangeWith(store);
      assert.equal(summary(after.range), summary(before.range), `${pattern.name}, ${placement.name}`);
      assert.equal(after.admitted, 0, `${pattern.name}, ${placement.name}`);

      // At crawled shops a fake "just outside" can land inside the tag band of
      // that shop's own price and so earn weight: that report is true. It still
      // cannot move the range, because a crawled shop keeps its crawled price.
      if (placement.name !== 'at the crawled shops') {
        const weights = accountWeights(allCorrections(store), anchorsFromPrices(evidence(), [CODE, OTHER]));
        for (const device of FAKES) assert.equal(weights.get(device)?.weight, 0, device);
      }
    }
  }
  console.log(`  range before and after every planted pattern: ${summary(before.range)}`);
});

test('the pipe is real: two earned devices at an uncrawled shop do add a point', () => {
  const store = openCorrectionStore(':memory:');
  honestHistory(store);
  const before = rangeWith(store);
  for (const device of ['tester-1', 'tester-2']) {
    file(store, report({ deviceId: device, seller: 'Corner Grocer', priceCents: 519, seenOn: '2026-09-22' }));
  }
  const after = rangeWith(store);
  assert.equal(after.admitted, 1);
  assert.ok(after.range.basis === 'this_product' && before.range.basis === 'this_product');
  assert.equal(after.range.n, before.range.n + 1);
});

test('one counted report per device per product per shop per ISO week; every row stays stored', () => {
  const store = openCorrectionStore(':memory:');
  honestHistory(store);
  // Mon 2026-09-21 and Thu 2026-09-24 share ISO week 39; Mon 2026-09-28 is week 40.
  assert.equal(isoWeek('2026-09-21'), isoWeek('2026-09-24'));
  assert.notEqual(isoWeek('2026-09-24'), isoWeek('2026-09-28'));
  file(store, report({ deviceId: 'tester-1', seller: 'Corner Grocer', priceCents: 519, seenOn: '2026-09-21' }));
  file(store, report({ deviceId: 'tester-1', seller: 'Corner Grocer', priceCents: 529, seenOn: '2026-09-24' }));
  const { weighed } = reportPointsFor(CODE, { corrections: store, prices: evidence() }, AS_OF);
  const mine = weighed.filter((w) => w.deviceId === 'tester-1' && w.storeKey === 'cornergrocer');
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((w) => w.status).sort(), ['counted', 'superseded']);
  assert.equal(mine.find((w) => w.status === 'counted')!.cents, 529);
});

test('an outlier against neighbouring shops is held: kept, flagged, weight zero', () => {
  const store = openCorrectionStore(':memory:');
  honestHistory(store);
  file(store, report({ deviceId: 'tester-1', seller: 'Corner Grocer', priceCents: 1999, seenOn: '2026-09-22' }));
  file(store, report({ deviceId: 'tester-2', seller: 'Corner Grocer', priceCents: 1999, seenOn: '2026-09-22' }));
  const { weighed, points } = reportPointsFor(CODE, { corrections: store, prices: evidence() }, AS_OF);
  const held = weighed.filter((w) => w.status === 'held');
  assert.equal(held.length, 2);
  for (const h of held) {
    assert.equal(h.weight, 0);
    assert.equal(h.neighbours?.shops, 5);
    assert.equal(h.neighbours?.medianCents, 529);
  }
  assert.equal(points.length, 0);
  assert.equal(allCorrections(store).filter((r) => r.price_cents === 1999).length, 2);
});

test('an honest new device gains weight by agreeing with verified prices, and loses it by disagreeing', () => {
  const store = openCorrectionStore(':memory:');
  const anchors = anchorsFromPrices(evidence(), [CODE, OTHER]);
  file(store, report({ deviceId: 'newcomer', seller: 'Walmart', priceCents: 479, seenOn: '2026-09-21' }));
  const once = accountWeights(allCorrections(store), anchors).get('newcomer')!;
  for (const [seller, cents] of SHELF.slice(1)) {
    file(store, report({ deviceId: 'newcomer', seller, priceCents: cents, seenOn: '2026-09-21' }));
  }
  const five = accountWeights(allCorrections(store), anchors).get('newcomer')!;
  assert.ok(once.weight > 0);
  assert.ok(five.weight > once.weight);
  assert.equal(five.anchoredAgree, 5);

  const liar = openCorrectionStore(':memory:');
  for (const [seller] of SHELF) file(liar, report({ deviceId: 'wrong', seller, priceCents: 1999, seenOn: '2026-09-21' }));
  assert.equal(accountWeights(allCorrections(liar), anchors).get('wrong')!.weight, 0);

  const fresh = openCorrectionStore(':memory:');
  file(fresh, report({ deviceId: 'nobody-checked', seller: 'Corner Grocer', priceCents: 519 }));
  assert.equal(accountWeights(allCorrections(fresh), anchors).get('nobody-checked')!.weight, 0);
  assert.ok(ADMIT_WEIGHT > 0);
});

test('agreement with verified prices is measured, split by capture method', () => {
  const store = openCorrectionStore(':memory:');
  file(store, report({ deviceId: 'a', seller: 'Walmart', priceCents: 479, capture: 'photo' }));
  file(store, report({ deviceId: 'b', seller: 'Metro', priceCents: 549 }));
  file(store, report({ deviceId: 'c', seller: 'Sobeys', priceCents: 999 }));
  file(store, report({ deviceId: 'd', seller: 'Corner Grocer', priceCents: 519 }));
  const m = measureAgreement(allCorrections(store), anchorsFromPrices(evidence(), [CODE]));
  assert.equal(m.reports, 4);
  assert.equal(m.compared, 3);
  assert.equal(m.agreed, 2);
  assert.equal(m.disagreed, 1);
  assert.equal(m.rate, 2 / 3);
  assert.deepEqual(m.byCapture.photo, { compared: 1, agreed: 1 });
  assert.deepEqual(m.byCapture.typed, { compared: 2, agreed: 1 });
  assert.equal(priorFromAgreement(m).fromData, false);
  const plenty = { ...m, compared: MIN_COMPARED_TO_SET_PRIOR, agreed: 27, rate: 0.9 };
  const p = priorFromAgreement(plenty);
  assert.ok(p.fromData && Math.abs(p.alpha / (p.alpha + p.beta) - 0.9) < 1e-9);
});

test('rows filed before unit F survive the migration and read NULL for the new columns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-reports-'));
  try {
    const path = join(dir, 'corrections.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE correction (
      id INTEGER PRIMARY KEY, client_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
      subject TEXT NOT NULL, code TEXT, product_id TEXT, label TEXT, category TEXT,
      seller TEXT NOT NULL, seller_key TEXT NOT NULL, price_cents INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('regular', 'promotional')),
      seen_on TEXT NOT NULL, recorded_at TEXT NOT NULL) STRICT`);
    const ins = old.prepare(
      `INSERT INTO correction (client_id, device_id, subject, code, seller, seller_key, price_cents, kind, seen_on, recorded_at)
       VALUES (?, ?, ?, ?, 'Metro', 'metro', ?, 'regular', '2026-09-01', '2026-09-01T12:00:00.000Z')`,
    );
    ins.run('old-1', 'dev-1', `gtin:${CODE}`, CODE, 549);
    ins.run('old-2', 'dev-2', `gtin:${CODE}`, CODE, 559);
    old.close();

    const store = openCorrectionStore(path);
    assert.ok(store.db, store.droppedWhy);
    const rows = allCorrections(store);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => [r.client_id, r.price_cents, r.capture, r.seen_at]), [
      ['old-1', 549, null, null],
      ['old-2', 559, null, null],
    ]);
    const r = recordCorrection(report({ deviceId: 'dev-3', capture: 'photo', seenAt: '2026-09-20T15:04:00Z' }));
    assert.ok(r.ok);
    const fresh = allCorrections(store).find((x) => x.device_id === 'dev-3')!;
    assert.equal(fresh.capture, 'photo');
    assert.equal(fresh.seen_at, '2026-09-20T15:04:00Z');
    store.db!.close();
    // Opening again changes nothing.
    const again = openCorrectionStore(path);
    assert.equal(allCorrections(again).length, 3);
    again.db!.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a capture method that is neither photo nor typed is refused', () => {
  openCorrectionStore(':memory:');
  const r = recordCorrection(report({ capture: 'guessed' as unknown as 'photo' }));
  assert.equal(r.ok, false);
});
