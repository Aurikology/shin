/**
 * Audit row 15, beta-gaps item 19: the two hints that go to Gemini follow the
 * per-country flags in the region table (`app/public/js/lib/regions.js`).
 *
 * The server reads its own copy of the flags (`catalogue/src/market.ts`; the
 * catalogue does not import from the app). This file loads the region module and
 * holds that copy to it, and holds the two prompt hints to the flags, for every
 * country in the picker. Change a flag on one side only, or stop the hint
 * following the flag, and a test here fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EU_EEA, REGIONS_PRICE_DIFFERENTLY, marketFromLocation, marketPromptFields, comparability } from '../src/market.ts';

// Plain JavaScript in the app; a variable specifier keeps the type checker out of it.
const load = (p: string) => import(new URL(`../../app/public/js/lib/${p}`, import.meta.url).href);
const picker = (await load('countries.js')) as { COUNTRIES: readonly { code: string }[] };
const regions = (await load('regions.js')) as {
  REGION_MATTERS: readonly string[];
  CROSS_BORDER_BLOCS: Record<string, readonly string[]>;
  countryFlags(code: string): { regionMatters: boolean; crossBorderBloc: string | null };
};

const blocMembers = Object.values(regions.CROSS_BORDER_BLOCS).flat();

test('the server copy of the flags is the region module\'s flags (row 15)', () => {
  assert.deepEqual([...REGIONS_PRICE_DIFFERENTLY].sort(), [...regions.REGION_MATTERS].sort(), 'regionMatters differs between market.ts and regions.js');
  assert.deepEqual([...EU_EEA].sort(), [...blocMembers].sort(), 'the EU/EEA list differs between market.ts and regions.js');
});

test('REGION_MATTERS_HINT is yes exactly for the flagged countries, for every country in the picker (row 15)', () => {
  const wrong: string[] = [];
  for (const { code } of picker.COUNTRIES) {
    const hint = marketPromptFields(marketFromLocation({ country: code })).REGION_MATTERS_HINT;
    const want = regions.countryFlags(code).regionMatters ? 'yes' : 'no';
    if (hint !== want) wrong.push(`${code}: hint ${hint}, flag says ${want}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(marketPromptFields(marketFromLocation(null)).REGION_MATTERS_HINT, 'unknown', 'no country is unknown, not no');
  assert.equal(marketPromptFields(marketFromLocation({ country: 'JP' })).REGION_MATTERS_HINT, 'no');
  assert.equal(marketPromptFields(marketFromLocation({ country: 'GB' })).REGION_MATTERS_HINT, 'yes');
});

test('CROSS_BORDER_HINT is possibly_alike for a bloc country in euros, and never for anyone else (row 15)', () => {
  const wrong: string[] = [];
  for (const { code } of picker.COUNTRIES) {
    const m = marketFromLocation({ country: code });
    const hint = marketPromptFields(m).CROSS_BORDER_HINT;
    const want = regions.countryFlags(code).crossBorderBloc !== null && m.currency === 'EUR' ? 'possibly_alike' : 'different_country_not_comparable';
    if (hint !== want) wrong.push(`${code}: hint ${hint}, want ${want}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(marketPromptFields(marketFromLocation(null)).CROSS_BORDER_HINT, 'unknown');
});

test('the EEA countries are in the bloc but never claim an alike price across a currency (row 15)', () => {
  const no = marketFromLocation({ country: 'NO' });
  const is = marketFromLocation({ country: 'IS' });
  const de = marketFromLocation({ country: 'DE' });
  assert.equal(comparability(no, de).comparability, 'different_country', 'krone and euro are different currencies: nothing is converted');
  assert.equal(comparability(is, no).comparability, 'different_country');
  assert.equal(comparability(de, marketFromLocation({ country: 'FR' })).comparability, 'possibly_alike');
  assert.equal(marketPromptFields(no).CROSS_BORDER_HINT, 'different_country_not_comparable');
});
