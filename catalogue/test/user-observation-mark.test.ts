/**
 * Price-category plan 5.2: a typed shelf price becomes an observed price MARKED as a
 * shopper report, in every store it reaches. The identify routes reach
 * user_observation through recordUserScan (app/server.ts scheduleCatalogueFeed,
 * priceCents: a.shelfPriceCents), which stored the price with no mark at all.
 *
 * The mark is `capture`, the same column name and value the corrections store uses
 * (price/src/corrections.ts, capture 'typed'). The writer sets it; a caller cannot.
 *
 * Written before the column existed; every test here was red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createUserCatalogue, recordUserScan, type UserScanInput } from '../src/user-catalogue.ts';

const rows = (db: DatabaseSync) =>
  (db.prepare('SELECT price_cents, capture FROM user_observation ORDER BY id').all() as unknown as { price_cents: number | null; capture: string | null }[]).map((r) => ({ price_cents: r.price_cents, capture: r.capture }));

test('5.2 a typed shelf price is stored marked as a shopper report (capture = typed)', () => {
  const uc = createUserCatalogue(':memory:');
  recordUserScan({ gtin: '0123456789012', name: 'Maple Sauce', priceCents: 499 }, { log: uc });
  assert.deepEqual(rows(uc.db!), [{ price_cents: 499, capture: 'typed' }]);
});

test('5.2 a scan with no price carries no mark (nothing was reported)', () => {
  const uc = createUserCatalogue(':memory:');
  recordUserScan({ gtin: '0123456789012', name: 'Maple Sauce' }, { log: uc });
  assert.deepEqual(rows(uc.db!), [{ price_cents: null, capture: null }]);
});

test('5.2 the mark is set by the writer, never by a caller: a claimed source is ignored', () => {
  const uc = createUserCatalogue(':memory:');
  const claim = { gtin: '0123456789012', name: 'Maple Sauce', priceCents: 499, capture: 'photo', shopperReport: false } as unknown as UserScanInput;
  recordUserScan(claim, { log: uc });
  assert.deepEqual(rows(uc.db!), [{ price_cents: 499, capture: 'typed' }]);
});

test('5.2 the database refuses a priced row with no mark, a mark on an unpriced row, and an unknown mark', () => {
  const uc = createUserCatalogue(':memory:');
  const db = uc.db!;
  const ins = (price: number | null, capture: string | null) =>
    db.prepare(`INSERT INTO user_observation (store_type, observed_at, price_cents, capture) VALUES ('supermarket', '2026-10-09', ?, ?)`).run(price, capture);
  assert.throws(() => ins(499, null), /shopper report/);
  assert.throws(() => ins(null, 'typed'), /shopper report/);
  assert.throws(() => ins(499, 'photo'), /shopper report/);
  ins(499, 'typed');
  ins(null, null);
  assert.throws(() => db.exec(`UPDATE user_observation SET capture = NULL WHERE price_cents IS NOT NULL`), /shopper report/);
});

test('5.2 an existing user catalogue gets the column on open, and its stored typed prices are marked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-mark-'));
  try {
    const path = join(dir, 'user-catalogue.db');
    const old = new DatabaseSync(path);
    // The table as it was before the mark: no capture column.
    old.exec(`CREATE TABLE user_observation (
      id INTEGER PRIMARY KEY, product_id INTEGER, catalogue_code TEXT, store_type TEXT NOT NULL, store_name TEXT,
      country TEXT, region TEXT, currency TEXT, price_cents INTEGER, orig_value REAL, orig_unit TEXT, base_value REAL,
      base_unit TEXT, unit_price_cents REAL, unit_label TEXT, observed_at TEXT NOT NULL, scan_id TEXT,
      trusted INTEGER NOT NULL DEFAULT 0, device_key TEXT, verdict TEXT, verdict_source TEXT) STRICT`);
    old.exec(`INSERT INTO user_observation (store_type, observed_at, price_cents) VALUES ('supermarket', '2026-09-20', 599), ('supermarket', '2026-09-21', NULL)`);
    old.close();
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => lines.push(a.join(' '));
    let uc;
    try {
      uc = createUserCatalogue(path);
    } finally {
      console.log = orig;
    }
    assert.equal(uc.droppedWhy, '', uc.droppedWhy);
    assert.deepEqual(rows(uc.db!), [{ price_cents: 599, capture: 'typed' }, { price_cents: null, capture: null }]);
    assert.ok(lines.some((l) => /capture/.test(l) && /\b1\b/.test(l)), `the migration says what it marked: ${JSON.stringify(lines)}`);
    recordUserScan({ name: 'Maple Sauce', priceCents: 450 }, { log: uc });
    assert.equal(rows(uc.db!).at(-1)!.capture, 'typed');
    uc.db!.close();
    const again = createUserCatalogue(path);
    assert.equal(again.droppedWhy, '');
    assert.equal(rows(again.db!).length, 3, 'reopening changes nothing');
    again.db!.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
