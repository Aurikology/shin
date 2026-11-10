/**
 * The app's half of "Statistics Canada averages price a staple before Claude is asked" (RULINGS):
 * the build says it knows the source, keeps a `national_average` verdict and range instead of
 * refusing them, and words where the price came from (Jamin's notes 2026-11-08 14:00 and 15:00).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usableVerdict, BASES as VERDICT_BASES } from '../public/js/lib/verdict-chart.js';
import { usableRange, provenanceOf, BASES as RANGE_BASES } from '../public/js/lib/catalogue-range.js';
import { liftNationalAverage } from '../public/js/api.js';
import { TABLES } from '../public/js/ui-strings.js';

const NA = { product: 'Eggs, 1 dozen', place: 'Ontario', month: '2026-09', averageCents: 502, premium: false, sizeAssumed: false };

test('both lists accept national_average', () => {
  assert.ok(VERDICT_BASES.includes('national_average'));
  assert.ok(RANGE_BASES.includes('national_average'));
  assert.ok(usableRange({ lowCents: 400, highCents: 600, basis: 'national_average' }));
});

test('the answer-level nationalAverage reaches the verdict and the range', () => {
  const answer = liftNationalAverage({ verdict: { kind: 'distribution', centreCents: 520, sigmaLog: 0.2, basis: 'national_average' }, range: { lowCents: 400, highCents: 650, basis: 'national_average' }, nationalAverage: NA });
  const v = usableVerdict(answer.verdict);
  assert.equal(v.basis, 'national_average');
  assert.deepEqual(v.nationalAverage, NA);
  assert.deepEqual(answer.range.nationalAverage, NA);
  assert.equal(liftNationalAverage(null), null);
  assert.equal(usableVerdict({ kind: 'distribution', centreCents: 520, sigmaLog: 0.2, nationalAverage: { place: 'x', month: 'bad' } }).nationalAverage, null);
});

test('the range card words the source, with the product when its size was assumed', () => {
  const r = { lowCents: 400, highCents: 650, basis: 'national_average', nationalAverage: NA };
  assert.deepEqual(provenanceOf(r), { key: 'cat_basis_statcan', facts: { place: 'Ontario', month: '2026-09' } });
  const sized = provenanceOf({ ...r, nationalAverage: { ...NA, product: 'Butter, 454 grams', sizeAssumed: true } });
  assert.equal(sized.key, 'cat_basis_statcan_sized');
  assert.equal(provenanceOf({ lowCents: 400, highCents: 650, basis: 'national_average' }).key, 'cat_basis_statcan_bare');
});

test('English and French say it in words, with the month spelled out', () => {
  assert.equal(TABLES.en.cat_basis_statcan({ place: 'Ontario', month: '2026-09' }), "Based on Statistics Canada's average for Ontario, September 2026, adjusted to regular shelf prices");
  assert.match(TABLES.fr.cat_basis_statcan({ place: 'Quebec', month: '2026-09' }), /septembre 2026/);
  assert.match(TABLES.en.cat_basis_statcan_sized({ place: 'Canada', month: '2026-09', product: 'Butter, 454 grams' }), /for Butter, 454 grams,/);
  for (const lang of ['en', 'fr']) for (const k of ['vd_prov_national_average', 'vd_why_national_average', 'vd_basis_national_average', 'cat_basis_statcan_bare']) assert.ok(TABLES[lang][k], `${lang}.${k}`);
});
