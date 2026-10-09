/**
 * Requirement 4.2 (docs/price-category-requirements-2026-10-01.md): keep every
 * captured price whole, unmatched and sale included; delete nothing; hold
 * outliers flagged. Pass when: 0 deletions; count in equals count stored.
 *
 * Plan Part 6, 4.2: append-only raw and observation tables, outliers flagged by
 * a robust score; fails when the count stored differs from the count in, or any
 * delete; shows in the per-batch reconciliation ledger.
 *
 * The `observation` table itself keeps its columns, key and meaning, because
 * five readers outside this package read it. Keeping everything is additive:
 * every version a writer ever puts in `observation` is copied into the
 * append-only `observation_log` by triggers, a delete is recorded there and
 * reported, and a batch reconciles what it was offered against what the log
 * received. Every test here was run on the code before the build and went red
 * there; each block carries a known-good control and a known-bad one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { attachCode, openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import * as intake from '../src/intake.ts';

const DAY = '2026-10-09';

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: '0068100084245',
    seller: 'toy-market',
    sellerSku: 'sku-1',
    sellerName: 'Kraft Smooth Peanut Butter 1 kg',
    sellerBrand: 'Kraft',
    priceCents: 597,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'Ontario',
    joinMethod: 'gtin',
    seenOn: DAY,
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: 'Toy Market Kingston',
    storeCity: 'Kingston',
    storeOsm: null,
    ...over,
  };
}

function logFor(db: DatabaseSync, sku: string): { event: string; price_cents: number; code: string | null }[] {
  return db
    .prepare('SELECT event, price_cents, code FROM observation_log WHERE seller_sku = ? ORDER BY log_id')
    .all(sku) as unknown as { event: string; price_cents: number; code: string | null }[];
}

/* ------------------------------------------------ every version is kept */

test('4.2 a re-crawl of the same key keeps the earlier price in the log; observation still serves the latest', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ priceCents: 597 }));
  recordObservation(db, row({ priceCents: 449, kind: 'promotional' }));
  // Readers are unchanged: one current row per key, the latest one.
  const cur = db.prepare('SELECT price_cents, kind FROM observation').all() as unknown as { price_cents: number; kind: string }[];
  assert.deepEqual(cur.map((r) => [r.price_cents, r.kind]), [[449, 'promotional']]);
  // Nothing captured is lost: both versions are in the log, sale included.
  assert.deepEqual(logFor(db, 'sku-1').map((r) => r.price_cents), [597, 449]);
});

test('4.2 an unjoined row is kept whole, and a later code attach is a new version, not an edit', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ code: null, joinMethod: 'none', sellerSku: 'u-1', pageGtin: '068100084245' }));
  assert.equal(attachCode(db, { seller: 'toy-market', sellerSku: 'u-1', seenOn: DAY }, '0068100084245', 'gtin'), true);
  const versions = logFor(db, 'u-1');
  assert.deepEqual(versions.map((v) => v.code), [null, '0068100084245'], 'the unjoined version survives the join');
});

test('4.2 the log itself refuses UPDATE and DELETE (known-bad writes must throw)', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  assert.throws(() => db.exec('UPDATE observation_log SET price_cents = 1'), /append-only/);
  assert.throws(() => db.exec('DELETE FROM observation_log'), /append-only/);
  assert.equal(logFor(db, 'sku-1').length, 1);
});

/* ------------------------------------------------------- 0 deletions */

test('4.2 control: a database with no deletes passes the nothing-lost check', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  recordObservation(db, row({ sellerSku: 'sku-2' }));
  const r = intake.assertNothingLost(db);
  assert.equal(r.deletions, 0);
  assert.equal(r.currentRows, 2);
});

test('4.2 known-bad: a raw DELETE on observation is recorded, the row survives in the log, and the check fails loudly', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ priceCents: 597 }));
  recordObservation(db, row({ sellerSku: 'sku-2' }));
  db.exec("DELETE FROM observation WHERE seller_sku = 'sku-1'");
  assert.equal(logFor(db, 'sku-1').at(-1)!.event, 'delete');
  assert.equal(logFor(db, 'sku-1')[0]!.price_cents, 597, 'the deleted price is still held');
  assert.throws(() => intake.assertNothingLost(db), (e: Error) => /1 deletion/.test(e.message) && /sku-1/.test(e.message));
});

test('4.2 rows written before the log existed are copied in once, on open, and never twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-keep-legacy-'));
  const path = join(dir, 'prices.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE observation (
      code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
      seller_brand TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL,
      unit_price_cents INTEGER, unit_label TEXT, currency TEXT NOT NULL, country TEXT NOT NULL,
      region TEXT, join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, image_url TEXT,
      in_stock INTEGER, store_name TEXT, store_city TEXT, store_osm TEXT,
      PRIMARY KEY (seller, seller_sku, seen_on));
    INSERT INTO observation (code, seller, seller_sku, seller_name, price_cents, kind, currency, country, join_method, seen_on)
    VALUES ('0068100084245','Walmart','old-1','Kraft',500,'regular','CAD','CA','gtin','2026-09-09'),
           (NULL,'Walmart','old-2','Mystery',250,'regular','CAD','CA','none','2026-09-09');`);
  old.close();
  const db = openPrices(path);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM observation_log WHERE event = 'baseline'").get() as { n: number }).n, 2);
  db.close();
  const again = openPrices(path);
  assert.equal((again.prepare('SELECT COUNT(*) n FROM observation_log').get() as { n: number }).n, 2, 'a second open copies nothing');
  assert.equal(intake.assertNothingLost(again).deletions, 0);
  again.close();
});

test('4.2 a column added to observation later is carried into the log, not silently dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-keep-drift-'));
  const path = join(dir, 'prices.db');
  const db = openPrices(path);
  db.exec('ALTER TABLE observation ADD COLUMN future_col TEXT');
  db.close();
  const re = openPrices(path);
  re.exec(`INSERT INTO observation (code, seller, seller_sku, seller_name, price_cents, kind, currency, country, join_method, seen_on, future_col)
           VALUES ('1','toy-market','f-1','n',100,'regular','CAD','CA','gtin','${DAY}','kept')`);
  const got = re.prepare("SELECT future_col FROM observation_log WHERE seller_sku = 'f-1'").get() as { future_col: string };
  assert.equal(got.future_col, 'kept');
  re.close();
});

/* ------------------------------------------ count in equals count stored */

test('4.2 control: a batch that stores every row it was offered closes clean and is on the ledger', () => {
  const db = openPrices(':memory:');
  const b = intake.openBatch(db, 'toy-market', intake.ALL_WHEN_KNOWN);
  for (const sku of ['a', 'b', 'c']) {
    const r = row({ sellerSku: sku });
    intake.offer(b, r);
    intake.storeInBatch(db, b, r);
  }
  const s = intake.closeBatch(db, b);
  assert.deepEqual([s.offered, s.stored, s.status], [3, 3, 'ok']);
  const ledger = db.prepare('SELECT offered, stored, status FROM intake_batch_close WHERE batch_id = ?').get(b.id) as Record<string, unknown>;
  assert.deepEqual([ledger.offered, ledger.stored, ledger.status], [3, 3, 'ok']);
});

test('4.2 known-bad: a reader that drops a row it was offered fails the batch loudly, with counts and the missing key', () => {
  const db = openPrices(':memory:');
  const b = intake.openBatch(db, 'toy-market', intake.ALL_WHEN_KNOWN);
  for (const sku of ['a', 'b', 'c']) intake.offer(b, row({ sellerSku: sku }));
  intake.storeInBatch(db, b, row({ sellerSku: 'a' }));
  intake.storeInBatch(db, b, row({ sellerSku: 'c' }));
  assert.throws(
    () => intake.closeBatch(db, b),
    (e: Error) => e instanceof intake.IntakeMismatchError && /offered 3, stored 2/.test(e.message) && /toy-market\|b\|/.test(e.message),
  );
  // The mismatch is on the ledger before the throw, so it outlives the process.
  const ledger = db.prepare('SELECT offered, stored, status FROM intake_batch_close WHERE batch_id = ?').get(b.id) as Record<string, unknown>;
  assert.deepEqual([ledger.offered, ledger.stored, ledger.status], [3, 2, 'mismatch']);
});

test('4.2 two prices for one key in one batch: count in 2, count stored 2 (the log keeps both)', () => {
  const db = openPrices(':memory:');
  const b = intake.openBatch(db, 'toy-market', intake.ALL_WHEN_KNOWN);
  for (const p of [597, 449]) {
    const r = row({ priceCents: p });
    intake.offer(b, r);
    intake.storeInBatch(db, b, r);
  }
  const s = intake.closeBatch(db, b);
  assert.deepEqual([s.offered, s.stored], [2, 2]);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 1);
});

test('4.2 known-bad: a delete during a batch fails the batch even when the counts agree', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ sellerSku: 'earlier' }));
  const b = intake.openBatch(db, 'toy-market', intake.ALL_WHEN_KNOWN);
  const r = row({ sellerSku: 'a' });
  intake.offer(b, r);
  intake.storeInBatch(db, b, r);
  db.exec("DELETE FROM observation WHERE seller_sku = 'earlier'");
  assert.throws(() => intake.closeBatch(db, b), /1 deletion/);
});

test('4.2 the ledger is append-only', () => {
  const db = openPrices(':memory:');
  const b = intake.openBatch(db, 'toy-market', intake.ALL_WHEN_KNOWN);
  intake.closeBatch(db, b);
  assert.throws(() => db.exec("UPDATE intake_batch_close SET status = 'ok'"), /append-only/);
  assert.throws(() => db.exec('DELETE FROM intake_batch'), /append-only/);
});

/* --------------------------------------------- outliers flagged, not dropped */

test('4.2 outliers: a 10x price is flagged by a robust score and its row is still served; normal prices are not flagged', () => {
  const db = openPrices(':memory:');
  const prices = [500, 510, 495, 505, 498, 5000];
  prices.forEach((p, i) => recordObservation(db, row({ sellerSku: `o-${i}`, priceCents: p })));
  const flags = intake.flagOutliers(db, { on: DAY });
  assert.deepEqual(flags.map((f) => f.priceCents), [5000]);
  assert.ok(flags[0]!.score > 3.5);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 6, 'flagged, never dropped');
  const held = db.prepare('SELECT price_cents FROM observation_outlier').all() as unknown as { price_cents: number }[];
  assert.deepEqual(held.map((h) => h.price_cents), [5000]);
});

test('4.2 outliers control: too few prices to judge flags nothing; identical prices with one stray still flag the stray', () => {
  const db = openPrices(':memory:');
  [500, 5000].forEach((p, i) => recordObservation(db, row({ code: '1111111111111', sellerSku: `few-${i}`, priceCents: p })));
  [500, 500, 500, 500, 900].forEach((p, i) => recordObservation(db, row({ code: '2222222222222', sellerSku: `flat-${i}`, priceCents: p })));
  const flags = intake.flagOutliers(db, { on: DAY });
  assert.deepEqual(flags.map((f) => [f.itemKey, f.priceCents]), [['2222222222222', 900]]);
});

test('4.2 outliers known-bad: a zero or negative price is flagged, not scored and not dropped', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ sellerSku: 'zero', priceCents: 0 }));
  const flags = intake.flagOutliers(db, { on: DAY });
  assert.deepEqual(flags.map((f) => [f.sellerSku, f.reason]), [['zero', 'nonpositive_price']]);
});

test('4.2 a re-crawl never deletes the row it updates, even on a connection with recursive triggers on', () => {
  // INSERT OR REPLACE deletes the old row to make room; SQLite fires the delete
  // trigger for that only when recursive_triggers is on. Turning it on makes a
  // replace-style write visible as a delete, and the upsert must show none.
  const db = openPrices(':memory:');
  db.exec('PRAGMA recursive_triggers = ON');
  recordObservation(db, row({ priceCents: 597 }));
  recordObservation(db, row({ priceCents: 449 }));
  assert.deepEqual(logFor(db, 'sku-1').map((r) => r.event), ['insert', 'update']);
  assert.equal(intake.assertNothingLost(db).deletions, 0);
});

test('4.2 outliers: a 2% price wobble among identical prices is not an outlier (found on the real data, 2026-10-09)', async () => {
  // On a copy of price/data/prices.db, the MAD-is-zero fallback flagged $10.79
  // against a $10.99 median at z 4.8: with most prices identical, any change
  // scores high. The scale has a floor, the same one estimate.ts puts under
  // every spread, so only a move of roughly a fifth or more can be flagged.
  const { MIN_SIGMA } = await import('../src/estimate.ts');
  assert.equal(intake.OUTLIER_MIN_SCALE, MIN_SIGMA);
  const db = openPrices(':memory:');
  [1099, 1099, 1099, 1099, 1099, 1079].forEach((p, i) => recordObservation(db, row({ sellerSku: `w-${i}`, priceCents: p })));
  assert.deepEqual(intake.flagOutliers(db, { on: DAY }), []);
});
