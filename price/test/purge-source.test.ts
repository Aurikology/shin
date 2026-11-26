/**
 * purge-source: deletes one source's price and catalogue rows and nothing else; refuses a real run
 * without --yes; --dry-run counts and changes nothing. Temp databases throughout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { openCatalogue, rebuildFts, toVecBlob, EMBED_DIM } from '../../catalogue/src/schema.ts';
import { purgeSource } from '../src/purge-source.ts';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null, seller: 'Walmart', sellerSku: `sku-${sku}`, sellerName: 'Thing', sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null, ...over,
  };
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-'));
  const pricesPath = join(dir, 'prices.db');
  const cataloguePath = join(dir, 'catalogue.db');
  const p = openPrices(pricesPath);
  for (let i = 0; i < 4; i++) recordObservation(p, obs({ code: `100000000000${i}`, seller: 'Kroger', priceCents: 300 + i }));
  recordObservation(p, obs({ code: '1000000000009', seller: 'kroger-names', priceCents: 111 }));
  for (let i = 0; i < 3; i++) recordObservation(p, obs({ code: `200000000000${i}`, seller: 'Walmart', priceCents: 700 + i }));
  recordObservation(p, obs({ code: '3000000000000', seller: 'hammer', priceCents: 900 }));
  p.close();
  const c = openCatalogue(cataloguePath);
  const ins = c.prepare('INSERT INTO product (code, name, name_en, brands, source, category_path) VALUES (?,?,?,?,?,?)');
  const vec = c.prepare('INSERT INTO product_vec (rowid, embedding) VALUES (?, ?)');
  const rows: [string, string, string][] = [
    ['1000000000000', 'Kroger Cola', 'kroger-names'],
    ['1000000000001', 'Kroger Chips', 'kroger-names'],
    ['2000000000000', 'Plain Cola', 'openfoodfacts'],
    ['2000000000001', 'Icecat Phone', 'icecat'],
  ];
  for (const [code, name, source] of rows) {
    const r = ins.run(code, name, name, 'Brand', source, '[]');
    const v = new Float32Array(EMBED_DIM);
    v[0] = 1;
    vec.run(BigInt(r.lastInsertRowid), toVecBlob(v));
  }
  rebuildFts(c);
  c.close();
  return { dir, pricesPath, cataloguePath };
}

const counts = (path: string) => {
  const p = openPrices(path);
  const bySeller = Object.fromEntries((p.prepare('SELECT seller, count(*) AS n FROM observation GROUP BY seller').all() as { seller: string; n: number }[]).map((r) => [r.seller, Number(r.n)]));
  const log = (p.prepare("SELECT count(*) AS n FROM observation_log WHERE lower(seller) IN ('kroger', 'kroger-names')").get() as { n: number }).n;
  p.close();
  return { bySeller, log: Number(log) };
};
const catCounts = (path: string) => {
  const c = openCatalogue(path);
  const out = {
    bySource: Object.fromEntries((c.prepare('SELECT source, count(*) AS n FROM product GROUP BY source').all() as { source: string; n: number }[]).map((r) => [r.source, Number(r.n)])),
    vec: Number((c.prepare('SELECT count(*) AS n FROM product_vec').get() as { n: number }).n),
    ftsKroger: Number((c.prepare("SELECT count(*) AS n FROM product_fts WHERE product_fts MATCH 'kroger'").get() as { n: number }).n),
    ftsCola: Number((c.prepare("SELECT count(*) AS n FROM product_fts WHERE product_fts MATCH 'cola'").get() as { n: number }).n),
  };
  c.close();
  return out;
};

test('a real purge of kroger deletes its price and catalogue rows, and only those', () => {
  const f = fixture();
  try {
    const before = counts(f.pricesPath);
    assert.equal(before.bySeller.Kroger, 4);
    assert.ok(before.log >= 5, 'the keep-everything log holds copies');
    const report = purgeSource({ source: 'kroger', pricesPath: f.pricesPath, cataloguePath: f.cataloguePath, dryRun: false, yes: true });
    assert.equal(report.prices!.before.observation, 5);
    assert.equal(report.prices!.after.observation, 0);
    assert.equal(report.prices!.totals.before.observation, 9);
    assert.equal(report.prices!.totals.after.observation, 4);
    assert.equal(report.catalogue!.before.product, 2);
    assert.equal(report.catalogue!.after.product, 0);
    const after = counts(f.pricesPath);
    assert.deepEqual(after.bySeller, { Walmart: 3, hammer: 1 });
    assert.equal(after.log, 0, 'the log copies of the source are gone too');
    const cat = catCounts(f.cataloguePath);
    assert.deepEqual(cat.bySource, { openfoodfacts: 1, icecat: 1 });
    assert.equal(cat.vec, 2, 'the purged rows vectors went with them; the others stay');
    assert.equal(cat.ftsKroger, 0, 'the search index forgot the purged names');
    assert.equal(cat.ftsCola, 1, 'and still finds the other source');
    // The append-only guard is back: a later delete from the log is refused again.
    const p = openPrices(f.pricesPath);
    assert.throws(() => p.exec('DELETE FROM observation_log'), /append-only/);
    p.close();
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('dry run prints the counts and changes nothing', () => {
  const f = fixture();
  try {
    const p0 = counts(f.pricesPath);
    const c0 = catCounts(f.cataloguePath);
    const r = purgeSource({ source: 'kroger', pricesPath: f.pricesPath, cataloguePath: f.cataloguePath, dryRun: true, yes: false });
    assert.equal(r.prices!.before.observation, 5);
    assert.equal(r.prices!.after.observation, 5);
    assert.equal(r.catalogue!.after.product, 2);
    assert.deepEqual(counts(f.pricesPath), p0);
    assert.deepEqual(catCounts(f.cataloguePath), c0);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('a real run without --yes refuses and changes nothing; an unknown source is refused', () => {
  const f = fixture();
  try {
    const p0 = counts(f.pricesPath);
    assert.throws(() => purgeSource({ source: 'kroger', pricesPath: f.pricesPath, cataloguePath: f.cataloguePath, dryRun: false, yes: false }), /--yes/);
    assert.throws(() => purgeSource({ source: 'krogr', pricesPath: f.pricesPath, dryRun: false, yes: true }), /not a known source/);
    assert.throws(() => purgeSource({ source: 'kroger', dryRun: true, yes: false }), /--prices/);
    assert.deepEqual(counts(f.pricesPath), p0);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('purging hammer touches no other seller and no catalogue row of another source', () => {
  const f = fixture();
  try {
    purgeSource({ source: 'hammer', pricesPath: f.pricesPath, cataloguePath: f.cataloguePath, dryRun: false, yes: true });
    assert.deepEqual(counts(f.pricesPath).bySeller, { Kroger: 4, 'kroger-names': 1, Walmart: 3 });
    assert.deepEqual(catCounts(f.cataloguePath).bySource, { 'kroger-names': 2, openfoodfacts: 1, icecat: 1 });
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('the command line: refuses without --yes (exit 1), counts with --dry-run, deletes with --yes', () => {
  const f = fixture();
  try {
    const run = (...a: string[]) => spawnSync(process.execPath, [new URL('../src/purge-source.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'kroger', '--prices', f.pricesPath, '--catalogue', f.cataloguePath, ...a], { encoding: 'utf8' });
    const refused = run();
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--yes/);
    assert.equal(counts(f.pricesPath).bySeller.Kroger, 4);
    const dry = run('--dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /prices observation: 5 rows of this source before, 5 after/);
    assert.equal(counts(f.pricesPath).bySeller.Kroger, 4);
    const real = run('--yes');
    assert.equal(real.status, 0, real.stderr);
    assert.match(real.stdout, /prices observation: 5 rows of this source before, 0 after/);
    assert.equal(counts(f.pricesPath).bySeller.Kroger, undefined);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
