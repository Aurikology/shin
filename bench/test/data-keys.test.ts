import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { codeKey, isValidGtin, loadObservations, openReadOnly, spellings } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey, loadMatchingKey, MIN_KEY_SHOPS } from '../src/keys.ts';
import { fixtureRow, pricesDb, products, SHOPS } from './fixture.ts';
import { recordObservation } from '../../price/src/store.ts';

test('openReadOnly: SQLite itself refuses a write through the handle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-ro-'));
  try {
    const path = join(dir, 'p.db');
    const w = new DatabaseSync(path);
    // The oldest shape still in use: no base_price_cents, no page_gtin.
    w.exec(`CREATE TABLE observation (code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
      seller_brand TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL, country TEXT NOT NULL,
      region TEXT, join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, store_name TEXT, store_osm TEXT)`);
    w.exec(`INSERT INTO observation VALUES ('0001', 'X', 's', 'n', NULL, 250, 'regular', 'CAD', 'CA', NULL, 'gtin', '2026-09-01', NULL, NULL, NULL)`);
    w.close();
    const ro = openReadOnly(path);
    assert.throws(() => ro.exec('DELETE FROM observation'), /readonly|read-only/i);
    const obs = loadObservations(ro);
    assert.equal(obs.length, 1);
    assert.equal(obs[0]!.key, '1');
    ro.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codeKey strips leading zeros the way range.ts does', () => {
  assert.equal(codeKey('0068100084245'), '68100084245');
  assert.equal(codeKey('000'), '000');
});

test('prediction key: 3+ distinct shops, latest price per shop, promo rows ignored', () => {
  const db = pricesDb();
  const p0 = products()[0]!;
  // A product at only two shops never enters the key.
  recordObservation(db, fixtureRow({ code: '5550000000001', seller: 'A', sellerSku: 'x1', priceCents: 100, seenOn: '2026-09-01' }));
  recordObservation(db, fixtureRow({ code: '5550000000001', seller: 'B', sellerSku: 'x2', priceCents: 100, seenOn: '2026-09-01' }));
  const pred = buildPredictionKey(loadObservations(db));
  assert.equal(pred.length, products().length);
  assert.ok(pred.every((p) => p.points.length >= MIN_KEY_SHOPS));
  const item = pred.find((p) => p.key === codeKey(p0.code))!;
  assert.equal(item.points.length, SHOPS.length);
  assert.ok(item.points.every((pt) => pt.seenOn === '2026-09-15'));
});

test('sale key: pairs each sale with the same listing regular price nearest in date', () => {
  const sales = buildSaleKey(loadObservations(pricesDb()));
  assert.equal(sales.length, products().length);
  const p0 = products()[0]!;
  const s = sales.find((x) => x.code === p0.code)!;
  assert.equal(s.pairing, 'same_listing');
  assert.equal(s.regularSeenOn, '2026-09-15');
  assert.equal(s.regularCents, Math.round(p0.base * 1.01));
});

test('sale key: falls back to same seller and barcode, else none', () => {
  const db = pricesDb({ withSales: false });
  const p0 = products()[0]!;
  recordObservation(db, fixtureRow({ code: p0.code, seller: 'A', sellerSku: 'other-sku', priceCents: 10, seenOn: '2026-09-20', kind: 'promotional' }));
  recordObservation(db, fixtureRow({ code: null, seller: 'Z', sellerSku: 'z', priceCents: 10, seenOn: '2026-09-20', kind: 'promotional', joinMethod: 'none' }));
  const sales = buildSaleKey(loadObservations(db));
  assert.deepEqual(sales.map((s) => s.pairing).sort(), ['none', 'same_seller_barcode']);
});

test('matching key slot: a missing file is an empty slot, not an error', () => {
  const m = loadMatchingKey(join(tmpdir(), 'no-such-key-truth.jsonl'));
  assert.equal(m.status, 'missing');
  assert.equal(m.rows, 0);
});

test('codeKey: UPC-E, UPC-A, EAN-13 and GTIN-14 spellings of one product share one key', () => {
  const upca = '049000006346';
  assert.equal(isValidGtin(upca), true);
  const k = codeKey(upca);
  assert.equal(codeKey('04963406'), k);
  assert.equal(codeKey('0' + upca), k);
  assert.equal(codeKey('00' + upca), k);
  assert.ok(spellings(k).includes('04963406'));
  // An 8-digit code whose UPC-E expansion fails its check digit stays itself (an EAN-8).
  assert.equal(codeKey('04963407'), '4963407');
});

test('is_sale and was_cents are used when the columns exist', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE observation (code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL, country TEXT NOT NULL, region TEXT,
    join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, store_name TEXT, store_osm TEXT, was_cents INTEGER, is_sale INTEGER)`);
  const ins = db.prepare(`INSERT INTO observation VALUES (?, 'W', ?, 'n', ?, ?, 'CAD', 'CA', NULL, 'gtin', ?, NULL, NULL, NULL, ?, ?)`);
  ins.run('0001', 'a', 300, 'regular', '2026-09-20', 450, 1); // a printed sale, kind still 'regular'
  ins.run('0001', 'a', 450, 'regular', '2026-09-01', null, 0);
  const obs = loadObservations(db);
  assert.deepEqual(obs.map((o) => o.isSale).sort(), [false, true]);
  const sales = buildSaleKey(obs);
  assert.equal(sales.length, 1);
  assert.equal(sales[0]!.pairing, 'was_price');
  assert.equal(sales[0]!.regularCents, 450);
  // The printed sale is not a regular truth point.
  assert.equal(obs.filter((o) => !o.isSale).length, 1);
});
