/**
 * Requirement 4.4 (docs/price-category-requirements-2026-10-01.md): record
 * store, region and date on every price where known. Pass when: 100% where the
 * source has them.
 *
 * Plan Part 6, 4.4: each reader declares what it supplies; the null rate is
 * tested; fails when a declared field is missing; shows as the null rate per
 * source; if a source truly lacks a field, record it as not supplying it.
 *
 * Declarations have three values. 'always': the source has the field on every
 * row, so one null is a fault. 'when_known': the source has it on some rows
 * (Open Prices names a shop only when the location is one), so the null rate is
 * reported, not failed. 'never': the source does not publish it, so a filled
 * value means the declaration is out of date, which is also a fault.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import * as intake from '../src/intake.ts';

const DAY = '2026-10-09';

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: '0068100084245', seller: 'toy-shelf', sellerSku: 's-1', sellerName: 'n', sellerBrand: null,
    priceCents: 500, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA',
    region: 'Ontario', joinMethod: 'gtin', seenOn: DAY, url: null, imageUrl: null, inStock: null,
    storeName: 'Toy Store', storeCity: 'Kingston', storeOsm: null, ...over,
  };
}

const SHELF = { seenOn: 'always', region: 'always', storeName: 'always', storeCity: 'always', storeOsm: 'never' } as const;

test('4.4 control: rows that carry every field their source declares pass', () => {
  assert.doesNotThrow(() => intake.checkDeclaredFields('toy-shelf', SHELF, [row(), row({ sellerSku: 's-2' })]));
});

test('4.4 known-bad: one null in a declared "always" field fails loudly with the count and an example', () => {
  assert.throws(
    () => intake.checkDeclaredFields('toy-shelf', SHELF, [row(), row({ sellerSku: 's-2', storeCity: null })]),
    (e: Error) => e instanceof intake.SourceFieldError && /storeCity/.test(e.message) && /1 of 2/.test(e.message) && /s-2/.test(e.message),
  );
});

test('4.4 known-bad: a field filled that the source declared "never" means the declaration is stale, and fails', () => {
  assert.throws(() => intake.checkDeclaredFields('toy-shelf', SHELF, [row({ storeOsm: 'WAY/1' })]), /storeOsm.*never/);
});

test('4.4 "when_known" fields report a null rate and do not fail', () => {
  const decl = { ...SHELF, storeName: 'when_known', storeCity: 'when_known' } as const;
  assert.doesNotThrow(() => intake.checkDeclaredFields('toy-shelf', decl, [row(), row({ sellerSku: 's-2', storeName: null, storeCity: null })]));
});

test('4.4 the database-wide null rate per source: control passes, a declared field gone null fails, an undeclared seller fails', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  recordObservation(db, row({ sellerSku: 's-2' }));
  const decls = { 'toy-shelf': SHELF };
  const rep = intake.sourceFieldReport(db, decls);
  assert.deepEqual(rep.find((r) => r.seller === 'toy-shelf' && r.field === 'storeCity'), {
    seller: 'toy-shelf', field: 'storeCity', supply: 'always', rows: 2, nulls: 0, ok: true,
  });
  assert.doesNotThrow(() => intake.assertSourceFields(db, decls));

  db.exec("UPDATE observation SET store_city = NULL WHERE seller_sku = 's-2'");
  assert.throws(() => intake.assertSourceFields(db, decls), /toy-shelf storeCity.*1 of 2 null/);

  db.exec("UPDATE observation SET store_city = 'Kingston' WHERE seller_sku = 's-2'");
  recordObservation(db, row({ seller: 'mystery-source' }));
  assert.throws(() => intake.assertSourceFields(db, decls), /mystery-source.*no declaration/);
});

test('4.4 every seller the existing readers write has a declaration, and it matches what each reader writes', () => {
  // Read off each reader's own row builder (2026-10-09); a change to a reader
  // that stops supplying a field is caught by assertSourceFields on the data.
  const d = intake.LEGACY_SUPPLIES;
  for (const s of ['Walmart', 'Canadian Tire', 'Save-On-Foods', 'openprices', 'bcldb', 'anbl']) {
    assert.ok(d[s], `${s} declared`);
    assert.equal(d[s]!.seenOn, 'always', `${s} always has a date`);
  }
  assert.deepEqual(
    [d['Save-On-Foods']!.storeName, d['Save-On-Foods']!.storeCity, d['Save-On-Foods']!.region],
    ['always', 'always', 'always'],
  );
  assert.equal(d['bcldb']!.region, 'always');
  assert.equal(d['anbl']!.region, 'always');
  assert.equal(d['Canadian Tire']!.storeName, 'never');
});

test('4.4 batches declare what they supply, and the database-wide check reads a new source\'s declaration from the ledger', async () => {
  const db = openPrices(':memory:');
  await intake.runIntake(db, { seller: 'toy-shelf', supplies: SHELF, read: () => [row()] }, { on: DAY });
  // No entry for toy-shelf anywhere in price/src: the ledger carries it.
  assert.doesNotThrow(() => intake.assertSourceFields(db));
});

test('4.4 known-bad: a batch whose rows break their declaration is stored whole, put on the ledger as failed, and thrown', async () => {
  const db = openPrices(':memory:');
  await assert.rejects(
    intake.runIntake(db, { seller: 'toy-shelf', supplies: SHELF, read: () => [row(), row({ sellerSku: 's-2', region: null })] }, { on: DAY }),
    /region.*1 of 2/,
  );
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 2, 'kept, not dropped');
  assert.equal((db.prepare('SELECT status FROM intake_batch_close').get() as { status: string }).status, 'field_mismatch');
});
