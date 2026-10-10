/**
 * Item 15: user scans build the catalogue.
 *
 * Every test here names one clause of Jamin's description and fails if that
 * clause is removed: attach to the catalogue's product (closest quantity), new
 * entry when unknown (untrusted, user-sourced), near-duplicates grouped, same
 * product kept per store type, units converted with the original kept, tech
 * compared by model and spec and not weight, and no Canada assumption.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue, rebuildFts } from '../src/schema.ts';
import { openGapLog, recordGap } from '../src/gaps.ts';
import {
  branchesOf,
  createUserCatalogue,
  nameTokens,
  probeCatalogue,
  recordUserScan,
  type UserCatalogue,
} from '../src/user-catalogue.ts';
import { marketFromLocation } from '../src/market.ts';

const fresh = (): UserCatalogue => createUserCatalogue(':memory:');

function all<T>(uc: UserCatalogue, sql: string, ...args: (string | number | null)[]): T[] {
  return uc.db!.prepare(sql).all(...args) as unknown as T[];
}

test('an unknown product becomes a new entry, marked user-sourced and untrusted', () => {
  const uc = fresh();
  const r = recordUserScan({ gtin: '0123456789012', name: 'Maple Sriracha Sauce', brand: 'Acme', quantity: '250 ml', priceCents: 499 }, { log: uc });
  assert.equal(r.outcome, 'created');
  assert.equal(r.trusted, false);
  assert.equal(r.source, 'user_scan');
  const [row] = all<{ source: string; trusted: number }>(uc, 'SELECT source, trusted FROM user_product');
  assert.equal(row.source, 'user_scan');
  assert.equal(row.trusted, 0);
  assert.equal(all<{ trusted: number }>(uc, 'SELECT trusted FROM user_observation')[0].trusted, 0);
});

test('the same product scanned again is one entry, not two', () => {
  const uc = fresh();
  recordUserScan({ name: 'Maple Sriracha Sauce', brand: 'Acme', quantity: '250 ml' }, { log: uc });
  const again = recordUserScan({ name: 'maple sriracha sauce', brand: 'ACME', quantity: '250ml' }, { log: uc });
  assert.equal(again.outcome, 'merged');
  assert.equal(all(uc, 'SELECT id FROM user_product').length, 1);
  assert.equal(all<{ scan_count: number }>(uc, 'SELECT scan_count FROM user_product')[0].scan_count, 2);
});

test('near-duplicates are grouped: a slightly different name is the same product, a different size is a new entry in the group', () => {
  const uc = fresh();
  const first = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme', quantity: '250 ml' }, { log: uc });
  const noisy = recordUserScan({ name: 'Maple Sriracha Sauce, Acme (250 ml)', brand: 'Acme', quantity: '250 ml' }, { log: uc });
  assert.equal(noisy.outcome, 'merged', 'punctuation and word order do not make a second product');
  const bigger = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme', quantity: '1 l' }, { log: uc });
  assert.equal(bigger.outcome, 'created_in_group');
  assert.equal(bigger.groupKey, first.groupKey, 'two sizes of one product share a group');
  const other = recordUserScan({ name: 'Acme Dish Soap Lemon', brand: 'Acme', quantity: '250 ml' }, { log: uc });
  assert.equal(other.outcome, 'created');
  assert.notEqual(other.groupKey, first.groupKey);
});

test('names are compared in any script, not only Latin', () => {
  assert.deepEqual(nameTokens('Sauce Piquante Erable 250 ml'), ['erable', 'piquante', 'sauce']);
  assert.ok(nameTokens('プリン 卵 6 x 50 g').length >= 2);
  const uc = fresh();
  recordUserScan({ name: 'プリン 卵 プリン', brand: 'グリコ' }, { log: uc });
  assert.equal(recordUserScan({ name: 'プリン 卵', brand: 'グリコ' }, { log: uc }).outcome, 'merged');
});

test('the same product is kept per store type, and a farm price never blends with a supermarket price', () => {
  const uc = fresh();
  const a = recordUserScan({ name: 'Honeycrisp Apples', quantity: '1 kg', storeType: 'Supermarkets & Groceries', priceCents: 599, market: marketFromLocation({ country: 'CA' }) }, { log: uc });
  recordUserScan({ name: 'Honeycrisp Apples', quantity: '1 kg', storeType: 'farm', priceCents: 350, market: marketFromLocation({ country: 'CA' }) }, { log: uc });
  recordUserScan({ name: 'Honeycrisp Apples', quantity: '1 kg', storeType: 'supermarket', priceCents: 549, market: marketFromLocation({ country: 'CA' }) }, { log: uc });
  assert.equal(all(uc, 'SELECT id FROM user_product').length, 1);
  const branches = branchesOf(uc, `u:${a.productId}`);
  assert.deepEqual(branches.map((b) => [b.storeType, b.count, b.lastPriceCents]), [['farm', 1, 350], ['supermarket', 2, 549]]);
});

test('quantity is converted to Shin\'s comparison units and the original is kept beside it', () => {
  const uc = fresh();
  recordUserScan({ name: 'Basmati Rice', quantity: '2 lb', priceCents: 599 }, { log: uc });
  const [p] = all<{ base_value: number; base_unit: string; orig_value: number; orig_unit: string }>(uc, 'SELECT * FROM user_product');
  assert.equal(p.base_unit, 'g');
  assert.ok(Math.abs(p.base_value - 907.18474) < 1e-3);
  assert.equal(p.orig_value, 2);
  assert.equal(p.orig_unit, 'lb');
  const [o] = all<{ unit_price_cents: number; unit_label: string; orig_unit: string; base_unit: string }>(uc, 'SELECT * FROM user_observation');
  assert.equal(o.unit_label, '100 g');
  assert.ok(Math.abs(o.unit_price_cents - (599 / 907.18474) * 100) < 1e-6);
  assert.equal(o.orig_unit, 'lb');
});

test('tech is identified by brand, model and spec, and its weight is never read', () => {
  const uc = fresh();
  const a = recordUserScan({ name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', kind: 'tech', model: 'WH-1000XM5', specs: { colour: 'Black', weight: '250 g' }, quantity: '250 g' }, { log: uc });
  const sameModelOtherWeight = recordUserScan({ name: 'WH1000XM5 wireless headphones by Sony', brand: 'Sony', kind: 'tech', model: 'wh 1000 xm5', specs: { colour: 'black', weight: '0.55 lb' } }, { log: uc });
  assert.equal(sameModelOtherWeight.outcome, 'merged', 'weight is not a spec that separates products');
  const otherSpec = recordUserScan({ name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', kind: 'tech', model: 'WH-1000XM5', specs: { colour: 'Silver' } }, { log: uc });
  assert.equal(otherSpec.outcome, 'created_in_group', 'a different spec of the same model is its own entry in the model\'s group');
  assert.equal(otherSpec.groupKey, a.groupKey);
  const [p] = all<{ base_value: number | null; orig_value: number | null }>(uc, 'SELECT * FROM user_product ORDER BY id LIMIT 1');
  assert.equal(p.base_value, null, 'no weight is stored as a size for tech');
  assert.equal(p.orig_value, null);
  assert.equal(all<{ unit_price_cents: number | null }>(uc, 'SELECT unit_price_cents FROM user_observation')[0].unit_price_cents, null);
});

// ── attaching to the catalogue's own product ─────────────────────────────────

function catalogueWith(rows: [string, string, string, number, string][]) {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(`INSERT INTO product (code, name, name_en, brands, size_value, size_unit, category_path, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const [code, name, brands, size, unit] of rows) ins.run(code, name, name, brands, size, unit, '[]', '[]', 0, 'openfoodfacts');
  rebuildFts(db);
  return db;
}

test('a scan that matches a catalogue product attaches to it and does not create an entry', () => {
  const uc = fresh();
  const db = catalogueWith([['4006381333931', 'Stabilo Boss Highlighter', 'Stabilo', 1, 'ea']]);
  const r = recordUserScan({ gtin: '4006381333931', name: 'whatever the model called it', priceCents: 199 }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(r.outcome, 'attached');
  assert.equal(r.catalogueCode, '4006381333931');
  assert.equal(all(uc, 'SELECT id FROM user_product').length, 0, 'the user catalogue holds the observation, not a duplicate product');
  assert.equal(all<{ catalogue_code: string }>(uc, 'SELECT catalogue_code FROM user_observation')[0].catalogue_code, '4006381333931');
  assert.equal(r.trusted, false);
});

test('with two sizes of the product in the catalogue, the scan attaches to the closer one, after conversion', () => {
  const uc = fresh();
  const db = catalogueWith([
    ['1111111111116', 'Acme Maple Sriracha Sauce', 'Acme', 250, 'ml'],
    ['2222222222222', 'Acme Maple Sriracha Sauce', 'Acme', 1, 'l'],
  ]);
  // 0.9 l is 900 ml: closer to the 1 l bottle than to the 250 ml one, though 0.9 is
  // numerically closer to 1 and 250 is "closer" in nothing; the conversion is the point.
  const big = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme', quantity: '0.9 l' }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(big.catalogueCode, '2222222222222');
  const small = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme', quantity: '300 ml' }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(small.catalogueCode, '1111111111116');
  const raw = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme', quantity: '2 pt' }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(raw.catalogueCode, '2222222222222', '2 US pints is about 946 ml');
});

test('with no size on the scan and two sizes in the catalogue, the pick is marked ambiguous', () => {
  const uc = fresh();
  const db = catalogueWith([
    ['1111111111116', 'Acme Maple Sriracha Sauce', 'Acme', 250, 'ml'],
    ['2222222222222', 'Acme Maple Sriracha Sauce', 'Acme', 1, 'l'],
  ]);
  const r = recordUserScan({ name: 'Acme Maple Sriracha Sauce', brand: 'Acme' }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(r.outcome, 'attached');
  assert.equal(r.quantityAmbiguous, true);
});

test('a catalogue miss falls to a user entry', () => {
  const uc = fresh();
  const db = catalogueWith([['4006381333931', 'Stabilo Boss Highlighter', 'Stabilo', 1, 'ea']]);
  const r = recordUserScan({ gtin: '9999999999994', name: 'Totally Unknown Widget' }, { log: uc, probe: probeCatalogue(db) });
  assert.equal(r.outcome, 'created');
});

// ── the miss path in gaps.ts ─────────────────────────────────────────────────

function tempGaps(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-usercat-')), 'gaps.db');
}

test('a catalogue miss recorded through the gap log ALSO creates a user-sourced untrusted entry, and the log is kept', () => {
  const path = tempGaps();
  openGapLog(path);
  recordGap({ gtin: '0123456789012', queryText: 'Maple Sriracha Sauce', scan: { brand: 'Acme', quantity: '250 ml', storeType: 'supermarket', priceCents: 499 } });
  const log = openGapLog(path);
  const gap = log.db!.prepare('SELECT count FROM gap').all() as unknown as { count: number }[];
  assert.equal(gap.length, 1, 'the human-review log still records the miss');
  const uc = createUserCatalogue(join(path, '..', 'user-catalogue.db'));
  const [p] = all<{ name: string; source: string; trusted: number; bare: number }>(uc, 'SELECT name, source, trusted, bare FROM user_product');
  assert.equal(p.name, 'Maple Sriracha Sauce');
  assert.equal(p.source, 'user_scan');
  assert.equal(p.trusted, 0);
  assert.equal(all<{ store_type: string }>(uc, 'SELECT store_type FROM user_observation')[0].store_type, 'supermarket');
});

test('a bare barcode miss still makes an entry, marked bare; a two-letter query does too (5.7, 2026-10-09)', () => {
  const path = tempGaps();
  openGapLog(path);
  recordGap({ gtin: '5449000000996' });
  recordGap({ queryText: 'ab' });
  const uc = createUserCatalogue(join(path, '..', 'user-catalogue.db'));
  const rows = all<{ gtin: string; bare: number }>(uc, 'SELECT gtin, bare FROM user_product');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.bare === 1));
  assert.ok(rows.some((r) => r.gtin === '5449000000996'));
});

test('recordUserScan never throws, on a closed log or a scan with nothing in it', () => {
  const broken = createUserCatalogue('/nonexistent-dir-for-shin/x/y.db');
  assert.doesNotThrow(() => recordUserScan({ name: 'Anything Goes Here' }, { log: broken }));
  assert.equal(recordUserScan({}, { log: fresh() }).outcome, 'dropped');
});

test('no country is assumed: an observation with no location stores no country and no currency', () => {
  const uc = fresh();
  recordUserScan({ name: 'Mystery Snack Bar', priceCents: 250 }, { log: uc });
  const [o] = all<{ country: string | null; currency: string | null }>(uc, 'SELECT country, currency FROM user_observation');
  assert.equal(o.country, null);
  assert.equal(o.currency, null);
  recordUserScan({ name: 'Mystery Snack Bar', priceCents: 250, market: marketFromLocation({ country: 'JP' }) }, { log: uc });
  const rows = all<{ country: string | null; currency: string | null }>(uc, 'SELECT country, currency FROM user_observation ORDER BY id');
  assert.deepEqual([rows[1].country, rows[1].currency], ['JP', 'JPY']);
});
