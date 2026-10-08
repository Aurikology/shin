/**
 * The price tree's shrinkage and store multiplier, on small fixtures, each with a
 * case it must fail: a stub that does the thing the design rejects (a hard split,
 * a mean of ratios, a tree split by chain) is run against the same predicate and
 * must go red, so the predicate is shown able to fail (RULINGS.md, "Everything is
 * an assumption until tested").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadTaxonomy } from '../../catalogue/src/category-taxonomy.ts';
import {
  betweenVariance,
  buildPriceTree,
  median,
  MIN_TAU2,
  PriceTreeError,
  shrinkMean,
  shrinkWeight,
  type TreeItem,
  type TreePrice,
} from '../src/price-tree.ts';

const tax = loadTaxonomy(fileURLToPath(new URL('../../catalogue/test/fixtures/taxonomy-small.json', import.meta.url)));

const item = (code: string, path: string[], storeBrand = false): TreeItem => ({ code, name: code, brand: storeBrand ? 'No Name' : 'Brand', storeBrand, categoryPath: path });
const price = (code: string, chain: string, cents: number): TreePrice => ({ code, chain, cents });

/* ------------------------------------------------------------- shrinkage */

/** What partial pooling must do: a small or spread-out node leans on its parent, a big tight one on itself. */
function poolsPartially(shrink: (own: number, n: number, sigma2: number, tau2: number, parent: number) => number): boolean {
  const own = 2;
  const parent = 0;
  const tau2 = 0.04;
  const small = shrink(own, 1, 0.25, tau2, parent);
  const big = shrink(own, 200, 0.25, tau2, parent);
  const noisy = shrink(own, 20, 4, tau2, parent);
  const tight = shrink(own, 20, 0.01, tau2, parent);
  const between = (x: number) => x > parent && x < own;
  return between(small) && between(big) && small < big && noisy < tight && big > 0.9 * own && small < 0.5 * own;
}
/** The design this replaces: a hard split, the node is its own mean whatever its count. */
const hardSplit = (own: number): number => own;
/** The other failure: pooled to the parent whatever the node holds. */
const alwaysParent = (_own: number, _n: number, _s: number, _t: number, parent: number): number => parent;

test('shrinkage: a small or spread-out node leans on its parent, a big tight one on itself', () => {
  assert.equal(poolsPartially(shrinkMean), true);
});
test('shrinkage control: a hard split and an always-parent stub both fail the predicate', () => {
  assert.equal(poolsPartially(hardSplit), false);
  assert.equal(poolsPartially(alwaysParent), false);
});
test('shrinkWeight: no items is all parent; no spread is all own; more items, more weight', () => {
  assert.equal(shrinkWeight(0, 1, 1), 0);
  assert.equal(shrinkWeight(5, 0, 1), 1);
  assert.equal(shrinkWeight(5, 1, 0), 0);
  assert.ok(shrinkWeight(10, 1, 0.1) > shrinkWeight(2, 1, 0.1));
  assert.ok(shrinkWeight(10, 4, 0.1) < shrinkWeight(10, 1, 0.1));
  assert.equal(shrinkWeight(4, 1, 1), 0.8); // tau2 / (tau2 + sigma2 / n)
});
test('betweenVariance: siblings that agree get the floor, siblings that differ get more', () => {
  const same = [1, 1.001, 0.999].map((m) => ({ mean: m, n: 10, sigma2: 0.04 }));
  const apart = [0, 1, 2].map((m) => ({ mean: m, n: 10, sigma2: 0.04 }));
  assert.equal(betweenVariance(same), MIN_TAU2);
  assert.ok(betweenVariance(apart) > 0.5);
  assert.equal(betweenVariance([{ mean: 1, n: 5, sigma2: 0.1 }]), MIN_TAU2, 'one child cannot show a between-sibling spread');
});

/** Items of one group at one price level, with a little deterministic scatter. */
function group(prefix: string, path: string[], count: number, cents: number, storeBrand = false): { items: TreeItem[]; prices: TreePrice[] } {
  const items: TreeItem[] = [];
  const prices: TreePrice[] = [];
  for (let i = 0; i < count; i++) {
    const code = `${prefix}${i}`;
    items.push(item(code, path, storeBrand));
    prices.push(price(code, 'A', Math.round(cents * (0.95 + 0.1 * ((i * 7) % 10) / 10))));
  }
  return { items, prices };
}

test('the tree pools a node toward its parent: one odd item is pulled in, a big odd group holds its own', () => {
  const base = group('b', ['en:dairies', 'en:cheeses'], 30, 1000);
  const odd = group('o', ['en:dairies', 'en:milk-ish'], 1, 2000);
  const bigOdd = group('g', ['en:dairies', 'en:aged'], 40, 2000);
  const small = buildPriceTree([...base.items, ...odd.items], [...base.prices, ...odd.prices]);
  const big = buildPriceTree([...base.items, ...bigOdd.items], [...base.prices, ...bigOdd.prices]);
  const oneNode = small.node(['en:dairies', 'en:milk-ish', 'name-brand'])!;
  const bigNode = big.node(['en:dairies', 'en:aged', 'name-brand'])!;
  const logs = (c: number) => Math.log(c);
  // The one-item node sits strictly between its own mean and its parent's.
  assert.ok(oneNode.theta < oneNode.raw! - 0.01 && oneNode.theta > small.node(['en:dairies'])!.theta, `one item: raw ${oneNode.raw} theta ${oneNode.theta}`);
  // The forty-item node keeps nearly all of its own mean.
  assert.ok(bigNode.weight > 0.9, `forty items: weight ${bigNode.weight}`);
  assert.ok(Math.abs(bigNode.theta - bigNode.raw!) < 0.1 * Math.abs(bigNode.raw! - logs(1000)), 'the big node stays near its own mean');
  // A hard split would give the one-item node weight 1: the same predicate on that stub fails.
  assert.ok(!(hardSplit(oneNode.raw!) < oneNode.raw! - 0.01), 'control: a hard split does not move the one-item node, so the predicate above is able to fail');
});

test('an item with no prices of its own gets its group\'s centre; with prices, its own prices set the centre', () => {
  const g = group('b', ['en:dairies', 'en:cheeses'], 20, 1000);
  const none = item('none', ['en:dairies', 'en:cheeses']);
  const own = item('own', ['en:dairies', 'en:cheeses']);
  const tree = buildPriceTree([...g.items, none, own], [...g.prices, price('own', 'A', 1500), price('own', 'A', 1500), price('own', 'A', 1500)]);
  assert.equal(tree.judge('none', 1000), 'fair');
  assert.equal(tree.judge('own', 1500), 'fair', 'its own centre, not its group\'s');
  assert.equal(tree.judge('own', 1000), 'good', 'a third under its own prices is good');
  assert.equal(tree.judge('own', 1900), 'bad');
});

test('B6 in the tree: a normal price in a wide group is not good for a no-price item, but is for an item priced the same', () => {
  const wide = [400, 600, 800, 1000, 1200, 1500, 2000, 2600, 3300, 4200];
  const items = wide.map((_, i) => item(`w${i}`, ['en:dairies', 'en:cheeses']));
  const prices = wide.map((c, i) => price(`w${i}`, 'A', c));
  const none = item('none', ['en:dairies', 'en:cheeses']);
  const tree = buildPriceTree([...items, none], prices);
  const centre = Math.exp(tree.node(['en:dairies', 'en:cheeses', 'name-brand'])!.theta);
  const cheapish = Math.round(centre * 0.75);
  // 25% under the group's centre: the 20% line alone would say good.
  assert.ok(cheapish <= centre * 0.8);
  assert.equal(tree.judge('none', cheapish), 'fair');
  // An item that has its own prices at the group's centre is judged on the 20% line.
  const tree2 = buildPriceTree([...items, item('priced', ['en:dairies', 'en:cheeses'])], [...prices, price('priced', 'A', Math.round(centre)), price('priced', 'A', Math.round(centre))]);
  assert.equal(tree2.judge('priced', Math.round(Math.round(centre) * 0.75)), 'good');
});

/* ------------------------------------------------------ store multiplier */

/** What the multiplier must be: the chain gap, robust to one wild code. */
function estimatesGap(est: (rows: { a: number; b: number }[]) => number | null): boolean {
  const clean = [100, 150, 220, 310, 500].map((a) => ({ a: a * 1.25, b: a }));
  const withWild = [...clean, { a: 4000, b: 100 }];
  const e1 = est(clean);
  const e2 = est(withWild);
  return e1 !== null && e2 !== null && Math.abs(e1 - 1.25) < 0.02 && Math.abs(e2 - 1.25) < 0.1 * 1.25;
}
const viaTree = (rows: { a: number; b: number }[]): number | null => {
  const items = rows.map((_, i) => item(`c${i}`, ['en:dairies', 'en:cheeses']));
  const prices = rows.flatMap((r, i) => [price(`c${i}`, 'A', Math.round(r.a)), price(`c${i}`, 'B', Math.round(r.b))]);
  return buildPriceTree(items, prices).storeAdjustment('A', 'B');
};
const meanOfRatios = (rows: { a: number; b: number }[]): number => rows.reduce((s, r) => s + r.a / r.b, 0) / rows.length;

test('store multiplier: the median log ratio over codes sold at both chains', () => {
  assert.equal(estimatesGap(viaTree), true);
});
test('store multiplier control: a mean of ratios is dragged by one wild code and fails the predicate', () => {
  assert.equal(estimatesGap(meanOfRatios), false);
});
test('store multiplier: reciprocal, 1 against itself, null with no code sold at both chains', () => {
  const items = ['x', 'y', 'z', 'only-a', 'only-b'].map((c) => item(c, ['en:dairies', 'en:cheeses']));
  const prices = [price('x', 'A', 1000), price('x', 'B', 800), price('y', 'A', 500), price('y', 'B', 400), price('z', 'A', 250), price('z', 'B', 200), price('only-a', 'A', 700), price('only-b', 'C', 900)];
  const t = buildPriceTree(items, prices);
  assert.ok(Math.abs(t.storeAdjustment('A', 'B')! - 1.25) < 1e-9);
  assert.ok(Math.abs(t.storeAdjustment('A', 'B')! * t.storeAdjustment('B', 'A')! - 1) < 1e-9);
  assert.equal(t.storeAdjustment('A', 'A'), 1);
  assert.equal(t.storeAdjustment('A', 'C'), null, 'no code is sold at both A and C');
  assert.equal(t.storeAdjustment('B', 'C'), null);
});
test('a chain with no shared code is listed as unlinked, kept out of the groups, and a verdict at it throws', () => {
  const items = ['x', 'y', 'q'].map((c) => item(c, ['en:dairies', 'en:cheeses']));
  const prices = [price('x', 'A', 1000), price('x', 'B', 800), price('y', 'A', 500), price('y', 'B', 400), price('q', 'D', 99999)];
  const t = buildPriceTree(items, prices);
  assert.deepEqual(t.unlinkedChains, ['D']);
  assert.throws(() => t.judge('x', 1000, 'D'), PriceTreeError);
  assert.equal(t.judge('x', 1000, 'A'), 'fair');
  // q's only price is at the unlinked chain, so it does not drag its group to 99999.
  assert.ok(Math.exp(t.node(['en:dairies', 'en:cheeses', 'name-brand'])!.theta) < 2000);
});
test('chains linked only through a third chain are brought to one level', () => {
  const items = ['x', 'y', 'p', 'q'].map((c) => item(c, ['en:dairies', 'en:cheeses']));
  // A sells x, y; B sells x, y, p, q; C sells p, q. B is 1.0x A; C is 2.0x B.
  const prices = [price('x', 'A', 100), price('x', 'B', 100), price('y', 'A', 300), price('y', 'B', 300), price('p', 'B', 200), price('p', 'C', 400), price('q', 'B', 500), price('q', 'C', 1000)];
  const t = buildPriceTree(items, prices);
  assert.equal(t.storeAdjustment('A', 'C'), null, 'no direct overlap');
  assert.deepEqual(t.unlinkedChains, []);
  // C's shelf price of 400 is B's 200 for the same thing: 'p' is judged fair at C when it costs 400, good at 250.
  assert.equal(t.judge('p', 400, 'C'), 'fair');
  assert.equal(t.judge('p', 250, 'C'), 'good');
});

/* ------------------------------------------------------------ the paths */

/** The tree design B4 rejects: one path per chain an item is priced at. */
function onePathPerItem(paths: (code: string) => string[][], codes: string[]): boolean {
  return codes.every((c) => paths(c).length === 1);
}
test('every item has exactly one path, whatever the chains it is priced at', () => {
  const items = ['x', 'y'].map((c) => item(c, ['en:dairies', 'en:cheeses']));
  const both = buildPriceTree(items, [price('x', 'A', 100), price('x', 'B', 120), price('y', 'A', 200), price('y', 'B', 240)]);
  const onlyA = buildPriceTree(items, [price('x', 'A', 100), price('y', 'A', 200)]);
  assert.equal(onePathPerItem(both.pathsOf, ['x', 'y']), true);
  assert.deepEqual(both.pathsOf('x'), onlyA.pathsOf('x'), 'a second chain never moves an item');
  const splitByChain = (code: string) => [...new Set(['A', 'B'])].map((c) => ['en:dairies', 'en:cheeses', `chain:${c}`, code]);
  assert.equal(onePathPerItem(splitByChain, ['x', 'y']), false, 'control: a tree split by chain gives two');
});
test('the brand tier is the last node: a store brand and a name brand of one category are in different groups', () => {
  const t = buildPriceTree([item('n', ['en:spreads'], false), item('s', ['en:spreads'], true)], [price('n', 'A', 800), price('s', 'A', 500)]);
  assert.notEqual(t.groupOf('n'), t.groupOf('s'));
  assert.deepEqual(t.pathsOf('s'), [['en:spreads', 'store-brand']]);
});
test('with a taxonomy the chain keeps only the leaf and its ancestors; without one the stored path is used and says so', () => {
  const stored = ['en:cheeses', 'en:snacks', 'en:cheddar']; // en:snacks is not a parent of en:cheddar
  const items = [item('c', stored)];
  const withTax = buildPriceTree(items, [price('c', 'A', 100)], { taxonomy: tax });
  const without = buildPriceTree(items, [price('c', 'A', 100)]);
  assert.deepEqual(withTax.pathsOf('c'), [['en:cheeses', 'en:cheddar', 'name-brand']]);
  assert.equal(withTax.taxonomyChecked, true);
  assert.deepEqual(without.pathsOf('c'), [['en:cheeses', 'en:snacks', 'en:cheddar', 'name-brand']]);
  assert.equal(without.taxonomyChecked, false);
});

/* --------------------------------------------------------------- faults */

test('faults are loud: a price for no item, a bad price, a repeated code, an unknown item and an empty tree all throw', () => {
  const items = [item('x', ['en:a'])];
  assert.throws(() => buildPriceTree(items, [price('ghost', 'A', 100)]), PriceTreeError);
  assert.throws(() => buildPriceTree(items, [price('x', 'A', 0)]), PriceTreeError);
  assert.throws(() => buildPriceTree(items, [price('x', 'A', 10.5)]), PriceTreeError);
  assert.throws(() => buildPriceTree([...items, ...items], []), PriceTreeError);
  const t = buildPriceTree(items, [price('x', 'A', 100)]);
  assert.throws(() => t.judge('nobody', 100), PriceTreeError);
  assert.throws(() => t.judge('x', 0), PriceTreeError);
  assert.throws(() => buildPriceTree(items, []).judge('x', 100), PriceTreeError);
  // control: the happy path does not throw
  assert.equal(t.judge('x', 100), 'fair');
  assert.equal(median([1, 3, 2, 4]), 2.5);
});
