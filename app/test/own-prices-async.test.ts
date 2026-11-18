/**
 * R15: the typed-name scan runs on a worker thread, the answer is the same as the synchronous one,
 * the server's event loop is free while it runs, and a broken worker is reported, never silent.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openPrices } from '../../price/src/store.ts';
import { lookupOwnPrices, lookupOwnPricesAsync } from '../src/own-prices.ts';

const dir = mkdtempSync(join(tmpdir(), 'pexi-async-own-'));
const pricesPath = join(dir, 'prices.db');
const FOODS = ['milk', 'butter', 'cheddar cheese', 'yogurt', 'cereal', 'pasta', 'orange juice', 'bread'];
const BRANDS = ['Neilson', 'Natrel', 'Kraft', 'Heinz', 'Barilla'];

const db = openPrices(pricesPath, { enforceSources: false });
db.exec('BEGIN');
const ins = db.prepare(
  `INSERT INTO observation (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind, currency, country, join_method, seen_on)
   VALUES (?, ?, ?, ?, ?, ?, 'shelf', 'CAD', 'CA', 'gtin', ?)`,
);
for (let i = 0; i < 20_000; i += 1) {
  const brand = BRANDS[i % BRANDS.length]!;
  ins.run(String(100000000000 + (i % 2000)).padStart(13, '0'), ['walmart.ca', 'loblaws'][i % 2]!, `sku${i}`, `${brand} ${FOODS[i % FOODS.length]} ${1 + (i % 4)} L`, brand, 200 + (i % 300), `2026-11-0${1 + (i % 9)}`);
}
db.exec('COMMIT');
db.close();

after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the file a moment */ } });

const sources = { pricesDbPath: pricesPath, userCatalogueDb: null, userCataloguePath: null, catalogueProbe: null };

test('the off-thread answer is the same as the synchronous one', async () => {
  for (const q of ['neilson milk 1 L', 'kraft cheddar cheese', 'zzqqxx marmalade', 'heinz']) {
    const sync = lookupOwnPrices(q, sources);
    const off = await lookupOwnPricesAsync(q, sources);
    assert.deepEqual(off, sync, `"${q}" answered differently off the main thread`);
  }
  assert.ok(lookupOwnPrices('neilson milk 1 L', sources).match, 'the fixture should answer this one');
});

test('the event loop runs while the scan is out (the scan is not on this thread)', async () => {
  let turned = false;
  setImmediate(() => { turned = true; });
  await lookupOwnPricesAsync('natrel butter 3 L', sources);
  assert.equal(turned, true, 'the loop did not get a turn before the answer came back: the scan ran on this thread');
});

test('a prices file that is missing is "prices unavailable", the same as before', async () => {
  const gone = { ...sources, pricesDbPath: join(dir, 'nope.db') };
  assert.deepEqual(await lookupOwnPricesAsync('neilson milk', gone), lookupOwnPrices('neilson milk', gone));
});

test('a worker fault is reported, and the answer is still given by the main thread', async () => {
  const bad = join(dir, 'not-a-database.db');
  writeFileSync(bad, 'this is not sqlite');
  const faults: unknown[] = [];
  const out = await lookupOwnPricesAsync('neilson milk', { ...sources, pricesDbPath: bad, onFault: (e) => faults.push(e) });
  assert.equal(faults.length, 1, 'the fault was not reported');
  assert.deepEqual(out.unavailable, ['prices', 'user_catalogue']);
  // A reporter that throws must not break the lookup.
  const out2 = await lookupOwnPricesAsync('neilson milk', { ...sources, pricesDbPath: bad, onFault: () => { throw new Error('reporter broke'); } });
  assert.deepEqual(out2.unavailable, ['prices', 'user_catalogue']);
});

test('words too short to search never start a worker scan', async () => {
  const faults: unknown[] = [];
  const out = await lookupOwnPricesAsync('ab', { ...sources, onFault: (e) => faults.push(e) });
  assert.equal(out.match, null);
  assert.equal(faults.length, 0);
});
