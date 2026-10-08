/**
 * Part B of docs/category-safeguards-2026-10-08.md: the pain-point tests, written
 * BEFORE any fix, for the price half (B2 ladder, B4, B5, B6, B9). The catalogue
 * half (B1, B2 ring, B3, B7, B8) is in catalogue/test/category-pain-points.test.ts.
 *
 * HOW THIS FILE WORKS.
 *   - Each pain point is a `node:test` test marked `todo`, so every normal run
 *     lists it as open without failing the build. The fix's commit removes the
 *     `todo`. Set PAINPOINTS_STRICT=1 to run them as ordinary tests and watch
 *     them go red (that is how "red today for the stated reason" was checked).
 *   - Each pain point has a pass PREDICATE and two CONTROL tests that are NOT
 *     todo: a known-good case the predicate must pass and a known-bad case it
 *     must fail. A predicate that has never gone red is not a test
 *     (RULINGS.md, "Everything is an assumption until tested").
 *   - Where the code under test is not built yet, the test fixes the interface
 *     the build must meet (named in the test) and imports it dynamically INSIDE
 *     the test, so a missing module fails that one test, not the file.
 *
 * Nothing under price/src is edited by this file. Numbers 95%, 10% and half are
 * Claude's proposals (2026-10-07 chat), changeable on his word.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { priceRangeFor, type RangeInput, type RangeSources } from '../src/range.ts';
import { estimate, type EstimateDeps, type Zone, Z10 } from '../src/estimate.ts';
import { loadTaxonomy } from '../../catalogue/src/category-taxonomy.ts';
import type { Taxonomy } from '../../catalogue/src/category-taxonomy.ts';

/** Import a module that may not exist yet. A variable specifier keeps the typechecker from demanding it. */
const later = (path: string): Promise<unknown> => import(path);

const STRICT = process.env.PAINPOINTS_STRICT === '1';
/** `todo` text while the fix is unbuilt; false under PAINPOINTS_STRICT=1. */
const open = (reason: string): string | false => (STRICT ? false : reason);

const tax = loadTaxonomy(fileURLToPath(new URL('../../catalogue/test/fixtures/taxonomy-small.json', import.meta.url)));

/** A seeded generator, so every run draws the same numbers. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalDraw(rnd: () => number): number {
  let u = 0;
  while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: null,
    seller: 'Walmart',
    sellerSku: 'sku',
    sellerName: 'x',
    sellerBrand: null,
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

/* ------------------------------------------------------- B2, price ladder */

/*
 * B2 (ladder half). Parent fallback reads a non-parent.
 *
 * Interface the fix must meet: priceRangeFor(input, { prices, catalogue, taxonomy })
 * takes the taxonomy among its sources and uses the taxonomy parent of the leaf
 * as the parent rung, not the tag before the leaf in the stored path
 * (range.ts:434-435). Today `parent = path[idx - 1]`.
 * The ring half of B2 is in catalogue/test/category-pain-points.test.ts.
 */
const AS_OF = '2026-09-27';
const SELF = '0068100084245';
const BAD_SELF = ['en:cheeses', 'en:snacks', 'en:cheddar']; // the tag before the leaf is en:snacks: not a parent of cheddar
const GOOD_SELF = ['en:dairies', 'en:cheeses', 'en:cheddar']; // the tag before the leaf IS the taxonomy parent

function ladderWorld(selfPath: string[], others: { path: string[]; count: number }[]): RangeSources {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', '500 g', 500, 'g', JSON.stringify(selfPath), selfPath[selfPath.length - 1]!);
  let n = 0;
  for (const group of others) {
    for (let i = 0; i < group.count; i++) {
      n += 1;
      const code = String(1000 + n).padStart(13, '0');
      ins.run(code, 'other', '500 g', 500, 'g', JSON.stringify(group.path), group.path[group.path.length - 1]!);
      recordObservation(prices, obs({ code, sellerSku: `s${n}`, priceCents: 400 + n * 50 }));
    }
  }
  return { prices, catalogue };
}

const ladderInput = (selfPath: string[]): RangeInput => ({ barcode: SELF, size: '500 g', leafCategory: selfPath[selfPath.length - 1]!, categoryPath: selfPath, asOf: AS_OF });
// Five products under en:snacks (the position-read "parent") and five under en:cheeses (the taxonomy parent).
const OTHERS = [
  { path: ['en:snacks', 'en:chips'], count: 5 },
  { path: ['en:dairies', 'en:cheeses'], count: 5 },
];

type Ladder = (selfPath: string[]) => { basis: string; category?: string };

const realLadder: Ladder = (selfPath) => {
  const sources = { ...ladderWorld(selfPath, OTHERS), taxonomy: tax } as RangeSources & { taxonomy: Taxonomy };
  const r = priceRangeFor(ladderInput(selfPath), sources);
  return r.basis === 'leaf_category' || r.basis === 'parent_category' ? { basis: r.basis, category: r.category } : { basis: r.basis };
};
/** A reference that reads the taxonomy: the ladder over a path re-ordered so the taxonomy parent sits before the leaf. */
const taxonomyLadder: Ladder = (selfPath) => {
  const leaf = selfPath[selfPath.length - 1]!;
  const parent = [...selfPath].reverse().find((t) => t !== leaf && tax.isAncestor(t, leaf));
  const reordered = [...selfPath.filter((t) => t !== parent && t !== leaf), ...(parent ? [parent] : []), leaf];
  const r = priceRangeFor(ladderInput(reordered), ladderWorld(reordered, OTHERS));
  return r.basis === 'parent_category' ? { basis: r.basis, category: r.category } : { basis: r.basis };
};
/** Today's rule, as a stub: the tag before the leaf, whatever it is. */
const positionLadder: Ladder = (selfPath) => ({ basis: 'parent_category', category: selfPath[selfPath.length - 2]! });

function b2LadderHolds(ladder: Ladder, selfPath: string[]): boolean {
  const got = ladder(selfPath);
  return got.basis === 'parent_category' && typeof got.category === 'string' && tax.isAncestor(got.category, selfPath[selfPath.length - 1]!);
}

test('B2 ladder control: a ladder that reads the taxonomy passes on the fixture where the tag before the leaf is not the parent', () => {
  assert.equal(b2LadderHolds(taxonomyLadder, BAD_SELF), true);
  assert.equal(b2LadderHolds(taxonomyLadder, GOOD_SELF), true);
});
test('B2 ladder control: the position rule fails where the tag before the leaf is not the parent, and passes where it is', () => {
  assert.equal(b2LadderHolds(positionLadder, BAD_SELF), false);
  assert.equal(b2LadderHolds(positionLadder, GOOD_SELF), true, 'the good path is why nobody noticed');
});
test('B2: the parent rung of the range ladder is the taxonomy parent of the leaf', () => {
  assert.equal(b2LadderHolds(realLadder, GOOD_SELF), true, 'control inside the test: the real ladder passes the good path');
  assert.equal(b2LadderHolds(realLadder, BAD_SELF), true);
});

/* ------------------------------------------------------------- B4 and B5 */

/*
 * The planned price tree. Interface the fix must meet: price/src/price-tree.ts exports
 *   buildPriceTree(items, prices) => PriceTree
 *   items:  { code, name, brand, storeBrand, categoryPath }[]
 *   prices: { code, chain, cents }[]
 *   PriceTree: {
 *     pathsOf(code): string[][]                          every path the item sits on
 *     storeAdjustment(chainA, chainB): number | null     chainA's price level over chainB's, e.g. 1.2
 *     judge(code, shelfCents, chain?): 'good' | 'fair' | 'bad'
 *   }
 * (docs/price-category-plan-2026-10-02.md). Nothing in price/src builds it yet.
 */
interface TreeItem { code: string; name: string; brand: string; storeBrand: boolean; categoryPath: string[] }
interface TreePrice { code: string; chain: string; cents: number }
interface PriceTree {
  pathsOf(code: string): string[][];
  storeAdjustment(chainA: string, chainB: string): number | null;
  judge(code: string, shelfCents: number, chain?: string): string;
}
type BuildTree = (items: TreeItem[], prices: TreePrice[]) => PriceTree;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

/**
 * A small reference tree that meets the interface: one path per item, a chain
 * adjustment from items priced at both chains, and a verdict from the item's own
 * prices only (chain-adjusted to the first chain's level).
 */
const referenceTree: BuildTree = (items, prices) => {
  const byItem = new Map<string, TreePrice[]>();
  for (const p of prices) (byItem.get(p.code) ?? byItem.set(p.code, []).get(p.code)!).push(p);
  const level = (a: string, b: string): number | null => {
    const ratios: number[] = [];
    for (const rows of byItem.values()) {
      const pa = rows.find((r) => r.chain === a);
      const pb = rows.find((r) => r.chain === b);
      if (pa && pb) ratios.push(pa.cents / pb.cents);
    }
    return ratios.length >= 3 ? median(ratios) : null;
  };
  const home = prices[0]?.chain ?? '';
  return {
    pathsOf: (code) => [items.find((i) => i.code === code)?.categoryPath ?? []],
    storeAdjustment: (a, b) => level(a, b),
    judge: (code, shelf, chain) => {
      const rows = byItem.get(code) ?? [];
      const adj = chain && chain !== home ? level(home, chain) ?? 1 : 1;
      const centre = median(rows.map((r) => (r.chain === home ? r.cents : r.cents * (level(home, r.chain) ?? 1))));
      const x = shelf * adj;
      return x <= centre * 0.8 ? 'good' : x >= centre * 1.2 ? 'bad' : 'fair';
    },
  };
};

/** The design B4 names as the pain: store, region and season split the tree, so one item sits on one path per chain. */
const splitByChainTree: BuildTree = (items, prices) => ({
  pathsOf: (code) => {
    const base = items.find((i) => i.code === code)?.categoryPath ?? [];
    return [...new Set(prices.filter((p) => p.code === code).map((p) => p.chain))].map((c) => [...base, `chain:${c}`]);
  },
  storeAdjustment: () => null,
  judge: () => 'fair',
});

/* ------------------------------------------------------------------- B4 */

const B4_ITEMS: TreeItem[] = Array.from({ length: 12 }, (_, i) => ({
  code: `item${i}`,
  name: `Item ${i}`,
  brand: 'Brand',
  storeBrand: false,
  categoryPath: ['en:dairies', 'en:cheeses'],
}));
// Every item is priced at both chains, chain B about 20% above chain A.
const B4_PRICES: TreePrice[] = B4_ITEMS.flatMap((it, i) => [
  { code: it.code, chain: 'A', cents: 500 + i * 20 },
  { code: it.code, chain: 'B', cents: Math.round((500 + i * 20) * 1.2) },
]);

function b4Holds(build: BuildTree): boolean {
  const tree = build(B4_ITEMS, B4_PRICES);
  const onePath = B4_ITEMS.every((it) => tree.pathsOf(it.code).length === 1);
  const gap = tree.storeAdjustment('B', 'A');
  return onePath && typeof gap === 'number' && gap > 1.1 && gap < 1.3;
}

test('B4 control: a tree with one path per item and a chain adjustment passes the predicate', () => {
  assert.equal(b4Holds(referenceTree), true);
  assert.ok(Math.abs(referenceTree(B4_ITEMS, B4_PRICES).storeAdjustment('B', 'A')! - 1.2) < 0.02);
});
test('B4 control: a tree split by chain (two paths for an item priced at two chains, no adjustment) fails it', () => {
  assert.equal(splitByChainTree(B4_ITEMS, B4_PRICES).pathsOf('item0').length, 2);
  assert.equal(b4Holds(splitByChainTree), false);
});
test('B4: an item priced at two chains has exactly one path, and a store adjustment exists for the chain gap', async () => {
  const mod = (await later('../src/price-tree.ts')) as { buildPriceTree: BuildTree };
  assert.equal(b4Holds(mod.buildPriceTree), true);
});

/* ------------------------------------------------------------------- B5 */

const B5_ITEMS: TreeItem[] = Array.from({ length: 150 }, (_, i) => ({
  code: `it${i}`,
  name: `Item ${i}`,
  brand: 'Brand',
  storeBrand: i % 7 === 0,
  categoryPath: i % 2 ? ['en:dairies', 'en:cheeses'] : ['en:snacks', 'en:salty-snacks'],
}));

function b5Data(seed: number): { prices: TreePrice[]; changed: Set<string>; priced: TreePrice[] } {
  const rnd = mulberry32(seed);
  const base: TreePrice[] = [];
  for (const it of B5_ITEMS) {
    const level = 300 + Math.floor(rnd() * 1200);
    for (const chain of ['A', 'B', 'C']) base.push({ code: it.code, chain, cents: Math.round(level * (chain === 'A' ? 1 : chain === 'B' ? 1.1 : 0.95) * (0.97 + rnd() * 0.06)) });
  }
  // The second rebuild's data: a random 5% of the price rows move by 5 to 15 percent.
  const changed = new Set<string>();
  const next = base.map((p) => {
    if (rnd() >= 0.05) return p;
    changed.add(p.code);
    return { ...p, cents: Math.round(p.cents * (1 + (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.1))) };
  });
  return { prices: base, changed, priced: next };
}

/** Share of (item, shelf price) pairs, over items with no changed own price, that get the same verdict from both rebuilds. */
function b5Agreement(build: BuildTree, seed = 20261008): number {
  const { prices, changed, priced } = b5Data(seed);
  const first = build(B5_ITEMS, prices);
  const second = build(B5_ITEMS, priced);
  let same = 0;
  let total = 0;
  for (const it of B5_ITEMS) {
    if (changed.has(it.code)) continue;
    const own = prices.filter((p) => p.code === it.code && p.chain === 'A')[0]!.cents;
    for (const f of [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3]) {
      const shelf = Math.round(own * f);
      total += 1;
      if (first.judge(it.code, shelf, 'A') === second.judge(it.code, shelf, 'A')) same += 1;
    }
  }
  assert.ok(total > 500, 'the fixture leaves enough unaffected items to measure');
  return same / total;
}

/** A tree whose verdict lines move whenever ANY price changes: the pain B5 names. */
const globalDriftTree: BuildTree = (items, prices) => {
  let h = 0;
  for (const p of prices) h = (Math.imul(h, 31) + p.cents) >>> 0;
  const wobble = 0.8 + 0.4 * ((h % 1000) / 1000);
  const byItem = new Map<string, number[]>();
  for (const p of prices) (byItem.get(p.code) ?? byItem.set(p.code, []).get(p.code)!).push(p.cents);
  return {
    pathsOf: (code) => [items.find((i) => i.code === code)?.categoryPath ?? []],
    storeAdjustment: () => null,
    judge: (code, shelf) => {
      const centre = median(byItem.get(code) ?? [shelf]) * wobble;
      return shelf <= centre * 0.8 ? 'good' : shelf >= centre * 1.2 ? 'bad' : 'fair';
    },
  };
};

test('B5 control: a tree whose verdict reads only the item\'s own prices agrees with itself across rebuilds, above 95%', () => {
  assert.ok(b5Agreement(referenceTree) >= 0.95);
});
test('B5 control: a tree whose lines drift with every price change agrees under 95%, so the predicate can fail', () => {
  assert.ok(b5Agreement(globalDriftTree) < 0.95);
});
test('B5: two rebuilds on data differing by a random 5% of prices give the same shelf price the same verdict, for items with no new own prices, in 95%+ of cases', async () => {
  const mod = (await later('../src/price-tree.ts')) as { buildPriceTree: BuildTree };
  assert.ok(b5Agreement(mod.buildPriceTree) >= 0.95);
});

/* ------------------------------------------------------------------- B6 */

/*
 * B6. Category-only answers call ordinary prices good or bad.
 *
 * Measured on the real verdict function, `estimate` (price/src/estimate.ts, the
 * zone is zoneOf: good 20% under the centre, great 30% under, bad 20% over).
 * A category-only basis is an item with no own prices of its own, answered from
 * its leaf category. The fixture's category is widened until the verdict's own
 * p90/p10 is 1.5x (the target width), then ordinary (non-sale) shelf prices are
 * drawn from that same log-normal and each is placed by `estimate`.
 * Passes when 10% or fewer land good or great, and 10% or fewer land bad.
 * Derived expectation for today's 20% lines: about 8% good, 12.5% bad.
 */
const LEAF = ['en:beverages', 'en:spirits', 'en:vodkas'];
const B6_ITEM = '0626990000001';

function b6Deps(spread: number): EstimateDeps {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run(B6_ITEM, 'Own Vodka', 'Own Vodka', null, '750 ml', 750, 'ml', JSON.stringify(LEAF), 'en:vodkas');
  [-1.2, -0.6, 0, 0.6, 1.2].forEach((z, i) => {
    const code = `10000000000${i}`;
    ins.run(code, `Vodka ${i}`, `Vodka ${i}`, `B${i}`, '750 ml', 750, 'ml', JSON.stringify(LEAF), 'en:vodkas');
    recordObservation(prices, obs({ code, seller: `shop${i}`, sellerSku: `sku${i}`, priceCents: Math.round(2500 * Math.exp(spread * z)) }));
  });
  return { prices, catalogue };
}
const b6Item = () => ({ barcode: B6_ITEM, asOf: '2026-09-30', currency: 'CAD', country: 'CA' });

/** Widen the fixture until the verdict's p90/p10 is the target. Returns deps and the verdict's own centre and sigma. */
async function categoryAt(target: number): Promise<{ deps: EstimateDeps; centre: number; sigma: number }> {
  let lo = 0.01;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = (await estimate(b6Item(), null, b6Deps(mid))).verdict;
    if (v.p90Cents / v.p10Cents < target) lo = mid;
    else hi = mid;
  }
  const deps = b6Deps((lo + hi) / 2);
  const { verdict } = await estimate(b6Item(), null, deps);
  assert.equal(verdict.basis, 'leaf_category', 'precondition: the answer is category-only');
  assert.ok(Math.abs(verdict.p90Cents / verdict.p10Cents - target) < 0.03 * target, `precondition: width is ${target}x, got ${verdict.p90Cents / verdict.p10Cents}`);
  return { deps, centre: verdict.centreCents, sigma: verdict.sigmaLog };
}

type Lines = { greatPct: number; goodPct: number; badPct: number } | undefined;

/** The share of ordinary shelf prices called good-or-great, and the share called bad, by the real verdict function. */
async function b6Shares(lines: Lines): Promise<{ goodOrGreat: number; bad: number }> {
  const { deps, centre, sigma } = await categoryAt(1.5);
  const rnd = mulberry32(20261008);
  const N = 1500;
  let nice = 0;
  let bad = 0;
  for (let i = 0; i < N; i++) {
    const cents = Math.max(1, Math.round(centre * Math.exp(sigma * normalDraw(rnd))));
    const zone: Zone = (await estimate(b6Item(), { cents, ...(lines ? { thresholds: lines } : {}) }, deps)).verdict.shopper!.zone;
    if (zone === 'good' || zone === 'great') nice += 1;
    else if (zone === 'bad') bad += 1;
  }
  return { goodOrGreat: nice / N, bad: bad / N };
}

const b6Passes = (s: { goodOrGreat: number; bad: number }) => s.goodOrGreat <= 0.1 && s.bad <= 0.1;

test('B6 control: lines wide enough for a 1.5x category (great 45%, good 25%, bad 30%) pass the predicate', async () => {
  const s = await b6Shares({ greatPct: 45, goodPct: 25, badPct: 30 });
  assert.equal(b6Passes(s), true, JSON.stringify(s));
});
test('B6 control: lines of 10% fail it, so the predicate can go red', async () => {
  const s = await b6Shares({ greatPct: 20, goodPct: 10, badPct: 10 });
  assert.equal(b6Passes(s), false, JSON.stringify(s));
});
test('B6: on ordinary prices with a category-only basis at 1.5x width, 10% or fewer are called good or great and 10% or fewer bad', async () => {
  const s = await b6Shares(undefined);
  assert.equal(b6Passes(s), true, `good-or-great ${(s.goodOrGreat * 100).toFixed(1)}%, bad ${(s.bad * 100).toFixed(1)}% (each must be 10% or fewer)`);
});

/* ------------------------------------------------------------------- B9 */

/*
 * B9. Width flag lenient at 20 items.
 *
 * Interface the fix must meet: price/src/width-flag.ts exports
 *   flagWide(prices: readonly number[]): boolean
 * true when the category those prices came from should be flagged as wider than
 * the 1.5x target (p90/p10). The predicate is seeded: draw 20 prices from a
 * category truly at 1.5x, many times, and require flagWide to say true at least
 * half the time.
 *
 * ADDED BY THIS FILE, not in the spec: a category truly at 1.2x must be flagged
 * at most half the time, otherwise `() => true` would pass.
 */
type Flagger = (prices: readonly number[]) => boolean;

function flagRate(flag: Flagger, trueWidth: number, trials = 1000, items = 20, seed = 20261008): number {
  const rnd = mulberry32(seed);
  const sigma = Math.log(trueWidth) / (2 * Z10);
  let flagged = 0;
  for (let t = 0; t < trials; t++) {
    const prices = Array.from({ length: items }, () => 2500 * Math.exp(sigma * normalDraw(rnd)));
    if (flag(prices)) flagged += 1;
  }
  return flagged / trials;
}

const nearestRank = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
const sampleWidth = (prices: readonly number[]) => {
  const s = [...prices].sort((a, b) => a - b);
  return nearestRank(s, 90) / nearestRank(s, 10);
};
/** Today's idea: the sample's own p90/p10 against 1.5, a point measurement. */
const pointFlag: Flagger = (prices) => sampleWidth(prices) > 1.5;
/** A reference that allows for 20 items' noise: flag once the sample is 7% under the target. */
const lenientToNoiseFlag: Flagger = (prices) => sampleWidth(prices) > 1.4;

function b9Holds(flag: Flagger): boolean {
  return flagRate(flag, 1.5) >= 0.5 && flagRate(flag, 1.2) <= 0.5;
}

test('B9 control: a flagger that allows for 20 items\' noise passes the predicate', () => {
  assert.equal(b9Holds(lenientToNoiseFlag), true, `${flagRate(lenientToNoiseFlag, 1.5)} / ${flagRate(lenientToNoiseFlag, 1.2)}`);
});
test('B9 control: the point measurement (sample p90/p10 over 1.5) flags a true 1.5x category under half the time, so it fails', () => {
  const rate = flagRate(pointFlag, 1.5);
  assert.ok(rate < 0.5, `the point measurement flagged ${(rate * 100).toFixed(1)}%`);
  assert.equal(b9Holds(pointFlag), false);
});
test('B9 control: a flagger that always says wide fails the added specificity half', () => {
  assert.equal(flagRate(() => true, 1.5), 1);
  assert.equal(b9Holds(() => true), false);
});
test('B9: a category truly at 1.5x is flagged at least half the time with 20 items (seeded)', async () => {
  const mod = (await later('../src/width-flag.ts')) as { flagWide: Flagger };
  assert.equal(b9Holds(mod.flagWide), true);
});
