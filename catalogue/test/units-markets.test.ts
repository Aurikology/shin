/**
 * Items 19 and 20: one unit conversion, and no Canada baked in.
 *
 * Each test here fails if the behaviour it names is removed. The pairs that
 * matter most: the verdict-parity test (a second copy of the conversion that
 * drifts from the verdict's is exactly the bug item 20 names) and the currency
 * tests (a price in another currency is never compared, never converted).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, rebuildCategories } from '../src/schema.ts';
import { alternativesFor, type PricedProduct } from '../src/alternatives.ts';
import type { Candidate } from '../src/search.ts';
import { comparability, countryCodeOf, formatMoney, marketFromLocation, marketPromptFields, samePriceBasis, UNKNOWN_MARKET } from '../src/market.ts';
import { parseQuantity, sqlBaseValue, toComparison, unitPriceCents } from '../src/units.ts';
import { judge } from '../../price/src/verdict.ts';

// ── Item 20: the unit conversion ─────────────────────────────────────────────

test('units: kilograms and litres convert to grams and millilitres, and the original is kept', () => {
  const kg = toComparison(2, 'kg')!;
  assert.equal(kg.baseValue, 2000);
  assert.equal(kg.baseUnit, 'g');
  assert.deepEqual(kg.original, { value: 2, unit: 'kg' });
  const l = toComparison(1.5, 'L')!;
  assert.equal(l.baseValue, 1500);
  assert.equal(l.label, '100 ml');
  assert.deepEqual(l.original, { value: 1.5, unit: 'L' });
});

test('units: the same conversion the verdict uses gives the verdict\'s own numbers', () => {
  // The verdict's private table (price/src/verdict.ts UNIT_SCALE, D-061) is the
  // reference. This drives the real `judge` and compares, unit by unit.
  for (const [value, unit] of [[12, 'ea'], [2, 'kg'], [1.5, 'l'], [500, 'g'], [250, 'ml']] as const) {
    const v = judge({
      shelfCents: 599,
      observations: [{ seller: 'A', amountCents: 599, kind: 'regular', observedAt: '2026-09-01', preTax: true }],
      sizeValue: value,
      sizeUnit: unit,
      now: new Date('2026-09-02T00:00:00Z'),
    });
    const mine = unitPriceCents(599, value, unit)!;
    assert.ok(v.regular?.unitCents !== null && v.regular?.unitCents !== undefined, `verdict gave no unit price for ${value} ${unit}`);
    assert.ok(Math.abs(v.regular!.unitCents! - mine.unitCents) < 1e-9, `${value} ${unit}: verdict ${v.regular!.unitCents}, units.ts ${mine.unitCents}`);
    assert.equal(v.regular!.unitLabel, mine.label);
  }
});

test('units: the verdict gives no unit price for a unit nobody can convert, where it used to say grams', () => {
  const obs = [{ seller: 'A', amountCents: 599, kind: 'regular' as const, observedAt: '2026-09-01', preTax: true }];
  const now = new Date('2026-09-02T00:00:00Z');
  const sheets = judge({ shelfCents: 599, observations: obs, sizeValue: 12, sizeUnit: 'sheets', now });
  assert.equal(sheets.regular!.unitCents, null);
  assert.equal(sheets.regular!.unitLabel, null);
  // And a unit the old table did not know but this one does is converted, not called grams.
  const oz = judge({ shelfCents: 599, observations: obs, sizeValue: 16, sizeUnit: 'oz', now });
  assert.ok(Math.abs(oz.regular!.unitCents! - (599 / (16 * 28.349523125)) * 100) < 1e-9);
});

test('units: imperial sizes convert, and an unknown unit is not comparable rather than treated as grams', () => {
  assert.ok(Math.abs(toComparison(1, 'lb')!.baseValue - 453.59237) < 1e-6);
  assert.ok(Math.abs(toComparison(12, 'fl oz')!.baseValue - 354.88) < 0.01);
  assert.equal(toComparison(5, 'furlongs'), null);
  assert.equal(toComparison(0, 'g'), null);
  assert.equal(toComparison(null, 'g'), null);
});

test('units: a printed quantity is read, a multipack is multiplied out, a comma decimal is a decimal', () => {
  assert.deepEqual(parseQuantity('500 g'), { value: 500, unit: 'g', packCount: null });
  assert.deepEqual(parseQuantity('6 x 355 ml'), { value: 2130, unit: 'ml', packCount: 6 });
  assert.equal(parseQuantity('1,5 l')!.value, 1.5);
  assert.equal(parseQuantity('a nice jar'), null);
});

test('units: a leading-dot decimal with no leading zero reads as the fraction it is', () => {
  // Found live (catalogue/src/size-fill.ts, unit 7): ".6kg" used to match on
  // the bare "6" because the number group required a digit before the
  // decimal point, silently turning 0.6 kg into 6 kg. Wrong is worse than
  // missing here, so this is a correctness fix, not a feature.
  assert.equal(parseQuantity('.6kg')!.value, 0.6);
  assert.equal(parseQuantity('.6kg')!.unit, 'kg');
});

test('units: a zero multiplier ("0 x 88 ml") is rejected, not silently dropped to 88 ml', () => {
  // `pack ? pack * each : each` treated a multiplier of exactly 0 the same as
  // "no multiplier was given", because 0 is falsy in JavaScript. Found live
  // in a real quantity string ("Crunchy almond", "0 x 88 ml"). A multipack of
  // zero copies is not a real quantity, so it is null now, not a guess.
  assert.equal(parseQuantity('0 x 88 ml'), null);
});

test('units: the SQL conversion is built from the same table as the TypeScript one', () => {
  const db = openCatalogue(':memory:');
  // The expression takes column names, so use a tiny table.
  db.exec('CREATE TABLE t (v REAL, u TEXT)');
  db.exec("INSERT INTO t VALUES (2, 'kg'), (1.5, 'L'), (500, 'g'), (1, 'lb'), (3, 'nonsense')");
  const rows = db.prepare(`SELECT v, u, ${sqlBaseValue('v', 'u')} AS b FROM t`).all() as unknown as { v: number; u: string; b: number | null }[];
  for (const r of rows) {
    const ts = toComparison(r.v, r.u);
    assert.equal(r.b === null ? null : Math.round(r.b * 1e6) / 1e6, ts === null ? null : Math.round(ts.baseValue * 1e6) / 1e6, `${r.v} ${r.u}`);
  }
});

// ── the fixture, as in alternatives.test.ts ──────────────────────────────────

const PB = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];

function candidate(over: Partial<Candidate> & { code: string }): Candidate {
  return {
    name: 'x', nameEn: null, nameFr: null, brands: null, quantity: null,
    sizeValue: 500, sizeUnit: 'g', leafCategory: 'en:peanut-butters',
    categoryPath: PB, allergens: [], soldInCanada: true, source: 'openfoodfacts',
    genericName: null, nutriscoreGrade: null, novaGroup: null, additivesN: null, ingredientsText: null,
    signals: { textRank: null, vectorRank: null, bm25: null, similarity: null, rrf: 0, brandAgrees: null, sizeAgrees: null },
    ...over,
  };
}

function fixture(rows: [string, number | null, string | null, number, string?][]) {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const [code, size, unit, canada, source] of rows) {
    insert.run(code, `Row ${code}`, `Row ${code}`, null, null, null, size, unit,
      JSON.stringify(PB), 'en:peanut-butters', '[]', canada, source ?? 'openfoodfacts');
  }
  rebuildFts(db);
  rebuildCategories(db);
  return db;
}

function prices(spec: Record<string, number | { amountCents: number; currency?: string }>) {
  return async (codes: readonly string[]) => {
    const m = new Map<string, PricedProduct>();
    for (const c of codes) {
      const s = spec[c];
      if (s === undefined) continue;
      m.set(c, {
        code: c,
        amountCents: typeof s === 'number' ? s : s.amountCents,
        ...(typeof s === 'number' || s.currency === undefined ? {} : { currency: s.currency }),
        seller: 'walmart.ca', observedAt: '2026-09-04', storeName: null, storeCity: null, joinMethod: 'name',
      });
    }
    return m;
  };
}

test('item 20: a 2 kg pack is compared per 100 g against a 500 g pack, on the converted number', async () => {
  // Before: 'kg' !== 'g' so the unit basis was refused, and a 2 kg row priced
  // "per 100 g" without conversion would have been a thousand times too high.
  const db = fixture([['A', 500, 'g', 1], ['K', 2, 'kg', 1]]);
  const alts = await alternativesFor(db, candidate({ code: 'A' }), 800, prices({ K: 1600 }));
  assert.equal(alts.length, 1);
  assert.equal(alts[0].basis, 'unit');
  // 800 c per 500 g = 160 c per 100 g; 1600 c per 2000 g = 80 c per 100 g.
  assert.equal(Math.round(alts[0].unitCents!), 80);
  assert.ok(Math.abs(alts[0].cheaperBy - 0.5) < 1e-9);
  assert.deepEqual(alts[0].originalSize, { value: 2, unit: 'kg' }, 'the original size is kept beside the converted price');
  assert.match(alts[0].line, /\$0\.80 per 100 g/);
});

test('item 20: a litre row and a millilitre original are one family, a gram row is not', async () => {
  const db = fixture([['A', 500, 'ml', 1], ['L', 1, 'l', 1], ['G', 500, 'g', 1]]);
  const original = candidate({ code: 'A', sizeValue: 500, sizeUnit: 'ml' });
  const alts = await alternativesFor(db, original, 400, prices({ L: 500, G: 100 }));
  const byCode = new Map(alts.map((a) => [a.product.code, a]));
  assert.equal(byCode.get('L')!.basis, 'unit');
  assert.equal(byCode.get('G')!.basis, 'ticket', 'grams against millilitres is never a unit comparison');
});

test('item 15/20: a tech original is never compared by weight, whatever size it records', async () => {
  const db = fixture([['T1', 250, 'g', 1, 'icecat'], ['T2', 250, 'g', 1, 'icecat']]);
  const original = candidate({ code: 'T1', source: 'icecat', sizeValue: 250, sizeUnit: 'g' });
  const alts = await alternativesFor(db, original, 90000, prices({ T2: 70000 }));
  assert.equal(alts.length, 1);
  assert.equal(alts[0].basis, 'ticket');
  assert.equal(alts[0].unitCents, null);
  assert.ok(!/per 100/.test(alts[0].line), alts[0].line);
});

// ── Item 19: no Canada baked in ──────────────────────────────────────────────

test('market: derived from the user\'s location, never defaulted', () => {
  assert.equal(marketFromLocation({ country: 'us' }).currency, 'USD');
  assert.equal(marketFromLocation({ country: 'FR' }).currency, 'EUR');
  assert.equal(marketFromLocation({ country: 'JP' }).country, 'JP');
  assert.equal(marketFromLocation({ country: 'CA', currency: 'usd' }).currency, 'USD', 'an explicit currency outranks the table');
  assert.deepEqual(marketFromLocation(null), UNKNOWN_MARKET);
  assert.equal(marketFromLocation({}).currency, null, 'no location is not Canadian dollars');
  assert.equal(marketFromLocation({ country: 'Canada' }).country, null, 'not an ISO code is not guessed');
});

test('market: the country a user picked by name resolves to its code, and an unknown name stays unknown (item 19)', () => {
  assert.equal(countryCodeOf('Canada'), 'CA');
  assert.equal(countryCodeOf('united states'), 'US');
  assert.equal(countryCodeOf('France'), 'FR');
  assert.equal(countryCodeOf('de'), 'DE');
  assert.equal(countryCodeOf('Atlantis'), null, 'a name the table does not know is not guessed');
  assert.equal(countryCodeOf(null), null);
  assert.equal(countryCodeOf('  '), null);
  assert.equal(marketFromLocation({ country: countryCodeOf('Germany') }).currency, 'EUR');
});

test('market: same country compares, different countries do not, EU can, unknown claims nothing', () => {
  const ca = marketFromLocation({ country: 'CA', region: 'ON' });
  const caBc = marketFromLocation({ country: 'CA', region: 'BC' });
  const us = marketFromLocation({ country: 'US' });
  const fr = marketFromLocation({ country: 'FR' });
  const de = marketFromLocation({ country: 'DE' });
  assert.equal(comparability(ca, ca).comparability, 'same_country');
  assert.equal(comparability(ca, caBc).regionMatters, true, 'provinces can price differently');
  assert.equal(comparability(ca, us).comparability, 'different_country');
  assert.equal(comparability(fr, de).comparability, 'possibly_alike');
  assert.equal(comparability(ca, UNKNOWN_MARKET).comparability, 'unknown');
});

test('market: the prompt placeholders are filled from the user\'s location and say unknown when it is', () => {
  const ca = marketPromptFields(marketFromLocation({ country: 'CA', region: 'ON' }));
  assert.equal(ca.MARKET_CURRENCY_OR_UNKNOWN, 'CAD');
  assert.equal(ca.REGION_MATTERS_HINT, 'yes');
  assert.equal(ca.CROSS_BORDER_HINT, 'different_country_not_comparable');
  assert.equal(marketPromptFields(marketFromLocation({ country: 'FR' })).CROSS_BORDER_HINT, 'possibly_alike');
  const none = marketPromptFields(UNKNOWN_MARKET);
  assert.equal(none.MARKET_COUNTRY_OR_UNKNOWN, 'unknown');
  assert.equal(none.MARKET_CURRENCY_OR_UNKNOWN, 'unknown', 'no location never becomes CAD');
});

test('market: prices in different or unknown currencies never share a basis', () => {
  assert.equal(samePriceBasis('CAD', 'cad'), true);
  assert.equal(samePriceBasis('CAD', 'USD'), false);
  assert.equal(samePriceBasis('CAD', null), false);
  assert.equal(samePriceBasis(null, null), false);
});

test('market: money prints in its own currency and never as a bare dollar sign unless the currency is unknown', () => {
  assert.equal(formatMoney(1250, 'EUR'), '€12.50');
  assert.equal(formatMoney(1250, 'INR'), '12.50 INR');
  assert.equal(formatMoney(1250, 'CAD'), '$12.50');
  assert.equal(formatMoney(1250, null), '$12.50');
});

test('item 19: a US shopper is never offered a Canadian price with no stated currency', async () => {
  const db = fixture([['A', 500, 'g', 1], ['B', 500, 'g', 1]]);
  const us = marketFromLocation({ country: 'US' });
  const bare = await alternativesFor(db, candidate({ code: 'A' }), 800, prices({ B: 500 }), { market: us });
  assert.equal(bare.length, 0, 'an unstated currency is trusted only where the catalogue vouches for the market');
  const stated = await alternativesFor(db, candidate({ code: 'A' }), 800, prices({ B: { amountCents: 500, currency: 'USD' } }), { market: us });
  assert.equal(stated.length, 1);
  assert.equal(stated[0].currency, 'USD');
  assert.equal(stated[0].marketVerified, true);
  assert.match(stated[0].line, /\$1\.00 per 100 g/);
});

test('item 19: a price in another currency is dropped, never converted', async () => {
  const db = fixture([['A', 500, 'g', 1], ['B', 500, 'g', 1]]);
  const ca = marketFromLocation({ country: 'CA' });
  const alts = await alternativesFor(db, candidate({ code: 'A' }), 800, prices({ B: { amountCents: 100, currency: 'USD' } }), { market: ca });
  assert.equal(alts.length, 0, 'a 1.00 USD row is not "cheaper" than an 8.00 CAD one; the numbers are not comparable');
});

test('item 19: a euro market prints euros in the sentence and the structured facts carry the currency', async () => {
  const db = fixture([['A', 500, 'g', 0], ['B', 500, 'g', 0]]);
  const fr = marketFromLocation({ country: 'FR' });
  const alts = await alternativesFor(db, candidate({ code: 'A', soldInCanada: false }), 800, prices({ B: { amountCents: 500, currency: 'EUR' } }), { market: fr });
  assert.equal(alts.length, 1, 'a row not sold in Canada is offered to a French shopper: the Canadian flag is not their filter');
  assert.match(alts[0].line, /€/);
  assert.ok(!/\$/.test(alts[0].line), alts[0].line);
  const first = alts[0].structuredLine.fragments[0];
  assert.equal(first.facts.currency, 'EUR');
});
