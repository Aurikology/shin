/**
 * B2 in the range ladder, and B9's width flag: the cases beyond the pain-point
 * file. Each has a case it must fail (the old position rule, the point
 * measurement) run on the same input.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { priceRangeFor, type RangeInput, type RangeSources } from '../src/range.ts';
import { estimate, type EstimateDeps } from '../src/estimate.ts';
import { flagWide, widthInterval, MIN_PRICES, TARGET_WIDTH } from '../src/width-flag.ts';
import { loadTaxonomy } from '../../catalogue/src/category-taxonomy.ts';

const tax = loadTaxonomy(fileURLToPath(new URL('../../catalogue/test/fixtures/taxonomy-small.json', import.meta.url)));

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: null, seller: 'Walmart', sellerSku: 'sku', sellerName: 'x', sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null, ...over,
  };
}
const SELF = '0068100084245';
function world(selfPath: string[], others: { path: string[]; count: number }[]): RangeSources {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', '500 g', 500, 'g', JSON.stringify(selfPath), selfPath[selfPath.length - 1]!);
  let n = 0;
  for (const g of others) {
    for (let i = 0; i < g.count; i++) {
      n += 1;
      const code = String(1000 + n).padStart(13, '0');
      ins.run(code, 'other', '500 g', 500, 'g', JSON.stringify(g.path), g.path[g.path.length - 1]!);
      recordObservation(prices, obs({ code, sellerSku: `s${n}`, priceCents: 400 + n * 50 }));
    }
  }
  return { prices, catalogue };
}
const input = (selfPath: string[]): RangeInput => ({ barcode: SELF, size: '500 g', leafCategory: selfPath[selfPath.length - 1]!, categoryPath: selfPath, asOf: '2026-09-27' });
// 5 products under en:snacks (the tag before the leaf) and 5 under en:cheeses (the taxonomy parent).
const OTHERS = [
  { path: ['en:snacks', 'en:chips'], count: 5 },
  { path: ['en:dairies', 'en:cheeses'], count: 5 },
];
const BAD = ['en:cheeses', 'en:snacks', 'en:cheddar'];

test('with a taxonomy the parent rung skips a non-ancestor before the leaf and takes the nearest ancestor', () => {
  const r = priceRangeFor(input(BAD), { ...world(BAD, OTHERS), taxonomy: tax });
  assert.equal(r.basis, 'parent_category');
  if (r.basis !== 'parent_category') return;
  assert.equal(r.category, 'en:cheeses');
  assert.ok(r.tried.every((t) => t.flag === undefined), 'a checked parent carries no flag');
});
test('without a taxonomy the position rule runs, and the step says parent_unchecked (never silent)', () => {
  const r = priceRangeFor(input(BAD), world(BAD, OTHERS));
  assert.equal(r.basis, 'parent_category');
  if (r.basis !== 'parent_category') return;
  assert.equal(r.category, 'en:snacks', 'control: the position rule reads the non-ancestor');
  const parentStep = r.tried.find((t) => t.basis === 'parent_category')!;
  assert.equal(parentStep.flag, 'parent_unchecked');
  // And a null taxonomy is the same as none.
  const r2 = priceRangeFor(input(BAD), { ...world(BAD, OTHERS), taxonomy: null });
  assert.equal(r2.tried.find((t) => t.basis === 'parent_category')!.flag, 'parent_unchecked');
});
test('a too-few parent step is flagged too, and the leaf-only answer carries no parent flag', () => {
  const few = priceRangeFor(input(BAD), world(BAD, [{ path: ['en:snacks', 'en:chips'], count: 2 }]));
  assert.equal(few.basis, 'none');
  assert.equal(few.tried.find((t) => t.basis === 'parent_category')!.flag, 'parent_unchecked');
  const leafPath = ['en:dairies', 'en:cheeses', 'en:cheddar'];
  const leaf = priceRangeFor(input(leafPath), { ...world(leafPath, [{ path: leafPath, count: 6 }]), taxonomy: tax });
  assert.equal(leaf.basis, 'leaf_category');
  assert.ok(leaf.tried.every((t) => t.flag === undefined));
});
test('with a taxonomy and no ancestor anywhere in the path there is no parent rung', () => {
  const orphan = ['en:snacks', 'en:cheddar'];
  const r = priceRangeFor(input(orphan), { ...world(orphan, [{ path: ['en:snacks', 'en:chips'], count: 6 }]), taxonomy: tax });
  assert.equal(r.basis, 'none');
  assert.equal(r.tried.at(-1)!.outcome, 'no_category');
});

/* ------------------------------------------------------------- width flag */

test('flagWide: throws on no prices and on a price that is not positive and finite', () => {
  assert.throws(() => flagWide([]), RangeError);
  assert.throws(() => flagWide([1, 2, 3, 4, 0]), RangeError);
  assert.throws(() => flagWide([1, 2, 3, 4, Number.NaN]), RangeError);
});
test('flagWide: fewer than the minimum prices cannot show a category is narrow, so it is flagged; the interval is repeatable', () => {
  assert.equal(flagWide([100, 101, 102]), true);
  assert.equal(widthInterval([100, 101, 102]).upper, Infinity);
  const sample = Array.from({ length: MIN_PRICES + 15 }, (_, i) => 1000 + i * 7);
  assert.equal(widthInterval(sample).upper, widthInterval([...sample].reverse()).upper, 'same prices, same interval, in any order');
});
test('flagWide: a plainly narrow sample is not flagged; a plainly wide one is; the point measurement alone misses a borderline one', () => {
  const narrow = Array.from({ length: 30 }, (_, i) => 1000 + i * 3); // about 1.09x
  const wide = Array.from({ length: 30 }, (_, i) => 500 * Math.exp(i * 0.06)); // about 4x
  assert.equal(flagWide(narrow), false);
  assert.equal(flagWide(wide), true);
  // Control: a 20-item sample whose own p90/p10 is under 1.5 but whose interval reaches over it.
  const borderline = [900, 930, 950, 980, 1000, 1010, 1040, 1070, 1100, 1130, 1150, 1180, 1220, 1260, 1300, 1330, 1360, 1380, 1400, 1420];
  const w = widthInterval(borderline);
  assert.ok(w.point < TARGET_WIDTH, `the point measurement is ${w.point}`);
  assert.ok(w.upper > TARGET_WIDTH, `the interval reaches ${w.upper}`);
  assert.equal(flagWide(borderline), true);
});

/* ------------------------------------------- the verdict ladder (estimate.ts) */

function estimateWorld(selfPath: string[]): EstimateDeps {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', 'Cheddar', null, '500 g', 500, 'g', JSON.stringify(selfPath), selfPath[selfPath.length - 1]!);
  let n = 0;
  for (const g of OTHERS) {
    for (let i = 0; i < g.count; i++) {
      n += 1;
      const code = String(1000 + n).padStart(13, '0');
      ins.run(code, `other ${n}`, `other ${n}`, `B${n}`, '500 g', 500, 'g', JSON.stringify(g.path), g.path[g.path.length - 1]!);
      recordObservation(prices, obs({ code, sellerSku: `s${n}`, priceCents: 400 + n * 50 }));
    }
  }
  return { prices, catalogue };
}
const verdictItem = (selfPath: string[]) => ({ barcode: SELF, size: '500 g', leafCategory: selfPath[selfPath.length - 1]!, categoryPath: selfPath, asOf: '2026-09-27' });
const parentRung = (r: Awaited<ReturnType<typeof estimate>>) => r.trace.tried.find((t) => t.rung === 'parent_category')!;

test('the verdict ladder takes the taxonomy parent: on the BAD_SELF shape it reads en:cheeses, not the non-ancestor en:snacks', async () => {
  const withTax = await estimate(verdictItem(BAD), null, { ...estimateWorld(BAD), taxonomy: tax });
  assert.equal(withTax.verdict.basis, 'parent_category');
  assert.equal(parentRung(withTax).detail, 'en:cheeses');
  assert.equal(parentRung(withTax).flag, undefined);
  // Control: the position rule (no taxonomy) reads en:snacks and says it never checked.
  const without = await estimate(verdictItem(BAD), null, estimateWorld(BAD));
  assert.equal(without.verdict.basis, 'parent_category');
  assert.equal(parentRung(without).detail, 'en:snacks', 'the position rule reads the non-ancestor');
  assert.equal(parentRung(without).flag, 'parent_unchecked');
  assert.notEqual(withTax.verdict.centreCents, without.verdict.centreCents, 'the fix changes the group read, not just the label');
});
test('the verdict ladder: where the tag before the leaf IS the taxonomy parent, both rules agree', async () => {
  const good = ['en:dairies', 'en:cheeses', 'en:cheddar'];
  const a = await estimate(verdictItem(good), null, { ...estimateWorld(good), taxonomy: tax });
  const b = await estimate(verdictItem(good), null, estimateWorld(good));
  assert.equal(a.verdict.centreCents, b.verdict.centreCents);
  assert.equal(parentRung(a).detail, 'en:cheeses');
});
