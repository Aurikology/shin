import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSizes, parseSizeInfo, sizesAgree, packsAgree, words, HammerMatcher, type MatchProduct } from '../src/hammer-match.ts';

function p(over: Partial<MatchProduct> & { id: string }): MatchProduct {
  return { vendor: 'Metro', name: '', units: '', brand: '', code: null, ...over };
}

test('parseSizes reads totals: packs multiply, units convert, "1 each" says nothing', () => {
  assert.deepEqual(parseSizes('450g', ''), [{ family: 'mass', base: 450 }]);
  assert.deepEqual(parseSizes('8 x 300ml', ''), [{ family: 'volume', base: 2400 }]);
  assert.deepEqual(parseSizes('', 'Bubly Sparkling Water 6 x 355 ml (Cans)'), [{ family: 'volume', base: 2130 }]);
  assert.deepEqual(parseSizes('0.312kg', ''), [{ family: 'mass', base: 312 }]);
  assert.deepEqual(parseSizes('1.5 l', ''), [{ family: 'volume', base: 1500 }]);
  assert.deepEqual(parseSizes('4 per pack', ''), [{ family: 'count', base: 4 }]);
  assert.deepEqual(parseSizes('1un', ''), []);
  assert.deepEqual(parseSizes('sold individually', 'Blueberry'), []);
  // Galleria writes a four-pack as 473ML*4.
  assert.deepEqual(parseSizes('473ML*4', ''), [{ family: 'volume', base: 1892 }]);
  // 12 oz is 340 g.
  const oz = parseSizes('12 oz', '');
  assert.equal(oz[0].family, 'mass');
  assert.ok(Math.abs(oz[0].base - 340.2) < 0.1);
});

test('a weight beside a count is a pack of that many, and the total is another size', () => {
  const info = parseSizeInfo('', 'Coca-Cola Zero Sugar Cans, 355 mL, 24 Pack');
  assert.deepEqual(info.packs, [24]);
  assert.ok(info.sizes.some((s) => s.family === 'volume' && s.base === 355));
  assert.ok(info.sizes.some((s) => s.family === 'volume' && s.base === 8520));
});

test('sizes agree across units and a rounding label, and disagree across families and sizes', () => {
  assert.equal(sizesAgree(parseSizes('340g', ''), parseSizes('12 oz', '')), true);
  assert.equal(sizesAgree(parseSizes('450g', ''), parseSizes('500g', '')), false);
  assert.equal(sizesAgree(parseSizes('500g', ''), parseSizes('500ml', '')), false);
  assert.equal(sizesAgree(parseSizes('', 'Pasta 410 g'), parseSizes('410g', '')), true);
});

test('pack counts: both unstated agree, both stated must share one, one-sided stated disagree', () => {
  assert.equal(packsAgree([], []), true);
  assert.equal(packsAgree([24], [24]), true);
  assert.equal(packsAgree([20], [24]), false);
  assert.equal(packsAgree([24], []), false);
});

test('words drop sizes, accents, apostrophes, parentheses and packaging, and keep percent figures whole', () => {
  assert.deepEqual(words('Ben\'s Original Converted Rice 907 g (bag)'), ['ben', 'original', 'converted', 'rice']);
  assert.deepEqual(words('iÖGO Nanö Drinkable Yogurt 1% 6 x 93 mL'), ['iogo', 'nano', 'drinkable', 'yogurt', '1pct']);
});

// A tiny catalogue. Brands need three products before a start-of-name brand is recognised, so Barilla and
// Classico get filler rows the way the real data has them.
const BARILLA_FILLER = ['Spaghetti', 'Penne Rigate', 'Fusilli'].map((n, i) =>
  p({ id: `Loblaws-b${i}`, vendor: 'Loblaws', name: `${n} Pasta`, units: '500g', brand: 'Barilla', code: `0768080110${i}0` }));
const POOL: MatchProduct[] = [
  ...BARILLA_FILLER,
  p({ id: 'Metro1', vendor: 'Metro', name: 'Spaghettoni Pasta', units: '410g', brand: 'BARILLA', code: '0076808011043' }),
  p({ id: 'Metro2', vendor: 'Metro', name: 'Classico Roasted Garlic Pasta Sauce', units: '410ml', brand: 'Classico', code: '0057000330101' }),
  p({ id: 'Metro3', vendor: 'Metro', name: 'Classico Four Cheese Pasta Sauce', units: '410ml', brand: 'Classico', code: '0057000330102' }),
  p({ id: 'Metro4', vendor: 'Metro', name: 'Classico Tomato Basil Pasta Sauce', units: '410ml', brand: 'Classico', code: '0057000330103' }),
  p({ id: 'Metro5', vendor: 'Metro', name: 'Blueberry', units: '510g', brand: '', code: '0853085003042' }),
  p({ id: 'Metro6', vendor: 'Metro', name: 'Gummy Sour Worms Candy Mix', units: '500g', brand: 'Compliments', code: '0055742000001' }),
  p({ id: 'Metro7', vendor: 'Metro', name: 'Dill Pickles Crunchy Kosher Style', units: '1l', brand: 'Bicks', code: '0056595004718' }),
  p({ id: 'Walmart7', vendor: 'Walmart', name: 'Dill Pickles Crunchy Kosher Style', units: '1l', brand: 'Bicks', code: '0059000004716' }),
];

function matcher(extra: MatchProduct[] = []): HammerMatcher {
  return new HammerMatcher([...POOL, ...extra]);
}

test('a Voila product with no brand column gets the barcode of its one twin at another chain', () => {
  const q = p({ id: 'Voila1', vendor: 'Voila', name: 'Barilla Spaghettoni Pasta 410 g', units: '410g' });
  const m = matcher([q]).match(q);
  assert.ok(m.ok);
  assert.equal(m.result.code, '0076808011043');
  assert.equal(m.result.twin.id, 'Metro1');
});

test('the same size is required: 410 g does not borrow the barcode of a 500 g pack', () => {
  const q = p({ id: 'Voila2', vendor: 'Voila', name: 'Barilla Spaghettoni Pasta 500 g', units: '500g' });
  const m = matcher([q]).match(q);
  assert.equal(m.ok, false);
});

test('a product with no size gets nothing', () => {
  const q = p({ id: 'Voila3', vendor: 'Voila', name: 'Barilla Spaghettoni Pasta', units: '' });
  const m = matcher([q]).match(q);
  assert.equal(m.ok, false);
  if (!m.ok) assert.equal(m.reason, 'no-size');
});

test('a different flavour of the same brand and size is not the same product', () => {
  const q = p({ id: 'Voila4', vendor: 'Voila', name: 'Classico Spinach Alfredo Pasta Sauce 410 ml', units: '410ml' });
  const m = matcher([q]).match(q);
  assert.equal(m.ok, false);
});

test('the right flavour is picked out from its siblings when it is one clear winner', () => {
  const q = p({ id: 'Voila5', vendor: 'Voila', name: 'Classico Four Cheese Pasta Sauce 410 ml', units: '410ml' });
  const m = matcher([q]).match(q);
  assert.ok(m.ok);
  assert.equal(m.result.code, '0057000330102');
});

test('two barcodes for the same name and size is ambiguous, so no barcode is given', () => {
  const q = p({ id: 'Loblaws9', vendor: 'Loblaws', name: 'Dill Pickles Crunchy Kosher Style', units: '1l', brand: "Bick's" });
  const m = matcher([q]).match(q);
  assert.equal(m.ok, false);
  if (!m.ok) assert.equal(m.reason, 'ambiguous');
});

test('an unbranded short name such as Blueberry never matches: every packer has its own barcode', () => {
  const q = p({ id: 'Voila6', vendor: 'Voila', name: 'Blueberry', units: '510g' });
  assert.equal(matcher([q]).match(q).ok, false);
});

test('a store brand does not borrow another chain\'s barcode for a different brand', () => {
  const q = p({ id: 'Voila7', vendor: 'Voila', name: 'Great Value Gummy Sour Worms Candy Mix 500 g', units: '500g', brand: 'Great Value' });
  assert.equal(matcher([q]).match(q).ok, false);
});

test('a chain never borrows from its own rows', () => {
  const q = p({ id: 'Metro99', vendor: 'Metro', name: 'Barilla Spaghettoni Pasta 410 g', units: '410g' });
  assert.equal(matcher([q]).match(q).ok, false);
});

test('a size 2 percent off is a different pack even though it lands in the same search bucket', () => {
  const q = p({ id: 'Voila8', vendor: 'Voila', name: 'Barilla Spaghettoni Pasta 420 g', units: '420g' });
  assert.equal(matcher([q]).match(q).ok, false);
});

test('a 20 pack never borrows the barcode of a 24 pack of the same can', () => {
  const pool = [
    p({ id: 'Walmart1', vendor: 'Walmart', name: 'Coca-Cola Zero Sugar Cans, 355 mL, 24 Pack', units: '', brand: 'Coca-Cola', code: '0067000107498' }),
  ];
  const q20 = p({ id: 'SaveOn1', vendor: 'SaveOnFoods', name: 'Zero Sugar, 355mL Cans, 20 Each', units: '355ml cans20 each', brand: 'Coca-Cola' });
  const q24 = p({ id: 'SaveOn2', vendor: 'SaveOnFoods', name: 'Zero Sugar, 355mL Cans, 24 Each', units: '355ml cans24 each', brand: 'Coca-Cola' });
  const m = new HammerMatcher([...pool, q20, q24]);
  assert.equal(m.match(q20).ok, false);
  const ok = m.match(q24);
  assert.ok(ok.ok);
  assert.equal(ok.result.code, '0067000107498');
});

test('chains of one company can be told not to vouch for each other', () => {
  const q = p({ id: 'Sobeys1', vendor: 'Sobeys', name: 'Barilla Spaghettoni Pasta 410 g', units: '410g' });
  const m = new HammerMatcher([...POOL, q], undefined, (v) => (v === 'Sobeys' ? 'Metro' : v));
  assert.equal(m.match(q).ok, false);
});
