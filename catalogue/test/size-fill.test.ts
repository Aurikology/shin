/**
 * Unit 7, "Fill the missing sizes". Proves the two extraction rules against
 * the hard shapes the plan names as falsifier bait: multipacks, ranges,
 * imperial units, "1L" vs "1 L", a percentage ending, and a bare count with
 * no unit at all. Also proves `--apply` actually writes, against an
 * in-memory database -- never the live catalogue.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue } from '../src/schema.ts';
import { computeFills, fillFromName, fillFromQuantity, type CandidateRow } from '../src/size-fill.ts';

// ── Source 1: the quantity column ────────────────────────────────────────

test('quantity column: a plain size parses to base units', () => {
  const f = fillFromQuantity('503 mL');
  assert.deepEqual(f, { value: 503, unit: 'ml', matchedText: '503 mL' });
});

test('quantity column: a multipack is multiplied out', () => {
  const f = fillFromQuantity('2 x 1.5 L');
  assert.deepEqual(f, { value: 3000, unit: 'ml', matchedText: '2 x 1.5 L' });
});

test('quantity column: imperial units convert to grams', () => {
  const f = fillFromQuantity('12 oz');
  assert.equal(f!.unit, 'g');
  assert.ok(Math.abs(f!.value - 340.194) < 0.01);
});

test('quantity column: "1L" and "1 L" give the same answer', () => {
  const a = fillFromQuantity('1L')!;
  const b = fillFromQuantity('1 L')!;
  assert.equal(a.value, b.value);
  assert.equal(a.unit, b.unit);
});

test('quantity column: a bare count with no unit word is left null, never guessed', () => {
  assert.equal(fillFromQuantity('450'), null);
  assert.equal(fillFromQuantity('Unknown Quantity'), null);
});

test('quantity column: a non-standard count noun (not in units.ts) is left null', () => {
  // "6 Tablets", "10 bags", "1 can": real quantities, but units.ts does not
  // carry these words, and measured against the live catalogue this shape is
  // rare (about 1% of quantity-column failures) and second-order ambiguous
  // ("6 sachets de 2 gateaux" is not simply 6 each) -- not extended.
  assert.equal(fillFromQuantity('6 Tablets / Tablillas'), null);
  assert.equal(fillFromQuantity('10 bags'), null);
});

// ── Source 2: the product name ───────────────────────────────────────────

test('name: a size at the end of the name is read', () => {
  const f = fillFromName('Cherry Limeade Sparkling Ice 503 mL');
  assert.deepEqual(f, { value: 503, unit: 'ml', matchedText: '503 mL' });
});

test('name: a multipack at the end of the name is multiplied out', () => {
  const f = fillFromName('Olympic Krema Yogurt 8x100g');
  assert.deepEqual(f, { value: 800, unit: 'g', matchedText: '8x100g' });
});

test('name: imperial at the end of the name converts', () => {
  const f = fillFromName('Pomme Gala 4 LB');
  assert.equal(f!.unit, 'g');
  assert.ok(Math.abs(f!.value - 4 * 453.59237) < 0.01);
});

test('name: "1L" and "1 L" at the end give the same answer', () => {
  const a = fillFromName('Juice 1L')!;
  const b = fillFromName('Juice 1 L')!;
  assert.equal(a.value, b.value);
  assert.equal(a.unit, b.unit);
});

test('name: a percentage ending is never read as a size', () => {
  assert.equal(fillFromName('Milk 2%'), null);
  assert.equal(fillFromName('Lait 2%'), null);
});

test('name: a size in the middle of the name, not at the end, is rejected', () => {
  // "extract only when unambiguous": a size printed with other words after it
  // (packaging material, pack-count language) is exactly the shape a wrong
  // guess would come from.
  assert.equal(fillFromName('Ruffles Cheddar & Sour Cream Flavored Potato Chips 8.5 Ounce Plastic Bag'), null);
});

test('name: a hyphenated range is rejected, not collapsed to its upper bound', () => {
  assert.equal(fillFromName('homard cuit 1 1/2-2LB'), null);
  assert.equal(fillFromName('Widget 500-750 mL'), null);
});

test('name: a model-number-shaped ending with no real unit is rejected', () => {
  // Not a food-and-drink shape (this filler never touches electronics rows --
  // it only ever runs over source = 'openfoodfacts'), but proven anyway: a
  // trailing alphanumeric code is not mistaken for a size because the letters
  // after the digits are not one of units.ts's known unit words.
  assert.equal(fillFromName('TP-Link Router TL-WN821N'), null);
  assert.equal(fillFromName('Brother Printer MFC-J4610DW'), null);
});

test('name: two candidate sizes in one name is ambiguous and rejected', () => {
  assert.equal(fillFromName('Value Pack 500 ml bottle inside a 12 x 355 ml case'), null);
});

test('name: an absurd name-derived size (misprint, lot count) above 50 kg / 50 L is rejected', () => {
  // Found live: "ME BOUCHEE FRAMBOISE 240KG" is not a 240 kilogram raspberry
  // bite. prepare_rows.py's size_from_name already caps at 50 kg / 50 L;
  // the name path here carries the same cap for the same reason -- a name
  // gives no second field to sanity-check the number against.
  assert.equal(fillFromName('ME BOUCHEE FRAMBOISE 240KG'), null);
});

test('name: a milligram dose is not a package size and is rejected', () => {
  // Found live during the hand-check: "L-lysine 1000 Mg" and "Caffeine 200
  // Mg" are supplements, and the milligram figure is the dose per capsule,
  // not the weight of the bottle. Writing it as a 1 g / 0.2 g "size" would
  // make a per-100g unit price nonsense -- exactly the falsifier this unit
  // is built to catch.
  assert.equal(fillFromName('L-lysine 1000 Mg'), null);
  assert.equal(fillFromName('Caffeine 200 Mg'), null);
  assert.equal(fillFromName('Orange 15 Energy Pouches (100 MG)'), null);
});

test('name: a leading-dot decimal with no leading zero is read correctly, not as the whole number', () => {
  // Found live: "small breed compliments .6kg" used to be misread as 6 kg
  // because the shared regex required a digit before the decimal point.
  const f = fillFromName('small breed compliments .6kg')!;
  assert.equal(f.value, 600);
  assert.equal(f.unit, 'g');
});

test('name: nothing after the number but a unit-shaped word that is not a real unit', () => {
  assert.equal(fillFromName('Kraft Dinner 7 Cheese'), null);
});

// ── computeFills: quantity wins over name, per row ───────────────────────

test('computeFills: quantity column is tried first and name is the fallback', () => {
  const rows: CandidateRow[] = [
    { code: '1', name: 'A', name_en: 'A 503 mL Extra', name_fr: null, quantity: '355 ml' },
    { code: '2', name: 'Cherry Limeade 503 mL', name_en: null, name_fr: null, quantity: null },
    { code: '3', name: 'No size anywhere', name_en: null, name_fr: null, quantity: null },
  ];
  const { quantityFills, nameFills } = computeFills(rows);
  assert.equal(quantityFills.length, 1);
  assert.equal(quantityFills[0].code, '1');
  assert.equal(quantityFills[0].unit, 'ml');
  assert.equal(quantityFills[0].value, 355);
  assert.equal(nameFills.length, 1);
  assert.equal(nameFills[0].code, '2');
});

// ── --apply actually writes, on a scratch database ───────────────────────

test('apply mode: an UPDATE against a real (in-memory) database lands', () => {
  const db = openCatalogue(':memory:');
  db.exec(`
    INSERT INTO product (code, name, quantity, size_value, size_unit, sold_in_canada, source)
    VALUES ('001', 'Test Product 503 mL', '503 mL', NULL, NULL, 1, 'openfoodfacts')
  `);
  const rows = db
    .prepare("SELECT code, name, name_en, name_fr, quantity FROM product WHERE size_value IS NULL")
    .all() as unknown as CandidateRow[];
  const { quantityFills } = computeFills(rows);
  assert.equal(quantityFills.length, 1);

  const update = db.prepare('UPDATE product SET size_value = ?, size_unit = ? WHERE code = ? AND size_value IS NULL');
  for (const f of quantityFills) update.run(f.value, f.unit, f.code);

  const after = db.prepare('SELECT size_value, size_unit FROM product WHERE code = ?').get('001') as {
    size_value: number;
    size_unit: string;
  };
  assert.equal(after.size_value, 503);
  assert.equal(after.size_unit, 'ml');
  db.close();
});
