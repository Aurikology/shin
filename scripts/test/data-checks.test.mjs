import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { runChecks } from '../data-checks/rules.mts';
import { exitCodeFor } from '../data-checks/run.mts';

// THE NEGATIVE CONTROL for scripts/data-checks. A temp prices file is built with the real schema
// (price/src/store.ts openPrices and recordObservation), the planted rows are exactly one per rule class
// (D5 has seven classes, D6 two), and clean rows sit beside them, some right on each rule's boundary. Every
// rule has to be seen finding exactly its planted row and nothing else. Nothing real is read or written.

const here = dirname(fileURLToPath(import.meta.url));
const RUN = join(here, '..', 'data-checks', 'run.mts');
const AS_OF = '2026-11-11';
const AS_OF_MS = Date.parse(`${AS_OF}T00:00:00Z`);
const daysAgo = (n) => new Date(AS_OF_MS - n * 86_400_000).toISOString().slice(0, 10);

let dir;
let plantedDb;
let cleanDb;
let catalogueDb;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'data-checks-test-'));
  plantedDb = join(dir, 'planted.db');
  cleanDb = join(dir, 'clean.db');
  catalogueDb = join(dir, 'catalogue.db');

  const base = {
    code: null,
    seller: 's1',
    sellerSku: 'x',
    sellerName: 'x',
    sellerBrand: null,
    priceCents: 1000,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: daysAgo(10),
    url: null,
    imageUrl: null,
    inStock: null,
  };
  const catalogue = new Map(); // code -> quantity text
  const row = (o) => ({ ...base, ...o });
  /** A row for a catalogue product: its name ends in the catalogue size unless `name` says otherwise. */
  const product = (code, size, o) => {
    catalogue.set(code, size);
    return row({ code, sellerName: `Acme Thing ${size}`, ...o });
  };

  const clean = [
    // C1: three sellers, consistent stored unit prices.
    product('0000000000017', '500 g', { sellerSku: 'CLEAN-1a', seller: 's1', priceCents: 400, unitPriceCents: 80, unitPricePer: '100g' }),
    product('0000000000017', '500 g', { sellerSku: 'CLEAN-1b', seller: 's2', priceCents: 420, unitPriceCents: 84, unitPricePer: '100g' }),
    product('0000000000017', '500 g', { sellerSku: 'CLEAN-1c', seller: 's3', priceCents: 380, unitPriceCents: 76, unitPricePer: '100g' }),
    // C2: exactly 90 days old is inside the window.
    product('0000000000024', '1 kg', { sellerSku: 'CLEAN-90d', seenOn: daysAgo(90) }),
    // C3: in stock, and no stock claim.
    product('0000000000031', '1 kg', { sellerSku: 'CLEAN-instock', inStock: 1 }),
    product('0000000000032', '1 kg', { sellerSku: 'CLEAN-nostockclaim', inStock: null }),
    // C4: 4.9x the median is not over 5x.
    product('0000000000040', '1 kg', { sellerSku: 'CLEAN-4a', seller: 's1', priceCents: 1000 }),
    product('0000000000040', '1 kg', { sellerSku: 'CLEAN-4b', seller: 's2', priceCents: 1000 }),
    product('0000000000040', '1 kg', { sellerSku: 'CLEAN-4c', seller: 's3', priceCents: 1000 }),
    product('0000000000040', '1 kg', { sellerSku: 'CLEAN-4d', seller: 's4', priceCents: 4900 }),
    // C5: exactly $2,000.00, seen on the as-of day.
    product('0000000000050', '1 kg', { sellerSku: 'CLEAN-2000', priceCents: 200_000, seenOn: AS_OF }),
    // C6: stored unit price 1.9x what price / size gives is inside the 2x band.
    product('0000000000055', '500 g', { sellerSku: 'CLEAN-unit19', sellerName: 'Acme Oats 500 g', priceCents: 1000, unitPriceCents: 380, unitPricePer: '100g' }),
    // C7: a sale price far under its product's regular prices is not an outlier (sales are left out).
    product('0000000000060', '1 kg', { sellerSku: 'CLEAN-60a', seller: 's1', priceCents: 1000 }),
    product('0000000000060', '1 kg', { sellerSku: 'CLEAN-60b', seller: 's2', priceCents: 1000 }),
    product('0000000000060', '1 kg', { sellerSku: 'CLEAN-60c', seller: 's3', priceCents: 1000 }),
    product('0000000000060', '1 kg', { sellerSku: 'CLEAN-60sale', seller: 's4', priceCents: 100, kind: 'promotional' }),
    // C8: an ordinary unjoined row: no code, join none.
    row({ sellerSku: 'CLEAN-unjoined', sellerName: 'Mystery Item 1 kg', joinMethod: 'none', code: null }),
    // C9: a US row in USD is consistent.
    product('0000000000070', '1 kg', { sellerSku: 'CLEAN-us', country: 'US', currency: 'USD' }),
  ];

  const planted = [
    product('0000000000101', '1 kg', { sellerSku: 'PLANT-D1', seenOn: daysAgo(91) }),
    product('0000000000102', '1 kg', { sellerSku: 'PLANT-D2', inStock: 0 }),
    // D3: name-joined, the seller's name says 398 mL, the catalogue says 796 mL; and one whose size agrees.
    (catalogue.set('0000000000103', '796 mL'), row({ code: '0000000000103', sellerSku: 'PLANT-D3', sellerName: 'Acme Beans 398 mL', joinMethod: 'name' })),
    product('0000000000104', '398 mL', { sellerSku: 'PLANT-D3-MATCH', joinMethod: 'name' }),
    // D4: three ordinary prices and one 8x the median.
    product('0000000000105', '1 kg', { sellerSku: 'CLEAN-105a', seller: 's1', priceCents: 1000 }),
    product('0000000000105', '1 kg', { sellerSku: 'CLEAN-105b', seller: 's2', priceCents: 1100 }),
    product('0000000000105', '1 kg', { sellerSku: 'CLEAN-105c', seller: 's3', priceCents: 1050 }),
    product('0000000000105', '1 kg', { sellerSku: 'PLANT-D4', seller: 's4', priceCents: 9000 }),
    // D5, one row per class.
    product('0000000000106', '1 kg', { sellerSku: 'PLANT-D5-NEG', priceCents: 0 }),
    product('0000000000107', '1 kg', { sellerSku: 'PLANT-D5-FRAC', priceCents: 1234.5 }),
    product('0000000000108', '1 kg', { sellerSku: 'PLANT-D5-BIG', priceCents: 200_001 }),
    product('0000000000109', '1 kg', { sellerSku: 'PLANT-D5-FUT', seenOn: '2026-11-12' }),
    product('0000000000110', '1 kg', { sellerSku: 'PLANT-D5-DATE', seenOn: 'not a date' }),
    product('0000000000111', '1 kg', { sellerSku: 'PLANT-D5-USD', currency: 'USD', country: 'CA' }),
    row({ sellerSku: 'PLANT-D5-NOCODE', sellerName: 'Acme Thing 1 kg', code: null, joinMethod: 'gtin' }),
    // D6: the exact duplicate is made below (the real schema's key refuses it); and the same price under another sku.
    product('0000000000113', '1 kg', { sellerSku: 'PLANT-D6', priceCents: 500 }),
    product('0000000000114', '1 kg', { sellerSku: 'PLANT-D6B-1', priceCents: 500 }),
    product('0000000000114', '1 kg', { sellerSku: 'PLANT-D6B-2', priceCents: 500 }),
    // D7: 4x.
    product('0000000000115', '500 g', { sellerSku: 'PLANT-D7', sellerName: 'Acme Oats 500 g', priceCents: 1000, unitPriceCents: 800, unitPricePer: '100g' }),
    // D8: a priced code the catalogue lacks, and a barcode-joined row whose size contradicts the catalogue.
    row({ code: '0000000000116', sellerSku: 'PLANT-D8A', sellerName: 'Acme Mystery 1 kg' }),
    (catalogue.set('0000000000117', '250 g'), row({ code: '0000000000117', sellerSku: 'PLANT-D8B', sellerName: 'Acme Tea 100 g' })),
  ];

  const build = (path, rows, withDuplicate) => {
    const db = openPrices(path);
    for (const r of rows) recordObservation(db, r);
    if (withDuplicate) {
      // The real key is (seller, seller_sku, seen_on), so an exact duplicate cannot be recorded: rebuild the
      // table without its key, as an older or hand-made file would be, and copy one row.
      db.exec('CREATE TABLE observation_nopk AS SELECT * FROM observation');
      db.exec('DROP TABLE observation');
      db.exec('ALTER TABLE observation_nopk RENAME TO observation');
      db.prepare("INSERT INTO observation SELECT * FROM observation WHERE seller_sku = 'PLANT-D6'").run();
    }
    db.close();
  };
  build(plantedDb, [...clean, ...planted], true);
  build(cleanDb, clean, false);

  const cat = new DatabaseSync(catalogueDb);
  cat.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT)');
  const ins = cat.prepare('INSERT INTO product (code, name, quantity) VALUES (?, ?, ?)');
  for (const [code, size] of catalogue) ins.run(code, `Catalogue ${code}`, size);
  cat.close();
});

after(() => rmSync(dir, { recursive: true, force: true }));

function check(prices, withCatalogue) {
  const p = new DatabaseSync(prices, { readOnly: true });
  const c = withCatalogue ? new DatabaseSync(catalogueDb, { readOnly: true }) : null;
  try {
    return runChecks(p, { asOf: AS_OF, maxExamples: 1000, catalogue: c });
  } finally {
    p.close();
    c?.close();
  }
}

const rule = (run, id) => run.rules.find((r) => r.id === id);
const skus = (run, id, bucket) => rule(run, id).buckets.find((b) => b.id === bucket).examples.map((e) => e.sku).sort();

test('every rule fires on exactly its planted row, and on no clean row', () => {
  const run = check(plantedDb, true);
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.rules.map((r) => r.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']);

  assert.deepEqual(skus(run, 'D1', 'stale_read'), ['PLANT-D1']);
  assert.deepEqual(skus(run, 'D2', 'out_of_stock_used'), ['PLANT-D2']);
  assert.deepEqual(skus(run, 'D3', 'size_mismatch'), ['PLANT-D3']);
  assert.deepEqual(skus(run, 'D3', 'size_match'), ['PLANT-D3-MATCH']);
  assert.deepEqual(skus(run, 'D4', 'too_high'), ['PLANT-D4']);
  assert.deepEqual(skus(run, 'D4', 'too_low'), []);
  for (const [bucket, sku] of [
    ['price_not_positive', 'PLANT-D5-NEG'],
    ['price_not_whole', 'PLANT-D5-FRAC'],
    ['price_over_2000', 'PLANT-D5-BIG'],
    ['seen_future', 'PLANT-D5-FUT'],
    ['seen_unparseable', 'PLANT-D5-DATE'],
    ['currency_not_cad', 'PLANT-D5-USD'],
    ['missing_code', 'PLANT-D5-NOCODE'],
  ]) {
    assert.deepEqual(skus(run, 'D5', bucket), [sku], `D5 ${bucket}`);
  }
  assert.deepEqual(skus(run, 'D6', 'exact'), ['PLANT-D6']);
  assert.deepEqual(skus(run, 'D6', 'other_sku'), ['PLANT-D6B-2']);
  assert.deepEqual(skus(run, 'D7', 'unit_price_disagrees'), ['PLANT-D7']);
  assert.deepEqual(skus(run, 'D8', 'not_in_catalogue'), ['PLANT-D8A']);
  assert.deepEqual(skus(run, 'D8', 'size_disagrees'), ['PLANT-D8B']);
});

test('the headline counts are the planted rows, nothing more, and no clean row is flagged by anything', () => {
  const run = check(plantedDb, true);
  const counts = Object.fromEntries(run.rules.map((r) => [r.id, r.count]));
  // D3 headline = every name-joined row (the two planted); D5 = the seven classes; D6 headline = the exact duplicate; D8 = two.
  assert.deepEqual(counts, { D1: 1, D2: 1, D3: 2, D4: 1, D5: 6, D6: 1, D7: 1, D8: 2 });
  for (const r of run.rules) {
    for (const b of r.buckets) {
      for (const e of b.examples) {
        assert.ok(!e.sku.startsWith('CLEAN-') || b.id === 'older_than_window_all' || b.id === 'beyond_horizon', `${r.id} ${b.id} flagged clean row ${e.sku}`);
      }
    }
  }
  const d1 = rule(run, 'D1');
  assert.equal(d1.total, run.totalRows);
  assert.ok(Math.abs(d1.share - 1 / run.totalRows) < 1e-12);
  // Used-by-verdicts is labelled on every rule, and a citation comes with it.
  for (const r of run.rules) {
    assert.ok(['yes', 'no', 'partly'].includes(r.usedByVerdicts));
    assert.ok(r.usedWhy.some((w) => /\.ts:\d+/.test(w)), `${r.id} cites no file:line`);
  }
});

test('the planted rows land in the right D3 size class and the 90-day boundary holds', () => {
  const run = check(plantedDb, true);
  const d1all = skus(run, 'D1', 'older_than_window_all');
  assert.ok(d1all.includes('PLANT-D1'));
  assert.ok(!d1all.includes('CLEAN-90d'), 'a row exactly 90 days old is inside the window');
});

test('without a catalogue D8 does not run and D3 says it could not split by size', () => {
  const run = check(plantedDb, false);
  assert.deepEqual(run.errors, []);
  assert.equal(rule(run, 'D8'), undefined);
  assert.deepEqual(skus(run, 'D3', 'size_unchecked'), ['PLANT-D3', 'PLANT-D3-MATCH']);
  assert.deepEqual(skus(run, 'D3', 'size_mismatch'), []);
});

test('a file with only the clean rows reports zero on every counted rule', () => {
  const run = check(cleanDb, true);
  for (const r of run.rules) assert.equal(r.count, 0, `${r.id} fired on clean rows: ${JSON.stringify(r.examples)}`);
  assert.equal(exitCodeFor(run).code, 0);
});

/* ------------------------------------------------------------------ the command line */

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function cli(args) {
  return spawnSync(process.execPath, ['--no-warnings', RUN, ...args], { encoding: 'utf8' });
}

test('exit 1 on impossible values, with report.md and findings.jsonl written, and the prices file left byte-identical', () => {
  const out = join(dir, 'out-planted');
  const before = sha(plantedDb);
  const r = cli(['--prices', plantedDb, '--catalogue', catalogueDb, '--out', out, '--as-of', AS_OF]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /D5 impossible values: 6/);
  assert.equal(sha(plantedDb), before, 'the prices file changed');
  const report = readFileSync(join(out, 'report.md'), 'utf8');
  for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) assert.match(report, new RegExp(`## ${id}\\.`));
  assert.match(report, /Used by verdicts: \*\*(yes|no|partly)\*\*/);
  const lines = readFileSync(join(out, 'findings.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.rule === 'D3' && l.bucket === 'size_mismatch' && l.count === 1));
});

test('exit 0 on a file with no impossible values', () => {
  const r = cli(['--prices', cleanDb, '--catalogue', catalogueDb, '--out', join(dir, 'out-clean'), '--as-of', AS_OF]);
  assert.equal(r.status, 0, r.stderr);
});

test('exit 1 when the prices file is missing, empty, or has no observation table', () => {
  const missing = cli(['--prices', join(dir, 'nope.db'), '--out', join(dir, 'o1')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /does not exist/);

  const emptyPath = join(dir, 'empty.db');
  openPrices(emptyPath).close();
  const empty = cli(['--prices', emptyPath, '--out', join(dir, 'o2'), '--as-of', AS_OF]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /zero rows/);

  const bareDb = join(dir, 'bare.db');
  new DatabaseSync(bareDb).close();
  const bare = cli(['--prices', bareDb, '--out', join(dir, 'o3'), '--as-of', AS_OF]);
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, /no observation table/);
});

test('exit 1 when a rule throws (a catalogue with no product table)', () => {
  const badCat = join(dir, 'badcat.db');
  const c = new DatabaseSync(badCat);
  c.exec('CREATE TABLE other (x TEXT)');
  c.close();
  const r = cli(['--prices', cleanDb, '--catalogue', badCat, '--out', join(dir, 'o4'), '--as-of', AS_OF]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /threw/);
  assert.equal(exitCodeFor({ asOf: AS_OF, totalRows: 5, hasCatalogue: false, rules: [], errors: [{ rule: 'D9', error: 'boom' }] }).code, 1);
});

test('refuses to write the report into a folder called data, and a bad date is a usage error', () => {
  const inData = join(dir, 'data', 'out');
  const r = cli(['--prices', cleanDb, '--out', inData, '--as-of', AS_OF]);
  assert.equal(r.status, 2);
  assert.equal(existsSync(join(dir, 'data')), false);
  const bad = cli(['--prices', cleanDb, '--as-of', 'yesterday']);
  assert.equal(bad.status, 2);
  mkdirSync(join(dir, 'unused'), { recursive: true });
});
