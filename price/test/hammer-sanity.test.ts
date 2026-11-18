/**
 * PROJECT HAMMER IMPORT SANITY CHECKS (readiness item R28).
 *
 * The weekly refresh used to "succeed" on any file that parsed: half the rows gone, a retailer
 * missing, prices a hundred times off after a unit change. Now `judgeImport` reads the numbers
 * before anything is written, and a failed check refuses the import: last week's prices stay,
 * the refusal is stored where /api/health reads it, and the script exits non-zero.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  judgeImport,
  priceUnitIsSane,
  compareToStored,
  recordImport,
  recordRefusal,
  readPriorImport,
  readRefusal,
  type ImportStats,
  type PriorImport,
} from '../src/hammer-sanity.ts';
import { openPrices, recordObservation } from '../src/store.ts';
import { ensureRegistered, observationsFor, readProducts } from '../src/hammer.ts';

const NOW = Date.parse('2026-11-18T12:00:00Z');

const prior: PriorImport = { rows: 1_000_000, priced: 50_000, byVendor: { Metro: 20_000, Loblaws: 20_000, Walmart: 10_000 } };
function good(): ImportStats {
  return {
    rows: 1_040_000,
    priced: 51_000,
    byVendor: { Metro: 20_400, Loblaws: 20_400, Walmart: 10_200 },
    maxDay: '20261116',
    unitChecked: 51_000,
    unitBad: 0,
    compared: 40_000,
    over10x: 10,
    medianMove: 0.0,
  };
}

test('a normal week passes', () => {
  assert.deepEqual(judgeImport(good(), prior, NOW), { ok: true, failures: [] });
});

test('the first import ever has nothing to compare against and passes the checks that need no history', () => {
  assert.equal(judgeImport(good(), null, NOW).ok, true);
  assert.equal(judgeImport({ ...good(), maxDay: '20250101' }, null, NOW).ok, false, 'a stale file fails even with no history');
});

test('rows dropping more than 30 percent against the last run refuses; 29 percent does not', () => {
  assert.equal(judgeImport({ ...good(), rows: 690_000 }, prior, NOW).ok, false);
  assert.equal(judgeImport({ ...good(), rows: 710_000 }, prior, NOW).ok, true);
});

test('priced products dropping more than 30 percent refuses', () => {
  const r = judgeImport({ ...good(), priced: 30_000, byVendor: { Metro: 12_000, Loblaws: 12_000, Walmart: 6_000 } }, prior, NOW);
  assert.equal(r.ok, false);
  assert.match(r.failures.join(' '), /priced/);
});

test('one retailer gone, or down by half, refuses', () => {
  const gone = judgeImport({ ...good(), byVendor: { Metro: 20_400, Loblaws: 20_400 } }, prior, NOW);
  assert.equal(gone.ok, false);
  assert.match(gone.failures.join(' '), /Walmart/);
  const half = judgeImport({ ...good(), byVendor: { Metro: 20_400, Loblaws: 20_400, Walmart: 4_000 } }, prior, NOW);
  assert.equal(half.ok, false);
});

test('a newest price day more than 14 days old refuses; exactly 14 passes', () => {
  assert.equal(judgeImport({ ...good(), maxDay: '20261104' }, prior, NOW).ok, true);
  const r = judgeImport({ ...good(), maxDay: '20261103' }, prior, NOW);
  assert.equal(r.ok, false);
  assert.match(r.failures.join(' '), /newest/);
});

test('more than 2 percent of compared prices moving over 10 times refuses (a unit change)', () => {
  assert.equal(judgeImport({ ...good(), over10x: 801 }, prior, NOW).ok, false);
  assert.equal(judgeImport({ ...good(), over10x: 800 }, prior, NOW).ok, true);
  // too few compared products to say anything: not judged
  assert.equal(judgeImport({ ...good(), compared: 50, over10x: 40 }, prior, NOW).ok, true);
});

test('the median price moving more than 25 percent refuses', () => {
  assert.equal(judgeImport({ ...good(), medianMove: 0.26 }, prior, NOW).ok, false);
  assert.equal(judgeImport({ ...good(), medianMove: 0.25 }, prior, NOW).ok, true);
});

test('more than 1 percent of prices outside a believable range refuses (a cents or dollars mix-up)', () => {
  assert.equal(judgeImport({ ...good(), unitBad: 511 }, prior, NOW).ok, false);
  assert.equal(judgeImport({ ...good(), unitBad: 510 }, prior, NOW).ok, true);
});

test('every failure is listed, not only the first', () => {
  const r = judgeImport({ ...good(), rows: 100, medianMove: 0.9, unitBad: 9000 }, prior, NOW);
  assert.ok(r.failures.length >= 3);
});

test('priceUnitIsSane: 5 cents to 3000 dollars', () => {
  assert.equal(priceUnitIsSane(4), false);
  assert.equal(priceUnitIsSane(5), true);
  assert.equal(priceUnitIsSane(300_000), true);
  assert.equal(priceUnitIsSane(300_001), false);
});

function withDb<T>(fn: (db: ReturnType<typeof openPrices>) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-sanity-'));
  try {
    const db = openPrices(join(dir, 'prices.db'), { enforceSources: true });
    ensureRegistered(db);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PRODUCTS = 'id,concatted,vendor,product_name,units,brand,detail_url,sku,upc\r\n' + 'Metro729571884429,"x",Metro,"Lily",1un,,,729571884429,729571884429\r\n';

test('compareToStored measures against what the database already holds', () => {
  withDb((db) => {
    const p = readProducts(PRODUCTS).get('Metro729571884429')!;
    for (const o of observationsFor(p, { day: '20261101', current: '4.00', old: '', perUnit: '', other: '' })) recordObservation(db, o);
    const same = compareToStored(db, [{ sku: 'Metro729571884429', cents: 400 }]);
    assert.deepEqual(same, { compared: 1, over10x: 0, medianMove: 0 });
    const hundred = compareToStored(db, [{ sku: 'Metro729571884429', cents: 40_000 }]);
    assert.equal(hundred.over10x, 1);
    assert.equal(hundred.medianMove, 99);
    const none = compareToStored(db, [{ sku: 'never-seen', cents: 400 }]);
    assert.deepEqual(none, { compared: 0, over10x: 0, medianMove: null });
  });
});

test('a refusal is stored for /api/health and a later good import clears it; the prior run is kept', () => {
  withDb((db) => {
    assert.equal(readPriorImport(db), null);
    assert.equal(readRefusal(db), null);
    recordRefusal(db, 'rows fell 60 percent', '2026-11-15T05:31:00.000Z');
    assert.deepEqual(readRefusal(db), { at: '2026-11-15T05:31:00.000Z', why: 'rows fell 60 percent' });
    assert.equal(readPriorImport(db), null, 'a refused run is not the baseline for the next one');
    recordImport(db, good(), '2026-11-22T05:31:00.000Z');
    assert.equal(readRefusal(db), null);
    assert.deepEqual(readPriorImport(db), { rows: 1_040_000, priced: 51_000, byVendor: { Metro: 20_400, Loblaws: 20_400, Walmart: 10_200 } });
  });
});

/*
 * The whole script on a small fixture: the first import is accepted, a second one with every price
 * a hundred times larger is refused, exits non-zero, writes the refusal and leaves the prices alone.
 */
const HAMMER = fileURLToPath(new URL('../src/hammer.ts', import.meta.url));
function fixture(dir: string, priceOf: (i: number) => string, day: string): void {
  let products = 'id,concatted,vendor,product_name,units,brand,detail_url,sku,upc\r\n';
  let raw = 'nowtime,current_price,old_price,price_per_unit,other,product_id\r\n';
  for (let i = 0; i < 300; i++) {
    const upc = `7290000${String(10000 + i)}`;
    products += `Metro${upc},"x",Metro,"Item ${i}",1un,,,${upc},${upc}\r\n`;
    raw += `${day},${priceOf(i)},,,,Metro${upc}\r\n`;
  }
  writeFileSync(join(dir, 'hammer-4-product.csv'), products);
  writeFileSync(join(dir, 'hammer-4-raw.csv'), raw);
}
function run(dir: string, db: string) {
  return spawnSync(process.execPath, [HAMMER, dir, '--no-match'], { env: { ...process.env, SHIN_PRICES: db }, encoding: 'utf8' });
}

test('the script accepts a normal import, then refuses one with prices 100 times off and keeps the old prices', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-run-'));
  const dbFile = join(dir, 'prices.db');
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    fixture(dir, (i) => (2 + (i % 20) * 0.5).toFixed(2), day);
    const first = run(dir, dbFile);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    fixture(dir, (i) => ((2 + (i % 20) * 0.5) * 100).toFixed(2), day);
    const second = run(dir, dbFile);
    assert.notEqual(second.status, 0, 'the import of wrong data must fail loudly');
    assert.match(second.stderr, /REFUSED/);
    const db = openPrices(dbFile);
    try {
      const row = db.prepare("SELECT MAX(price_cents) AS m FROM observation WHERE seller = 'hammer'").get() as { m: number };
      assert.ok(Number(row.m) < 1500, `last week's prices must stay (max ${row.m})`);
      assert.ok(readRefusal(db), 'the refusal is recorded for /api/health');
    } finally {
      db.close();
    }
    // A person who has looked at the change can accept it, loudly, and the refusal then clears.
    const accepted = spawnSync(process.execPath, [HAMMER, dir, '--no-match', '--accept-checks'], { env: { ...process.env, SHIN_PRICES: dbFile }, encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stderr, /OVERRIDDEN/);
    const after = openPrices(dbFile);
    try {
      assert.equal(readRefusal(after), null);
      assert.ok(Number((after.prepare("SELECT MAX(price_cents) AS m FROM observation WHERE seller = 'hammer'").get() as { m: number }).m) > 1500);
    } finally {
      after.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
