/**
 * Tests added after the second audit (2026-09-28). Each one kills a mutant
 * that survived, or pins a rule the boss decided.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadObservations, type Observation } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey, keyExclusions, type PredictionItem } from '../src/keys.ts';
import { groupHash, isFold, splitByProduct, splitByTime, type Fold } from '../src/split.ts';
import { assertSameItems, evaluate, freezeAnswer, overallVerdict, ownPricesIndex, queryOrder, trainingDatabase, type Model, type ModelRun } from '../src/harness.ts';
import { createSealed, guardSealed, logPathFor } from '../src/sealed.ts';
import { categoryRangeModel } from '../src/baselines.ts';
import { scoreAll, SKIP_INTERVAL_SCORE, type Interval } from '../src/score.ts';
import { writeResult } from '../src/results.ts';
import { catalogueDb, FAKE_GIT, fixtureRow, noSealed, pricesDb, products, NEW, OLD, SALE_DAY } from './fixture.ts';

function setup() {
  const obs = loadObservations(pricesDb());
  const pred = buildPredictionKey(obs);
  const sales = buildSaleKey(obs);
  const byProduct = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1) as Fold;
  const byTime = splitByTime(obs, sales, noSealed()) as Fold;
  return { obs, pred, sales, byProduct, byTime, catalogue: catalogueDb() };
}

function truthRange(pred: readonly PredictionItem[]): Map<string, Interval> {
  const m = new Map<string, Interval>();
  for (const p of pred) {
    const c = p.points.map((x) => x.cents).sort((a, b) => a - b);
    m.set(p.key, { lowCents: c[0]!, highCents: c[c.length - 1]!, midCents: c[1]! });
  }
  return m;
}

/* --------------------------------------------------------- calibration */

test('overall calibration is two-sided: a range holding every price while claiming 50% fails', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const model: Model = { name: 'over_cover', description: '', claimedCoverage: 0.5, runnable: true, fit: () => (q) => truth.get(q.key) ?? null };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.scores!.hitRate, 1);
  assert.ok(run.gate!.failures.includes('calibration'), JSON.stringify(run.gate!.failures));
});

/* ------------------------------------------------------------ sale check */

test('a skipped sale does not read low', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const model: Model = { name: 'skip_sales', description: '', claimedCoverage: 1, runnable: true, fit: () => (q) => (q.asOf === SALE_DAY ? null : truth.get(q.key) ?? null) };
  const run = evaluate(model, byProduct, { catalogue });
  assert.ok(run.scores!.sale.items > 0);
  assert.equal(run.scores!.sale.saleLowRate, 0);
  assert.ok(run.gate!.failures.includes('sale_low'));
});

/* ------------------------------------------------------ own-price index */

test('own-price index counts regular prices only: a sale-only shop does not make a third shop', () => {
  const row = (shop: string, isSale: boolean): Observation =>
    ({ key: '1', shop, seenOn: OLD, isSale, cents: 100 }) as unknown as Observation;
  const idx = ownPricesIndex([row('A|', false), row('B|', false), row('C|', true)]);
  assert.equal(idx('1', NEW), false);
  const idx3 = ownPricesIndex([row('A|', false), row('B|', false), row('C|', false)]);
  assert.equal(idx3('1', NEW), true);
});

/* ------------------------------------------------------------ query order */

test('the query order is seeded by the run, never by the model, and mixes price and sale queries', () => {
  const { byProduct, catalogue } = setup();
  const orders: string[][] = [];
  for (const name of ['a', 'a much longer model name']) {
    const seen: string[] = [];
    const spy: Model = { name, description: '', claimedCoverage: 0.5, runnable: true, fit: () => (q) => (seen.push(`${q.key}|${q.asOf}`), null) };
    evaluate(spy, byProduct, { catalogue, seed: 5 });
    orders.push(seen);
  }
  assert.deepEqual(orders[0], orders[1]);
  const kinds = queryOrder(byProduct, 5).map((q) => q.kind).join('');
  const sorted = [...kinds].sort().join('');
  assert.notEqual(kinds, sorted, 'queries were not shuffled');
});

/* --------------------------------------------------------------- answers */

test('answers are frozen plain numbers: getters, proxies and class instances are refused', () => {
  assert.deepEqual(freezeAnswer({ lowCents: 1, highCents: 2, midCents: 1 }, 'm'), { lowCents: 1, highCents: 2, midCents: 1 });
  assert.equal(freezeAnswer(null, 'm'), null);
  assert.throws(() => freezeAnswer({ get lowCents() { return 1; }, highCents: 2, midCents: 1 }, 'm'), /getter/);
  assert.throws(() => freezeAnswer(new Proxy({ lowCents: 1, highCents: 2, midCents: 1 }, {}), 'm'), /plain object/);
  class Iv { lowCents = 1; highCents = 2; midCents = 1; }
  assert.throws(() => freezeAnswer(new Iv(), 'm'), /plain object/);
  assert.throws(() => freezeAnswer({ lowCents: '1', highCents: 2, midCents: 1 }, 'm'), /not a number/);
  const src = { lowCents: 1, highCents: 2, midCents: 1 };
  const f = freezeAnswer(src, 'm')!;
  src.lowCents = 99;
  assert.equal(f.lowCents, 1);
});

test('a deferred answer (fields resolved after later queries) is refused by the harness', () => {
  const { byProduct, catalogue } = setup();
  const model: Model = {
    name: 'deferred',
    description: '',
    claimedCoverage: 0.5,
    runnable: true,
    fit: () => () => ({ get lowCents() { return 1; }, get highCents() { return 2; }, get midCents() { return 1; } }) as Interval,
  };
  assert.throws(() => evaluate(model, byProduct, { catalogue }), /getter/);
  const claimGetter = { name: 'g', description: '', runnable: true, fit: () => () => null, get claimedCoverage() { return 0.5; } } as Model;
  assert.throws(() => evaluate(claimGetter, byProduct, { catalogue }), /claimedCoverage/);
});

test('a model sees only the canonical key, never a shop spelling of the barcode', () => {
  const { byTime, catalogue } = setup();
  const codes: string[] = [];
  const spy: Model = { name: 'spy', description: '', claimedCoverage: 0.5, runnable: true, fit: () => (q) => (codes.push(q.code), assert.equal(q.code, q.key), null) };
  evaluate(spy, byTime, { catalogue });
  assert.ok(codes.length > 0);
  assert.ok(codes.every((c) => !c.startsWith('0')), 'a leading-zero (shop B, EAN-13) spelling reached the model');
});

/* ------------------------------------------------------------ by time */

test('by time: sales are scored only for products present in training', () => {
  const extra = ['A', 'B', 'C'].map((seller) => fixtureRow({ code: '9990000000017', seller, sellerSku: `${seller}-new`, priceCents: 500, seenOn: NEW }));
  extra.push(fixtureRow({ code: '9990000000017', seller: 'A', sellerSku: 'A-new', priceCents: 300, seenOn: SALE_DAY, kind: 'promotional' }));
  const obs = loadObservations(pricesDb({ extra }));
  const f = splitByTime(obs, buildSaleKey(obs), noSealed());
  assert.ok(isFold(f));
  assert.ok(f.testSales.length > 0);
  assert.equal(f.testSales.some((s) => s.key === '9990000000017'), false);
});

test('by product: a product seen only on sale is held out as a whole', () => {
  const extra = [fixtureRow({ code: '8880000000012', seller: 'A', sellerSku: 'A-s', priceCents: 300, seenOn: SALE_DAY, kind: 'promotional' })];
  const obs = loadObservations(pricesDb({ extra }));
  const pred = buildPredictionKey(obs);
  const sales = buildSaleKey(obs);
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, seed) as Fold;
    const inTest = f.testKeys.has('8880000000012');
    assert.equal(inTest, groupHash('8880000000012', seed) < 0.5, `seed ${seed}: the sale-only product was not put on its hashed side`);
    assert.equal(f.train.some((o) => o.key === '8880000000012'), !inTest);
    assert.equal(f.testSales.some((s) => s.key === '8880000000012'), inTest);
  }
});

/* -------------------------------------------------- flags and printout rows */

function a1Db(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE observation (code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL, country TEXT NOT NULL, region TEXT,
    join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, store_name TEXT, store_osm TEXT,
    was_cents INTEGER, is_sale INTEGER, flags TEXT, capture_tile_id INTEGER, price_verified INTEGER NOT NULL DEFAULT 0)`);
  const ins = db.prepare(`INSERT INTO observation VALUES ('061234567890', ?, ?, 'x', ?, ?, 'CAD', 'CA', NULL, 'gtin', ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`);
  // seller, sku, cents, kind, seen, was, is_sale, flags, tile, verified
  ins.run('A', 'a', 500, 'regular', '2026-09-20', null, 0, null, null, 0); // crawled, no tile: evidence
  ins.run('B', 'b', 510, 'regular', '2026-09-20', null, 0, null, null, 0);
  ins.run('C', 'c', 495, 'regular', '2026-09-20', null, 0, '[]', 7, 1); // printout, verified, empty flags: evidence
  ins.run('D', 'd', 100, 'regular', '2026-09-21', null, 0, '["multi_buy:5 for 500"]', 8, 1); // flagged
  ins.run('E', 'e', 505, 'regular', '2026-09-21', null, 0, null, 9, 0); // printout, not verified
  ins.run('A', 'a', 300, 'promotional', '2026-09-22', 450, 1, '["was_not_above_price"]', 10, 1); // flagged sale
  return db;
}

test('answer keys drop flagged rows and unverified printout rows, and count them', () => {
  const obs = loadObservations(a1Db());
  assert.equal(obs.length, 6);
  const pred = buildPredictionKey(obs);
  assert.deepEqual(pred.flatMap((p) => p.points.map((x) => x.seller)).sort(), ['A', 'B', 'C']);
  assert.equal(buildSaleKey(obs).length, 0);
  assert.deepEqual(keyExclusions(obs), { flagged: 2, unverified_printout: 1 });
});

test('the training database carries is_sale, was_cents, flags, capture_tile_id and price_verified', () => {
  const obs = loadObservations(a1Db());
  const db = trainingDatabase(obs);
  const r = db.prepare(`SELECT is_sale, was_cents, flags, capture_tile_id, price_verified FROM observation WHERE seller = 'A' AND kind = 'promotional'`).get() as Record<string, unknown>;
  assert.deepEqual({ ...r }, { is_sale: 1, was_cents: 450, flags: '["was_not_above_price"]', capture_tile_id: 10, price_verified: 1 });
});

/* --------------------------------------------------------- same items */

test('runs that were not asked the same items are refused', () => {
  const r = (h: string) => ({ ran: true, askedHash: h, fold: 'by_time' }) as ModelRun;
  assert.doesNotThrow(() => assertSameItems([r('x'), r('x')]));
  assert.throws(() => assertSameItems([r('x'), r('y')]), /not asked the same items/);
});

test('a baseline is itself compared with the other required baseline', () => {
  const { byTime, catalogue } = setup();
  const run = evaluate(categoryRangeModel(), byTime, { catalogue });
  assert.deepEqual(run.gate!.baselines.map((b) => b.baseline), ['category_median']);
});

/* ----------------------------------------------------------- sealed */

function withDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-seal2-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('configured path, no file: "none" only when git says no batch ever existed there', () => {
  withDir((dir) => {
    const path = join(dir, 'sealed.json');
    assert.throws(() => guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, history: () => 'existed' } }), /git history/);
    assert.throws(() => guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, history: () => 'unknown' } }), /--no-sealed/);
    assert.equal(guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, history: () => 'unknown' }, noSealed: true }).mode, 'none');
    assert.throws(() => guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, history: () => 'existed' }, noSealed: true }), /git history/);
    assert.equal(guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, history: () => 'never' } }).mode, 'none');
  });
});

test('any other path is refused while a batch exists, or once existed, at the configured path', () => {
  withDir((dir) => {
    const configured = join(dir, 'sealed.json');
    const other = join(dir, 'other.json');
    assert.equal(guardSealed(other, { configuredPath: configured, git: { ...FAKE_GIT, history: () => 'never' } }).mode, 'none');
    assert.throws(() => guardSealed(other, { configuredPath: configured, git: { ...FAKE_GIT, history: () => 'existed' } }), /git history/);
    createSealed(configured, ['111'], 'n', undefined, FAKE_GIT);
    assert.throws(() => guardSealed(other, { configuredPath: configured, git: { ...FAKE_GIT, history: () => 'never' } }), /configured path/);
  });
});

test('an opening already recorded in results/ is refused, even after the file and log are rebuilt', () => {
  withDir((dir) => {
    const path = join(dir, 'sealed.json');
    const results = join(dir, 'results');
    mkdirSync(results);
    createSealed(path, ['111', '222'], 'n', '2026-10-05', FAKE_GIT);
    const orig = readFileSync(path, 'utf8');
    const origLog = readFileSync(logPathFor(path), 'utf8');
    const g = guardSealed(path, { configuredPath: path, openSealed: true, write: true, resultsDir: results, git: FAKE_GIT });
    assert.equal(g.mode, 'opened');
    writeFileSync(join(results, 'baseline-2026-11-01.json'), JSON.stringify({ sealed: { mode: 'opened', keysSha256: g.mode === 'opened' ? g.keysSha256 : '' } }));
    // Quiet reuse: put the unopened file and log back, then open again.
    writeFileSync(path, orig);
    writeFileSync(logPathFor(path), origLog);
    assert.throws(() => guardSealed(path, { configuredPath: path, openSealed: true, write: true, resultsDir: results, git: FAKE_GIT }), /already records opening/);
  });
});

test('a CRLF checkout of the batch and its log is not an edit', () => {
  withDir((dir) => {
    const path = join(dir, 'sealed.json');
    createSealed(path, ['111'], 'n', undefined, FAKE_GIT);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'));
    writeFileSync(logPathFor(path), readFileSync(logPathFor(path), 'utf8').replace(/\n/g, '\r\n'));
    assert.equal(guardSealed(path, { configuredPath: path, git: FAKE_GIT }).mode, 'excluded');
  });
});

test('fixture products all have shop B spelling their barcode with a leading zero', () => {
  const obs = loadObservations(pricesDb());
  const b = obs.filter((o) => o.seller === 'B');
  assert.ok(b.length > 0 && b.every((o) => o.code!.startsWith('0') && o.key === o.code!.slice(1)));
  assert.equal(products().length, 30);
});

/* ------------------------------------------------------ overall verdict */

test('the overall verdict comes from the counting folds only: by product never changes it', () => {
  const run = (fold: 'by_time' | 'by_product' | 'sealed', pass: boolean) => ({ model: 'm', fold, ran: true, gate: { pass } }) as unknown as ModelRun;
  assert.equal(overallVerdict([run('by_time', true), run('by_product', false)]).get('m')!.pass, true);
  assert.equal(overallVerdict([run('by_time', false), run('by_product', true)]).get('m')!.pass, false);
  assert.equal(overallVerdict([run('by_time', true), run('sealed', false)]).get('m')!.pass, false);
  assert.equal(overallVerdict([run('by_product', true)]).get('m')!.pass, false, 'by product alone is not a verdict');
});

test('a model claiming other than 50% without a 50% band is not measured against category_range', () => {
  const { pred, byTime, catalogue } = setup();
  const truth = truthRange(pred);
  const model: Model = { name: 'no_band50', description: '', claimedCoverage: 0.9, runnable: true, fit: () => (q) => truth.get(q.key) ?? null };
  const run = evaluate(model, byTime, { catalogue });
  const vsRange = run.gate!.baselines.find((b) => b.baseline === 'category_range')!;
  assert.equal(vsRange.status, 'not_measured');
  assert.match(vsRange.note, /no 50% band/);
});

test('every compared quantity charges a skip the same fixed cost', () => {
  const sc = scoreAll([{ key: 'a', category: 'x', realCents: 100, interval: null }], [], 0.8);
  assert.equal(sc.perItem[0]!.is, SKIP_INTERVAL_SCORE);
  assert.equal(sc.perItem50[0]!.is, SKIP_INTERVAL_SCORE);
  assert.equal(sc.perItemMedian[0]!.is, SKIP_INTERVAL_SCORE);
});

test('the 50% band fields are frozen plain numbers too', () => {
  assert.throws(() => freezeAnswer({ lowCents: 1, highCents: 3, midCents: 2, get low50Cents() { return 1; }, high50Cents: 2 }, 'm'), /getter/);
  assert.throws(() => freezeAnswer({ lowCents: 1, highCents: 3, midCents: 2, low50Cents: '1', high50Cents: 2 }, 'm'), /not a number/);
  assert.deepEqual(freezeAnswer({ lowCents: 1, highCents: 3, midCents: 2, low50Cents: 1, high50Cents: 2 }, 'm'), { lowCents: 1, highCents: 3, midCents: 2, low50Cents: 1, high50Cents: 2 });
});

test('opening refuses when git history of the log cannot be searched', () => {
  withDir((dir) => {
    const path = join(dir, 'sealed.json');
    createSealed(path, ['111'], 'n', undefined, FAKE_GIT);
    assert.throws(() => guardSealed(path, { configuredPath: path, openSealed: true, write: true, git: { ...FAKE_GIT, openedInHistory: () => 'unknown' } }), /cannot search git history/);
    assert.throws(() => guardSealed(path, { configuredPath: path, openSealed: true, write: true, git: { ...FAKE_GIT, status: () => 'dirty' } }), /uncommitted changes/);
    assert.throws(() => guardSealed(path, { configuredPath: path, git: { ...FAKE_GIT, status: () => 'untracked' } }), /not committed/);
  });
});

test('a result that would land on an existing name is refused, never written over', () => {
  withDir((dir) => {
    const now = new Date('2026-10-05T12:00:00');
    const a = writeResult(dir, 'sealed-opened', { sealed: { mode: 'opened' } }, now);
    assert.throws(() => writeResult(dir, 'sealed-opened', { sealed: { mode: 'opened' } }, now), /EEXIST/);
    assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { sealed: { mode: 'opened' } });
  });
});
