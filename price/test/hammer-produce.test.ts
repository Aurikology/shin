import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { perLbCentsOf, looseCandidate, matchLoose, looseObservation, uniquePluForName, type LooseProduct, type LooseLatest } from '../src/hammer-produce.ts';
import { looseRowsFor } from '../src/hammer.ts';
import { openPrices, recordObservation } from '../src/store.ts';
import { estimate } from '../src/estimate.ts';
import { pluKey } from '../src/plu.ts';
import { canonicalCode } from '../src/bcldb.ts';

function prod(over: Partial<LooseProduct>): LooseProduct & { brand: string } {
  return { id: 'Metro4011', vendor: 'Metro', name: 'Banana', units: '', brand: '', url: '', sku: '4011', code: null, ...over };
}
function latest(over: Partial<LooseLatest>): LooseLatest {
  return { day: '20261110', current: '0.37', old: '', perUnit: '$1.96 /kg', other: '', ...over };
}

test('perLbCentsOf converts per kg, per 100 g and per lb prices to cents per pound, and refuses per-piece prices', () => {
  assert.equal(perLbCentsOf('$6.59/1kg'), 299);
  assert.equal(perLbCentsOf('$6.59 /kg'), 299);
  assert.equal(perLbCentsOf('$6.76/1lb'), 676);
  assert.equal(perLbCentsOf('$1.99 /lb.'), 199);
  assert.equal(perLbCentsOf('$0.66/100g'), 299);
  assert.equal(perLbCentsOf('2.18/kg'), 99);
  assert.equal(perLbCentsOf('$2.30/kilogram'), 104);
  assert.equal(perLbCentsOf('$1.49 /un.'), null);
  assert.equal(perLbCentsOf('$2.29/item'), null);
  assert.equal(perLbCentsOf(''), null);
});

test('Metro: the sku is the PLU, so Banana at $1.96/kg is 4011 at 89 cents a pound', () => {
  const m = matchLoose(prod({}), latest({}));
  assert.ok(m);
  assert.equal(m.plu.code, '4011');
  assert.equal(m.perLbCents, 89);
  assert.equal(m.via, 'sku');
});

test('Metro organic banana (94011) joins the organic code, and an organic name on a plain sku is refused', () => {
  const m = matchLoose(prod({ id: 'Metro94011', sku: '94011', name: 'Organic Banana' }), latest({ perUnit: '$2.62 /kg' }));
  assert.ok(m);
  assert.equal(m.plu.code, '94011');
  assert.equal(m.plu.organic, true);
  assert.equal(matchLoose(prod({ name: 'Organic Banana' }), latest({})), null);
  assert.equal(matchLoose(prod({ id: 'Metro94011', sku: '94011', name: 'Banana' }), latest({})), null);
});

test('a sku that is a PLU but a name that is a different fruit joins nothing', () => {
  assert.equal(matchLoose(prod({ name: 'Cara Cara Orange' }), latest({})), null);
});

test('a per-piece Metro price is not converted', () => {
  assert.equal(matchLoose(prod({}), latest({ perUnit: '$1.49 /un.' })), null);
});

test('Cara Cara oranges: Metro by sku 3110 and Save-On-Foods by sku with a per-100 g price', () => {
  const metro = matchLoose(prod({ id: 'Metro3110', sku: '3110', name: 'Cara Cara Orange' }), latest({ perUnit: '$8.80 /kg' }));
  assert.equal(metro?.plu.code, '3110');
  assert.equal(metro?.perLbCents, 399);
  const sof = matchLoose(
    prod({ id: 'SaveOnFoods3110', vendor: 'SaveOnFoods', sku: '3110', name: 'Cara Cara (Red Navel), Fresh, 200 Gram' }),
    latest({ current: '1.32 avg/ea', perUnit: '$0.66/100g' }),
  );
  assert.equal(sof?.plu.code, '3110');
  assert.equal(sof?.perLbCents, 299);
});

test('a name that is only a size and a colour names no produce and joins nothing', () => {
  const p = prod({ id: 'SaveOnFoods4038', vendor: 'SaveOnFoods', sku: '4038', name: 'Large, Fresh, 185 Gram' });
  assert.equal(matchLoose(p, latest({ perUnit: '$0.88/100g' })), null);
});

test('Loblaws sold-by-weight row joins when the name is exactly one list name', () => {
  const p = prod({ id: 'Loblaws20092614001_KG', vendor: 'Loblaws', sku: '20092614001_KG', name: 'Ambrosia Apples' });
  const m = matchLoose(p, latest({ current: '1.45', perUnit: '$6.61/1kg' }));
  assert.equal(m?.plu.code, '3438');
  assert.equal(m?.perLbCents, 300);
  assert.equal(m?.via, 'name');
});

test('an ambiguous name (Gala Apples fits several list rows) joins nothing, and neither does a row not sold by weight', () => {
  assert.equal(uniquePluForName('Gala Apples'), null);
  const gala = prod({ id: 'Loblaws1_KG', vendor: 'Loblaws', sku: '1_KG', name: 'Gala Apples' });
  assert.equal(matchLoose(gala, latest({ perUnit: '$4.39/1kg' })), null);
  const bagged = prod({ id: 'Loblaws2_EA', vendor: 'Loblaws', sku: '2_EA', name: 'Ambrosia Apples' });
  assert.equal(looseCandidate(bagged), false);
  assert.equal(matchLoose(bagged, latest({ perUnit: '$6.61/1kg' })), null);
});

test('a product that has a barcode is never loose produce', () => {
  assert.equal(looseCandidate(prod({ code: '0000000040112' })), false);
});

test('Galleria 1 LB rows carry the per-lb price in the price field; Sobeys prints the per-kg price there', () => {
  const g = matchLoose(prod({ id: 'Galleria401', vendor: 'Galleria', sku: '401', name: 'BANANAS', units: '1LB' }), latest({ current: '0.88', perUnit: '' }));
  assert.equal(g?.plu.code, '4011');
  assert.equal(g?.perLbCents, 88);
  const s = matchLoose(prod({ id: 'Sobeys131356KG', vendor: 'Sobeys', sku: '131356KG', name: 'White Potatoes 1 Count' }), latest({ current: '2.18/kg', perUnit: '$0.22 per 100g' }));
  assert.equal(s?.plu.code, '4083');
  assert.equal(s?.perLbCents, 99);
});

test('the observation sits under the PLU key, per lb, and a sale is marked', () => {
  const p = prod({});
  const l = latest({ old: '2.10' });
  const m = matchLoose(p, l)!;
  const o = looseObservation(p, l, m, 'hammer', 'Metro');
  assert.equal(o.code, canonicalCode(pluKey('4011')));
  assert.equal(o.priceCents, 89);
  assert.equal(o.unitLabel, '$/lb');
  assert.equal(o.kind, 'promotional');
  assert.equal(o.seenOn, '2026-11-10');
  assert.equal(o.storeName, 'Metro');
});

test('looseRowsFor in the importer returns the stored row for a match and nothing for a barcoded or unmatched product', () => {
  assert.equal(looseRowsFor(prod({}), latest({}))?.priceCents, 89);
  assert.equal(looseRowsFor(prod({ code: '0000000040112' }), latest({})), null);
  assert.equal(looseRowsFor(prod({ name: 'Mystery' }), latest({})), null);
});

test('end to end: Hammer rows for 3110 are read back by estimate as a per lb price', async () => {
  const db = openPrices(':memory:');
  const rows: Array<[ReturnType<typeof prod>, LooseLatest]> = [
    [prod({ id: 'Metro3110', sku: '3110', name: 'Cara Cara Orange' }), latest({ perUnit: '$8.80 /kg' })],
    [prod({ id: 'SaveOnFoods3110', vendor: 'SaveOnFoods', sku: '3110', name: 'Cara Cara (Red Navel), Fresh, 200 Gram' }), latest({ current: '1.32 avg/ea', perUnit: '$0.66/100g' })],
  ];
  for (const [p, l] of rows) recordObservation(db, looseRowsFor(p, l)!);
  const cat = new DatabaseSync(':memory:');
  cat.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const { verdict } = await estimate(
    { barcode: pluKey('3110'), asOf: '2026-11-14', currency: 'CAD', country: 'CA', name: 'Cara Cara Oranges', weighed: true, weighedUnit: 'lb' } as never,
    null,
    { prices: db, catalogue: cat } as never,
  );
  assert.equal(verdict.perUnit!.label, 'per lb');
  assert.ok(verdict.centreCents >= 299 && verdict.centreCents <= 399, `centre ${verdict.centreCents}`);
  assert.equal(verdict.basis, 'own_prices');
});
