/**
 * Requirement 4.1 (docs/price-category-requirements-2026-10-01.md): take prices
 * from any source through one intake format. Pass when: a new test source runs
 * end to end with no change outside its reader.
 *
 * Plan Part 6, 4.1: one standard record, one reader per source, proven by a toy
 * source; fails when the toy source needs a change outside its reader.
 *
 * THE PROOF. The two toy readers below exist only in this file. Nothing in
 * price/src names them, registers them or knows their sellers. Each is run
 * through the one intake path (`runIntake`) and its prices are then read back
 * by a serving reader that was written before either existed (`lookup.ts`).
 * If adding a source needed an edit anywhere else - a seller list, a switch, a
 * new column - one of these would fail to run or fail to be read.
 *
 * What a new source does need since requirement 4.8 (registry.ts) is data, not
 * code: an entry in the database's source registry recording its basis for
 * use. `registerToy` below writes that entry for each toy; no file in
 * price/src changes for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ObservationRow } from '../src/store.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-intake-'));
const PATH = join(dir, 'prices.db');
// Set before store.ts is imported: PRICES_DB_PATH is read once, at import.
process.env.SHIN_PRICES = PATH;
const { openPrices } = await import('../src/store.ts');
const intake = await import('../src/intake.ts');
const { lookupPrices } = await import('../src/lookup.ts');
const { registerSource } = await import('../src/registry.ts');
type Db = ReturnType<typeof openPrices>;

/** The registry entry a new source needs (requirement 4.8): data in the database, not a code change. */
function registerToy(db: Db, seller: string): Db {
  registerSource(db, {
    seller,
    access: 'automated',
    basis: 'licence',
    evidence: 'toy source that exists only in this test',
    evidenceUrl: null,
    readOn: null,
    automated: 'not_recorded',
    cite: 'price/test/intake-one-format.test.ts',
  });
  return db;
}

const DAY = '2026-10-09';

function toyRow(seller: string, sku: string, code: string | null, cents: number, over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code,
    seller,
    sellerSku: sku,
    sellerName: `Toy product ${sku}`,
    sellerBrand: null,
    priceCents: cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'Ontario',
    joinMethod: code === null ? 'none' : 'gtin',
    seenOn: DAY,
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: 'Toy Store',
    storeCity: 'Kingston',
    storeOsm: null,
    ...over,
  };
}

/** A shelf-scanning toy: knows store, city and region on every row. Synchronous. */
const toyShelf = {
  seller: 'toy-shelf',
  supplies: { seenOn: 'always', region: 'always', storeName: 'always', storeCity: 'always', storeOsm: 'never' },
  read: () => [
    toyRow('toy-shelf', 's-1', '0000000000017', 399),
    toyRow('toy-shelf', 's-2', null, 250, { pageGtin: '12345' }),
    toyRow('toy-shelf', 's-3', '0000000000024', 1299, { kind: 'promotional', wasCents: 1499, isSale: 1 }),
  ],
} as const;

/** An online toy: national prices, no store at all. Asynchronous, a different shape of reader. */
const toyOnline = {
  seller: 'toy-online',
  supplies: { seenOn: 'always', region: 'never', storeName: 'never', storeCity: 'never', storeOsm: 'never' },
  async *read() {
    yield toyRow('toy-online', 'o-1', '0000000000031', 450, { region: null, storeName: null, storeCity: null });
  },
} as const;

test('4.1 a new toy source runs end to end through the one intake path and a serving reader reads it back', async () => {
  const db = registerToy(openPrices(PATH), 'toy-shelf');
  const r = await intake.runIntake(db, toyShelf, { on: DAY });
  assert.deepEqual([r.offered, r.stored], [3, 3]);
  db.close();
  const got = await lookupPrices(['0000000000017', '0000000000024']);
  assert.equal(got.get('0000000000017')?.amountCents, 399);
  assert.equal(got.get('0000000000017')?.seller, 'toy-shelf');
  assert.equal(got.get('0000000000017')?.storeName, 'Toy Store');
  assert.equal(got.get('0000000000024')?.amountCents, 1299);
});

test('4.1 a second, differently shaped toy source runs through the same unmodified path', async () => {
  const db = registerToy(openPrices(PATH), 'toy-online');
  const r = await intake.runIntake(db, toyOnline, { on: DAY });
  assert.deepEqual([r.offered, r.stored], [1, 1]);
  const sellers = (db.prepare('SELECT DISTINCT seller FROM intake_batch ORDER BY seller').all() as { seller: string }[]).map((s) => s.seller);
  assert.deepEqual(sellers, ['toy-online', 'toy-shelf'], 'both batches are on the ledger');
  db.close();
  assert.equal((await lookupPrices(['0000000000031'])).get('0000000000031')?.amountCents, 450);
});

test('4.1 known-bad: a reader emitting another seller\'s rows is refused loudly, and the batch is on the ledger as failed', async () => {
  const db = registerToy(openPrices(':memory:'), 'toy-online');
  const liar = { ...toyOnline, read: () => [toyRow('Walmart', 'w-1', '0000000000048', 100, { region: null, storeName: null, storeCity: null })] };
  await assert.rejects(intake.runIntake(db, liar, { on: DAY }), /toy-online.*Walmart|Walmart.*toy-online/);
  const st = db.prepare('SELECT status FROM intake_batch_close').get() as { status: string };
  assert.equal(st.status, 'failed');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 0);
});

test('4.1 known-bad: a reader that throws mid-stream fails loudly; what it stored before is kept and counted', async () => {
  const db = registerToy(openPrices(':memory:'), 'toy-online');
  const broken = {
    ...toyOnline,
    async *read() {
      yield toyRow('toy-online', 'o-1', '0000000000031', 450, { region: null, storeName: null, storeCity: null });
      throw new Error('page 2 would not parse');
    },
  };
  await assert.rejects(intake.runIntake(db, broken, { on: DAY }), /page 2 would not parse/);
  const close = db.prepare('SELECT offered, stored, status, detail FROM intake_batch_close').get() as Record<string, unknown>;
  assert.deepEqual([close.offered, close.stored, close.status], [1, 1, 'failed']);
  assert.match(String(close.detail), /page 2 would not parse/);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 1, 'kept, not rolled back');
});

test('4.1 known-bad: a reader with no declaration of what it supplies is refused before it reads anything', async () => {
  const db = openPrices(':memory:');
  let read = 0;
  const undeclared = { seller: 'toy-x', supplies: { seenOn: 'always' }, read: () => { read += 1; return []; } };
  await assert.rejects(intake.runIntake(db, undeclared as never, { on: DAY }), /toy-x.*declare/);
  assert.equal(read, 0);
});
