/**
 * Google Doc audit rows 14, 15, 34, catalogue side: the server side of the market
 * knows every country the picker offers, carries the region into the prompt
 * fields, and never defaults a market.
 *
 * The picker's list is `app/public/js/lib/countries.js`. This file loads it and
 * holds the server's own tables to it, so the two cannot drift: drop a country
 * from either side, or disagree about a currency, and a test here fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENCY_OF_COUNTRY,
  UNKNOWN_MARKET,
  comparability,
  countryCodeOf,
  marketFromLocation,
  marketPromptFields,
} from '../src/market.ts';

// The picker's table is plain JavaScript in the app; a variable specifier keeps the type checker out of it.
const picker = (await import(new URL('../../app/public/js/lib/countries.js', import.meta.url).href)) as {
  COUNTRIES: readonly { code: string; currency: string; en: string }[];
};

test('the server knows the currency of every country the picker offers (row 14)', () => {
  assert.ok(picker.COUNTRIES.length >= 240, 'the picker list shrank');
  const wrong: string[] = [];
  for (const c of picker.COUNTRIES) {
    if (CURRENCY_OF_COUNTRY[c.code] !== c.currency) wrong.push(`${c.code}: picker ${c.currency}, server ${CURRENCY_OF_COUNTRY[c.code]}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(Object.keys(CURRENCY_OF_COUNTRY).length, picker.COUNTRIES.length, 'the server has countries the picker lacks');
});

test('any country resolves to a market with its currency, none is defaulted (rows 14, 34)', () => {
  for (const code of ['BD', 'KZ', 'IS', 'TV', 'NG', 'AR', 'VN']) {
    const m = marketFromLocation({ country: code });
    assert.equal(m.country, code);
    assert.match(m.currency ?? '', /^[A-Z]{3}$/, `${code} has no currency`);
  }
  assert.equal(marketFromLocation({ country: 'BG' }).currency, 'EUR', 'Bulgaria has used the euro since 2026-01-01');
  assert.equal(marketFromLocation(null), UNKNOWN_MARKET);
  assert.equal(marketFromLocation({}), UNKNOWN_MARKET);
  assert.equal(marketFromLocation({ country: '' }).currency, null, 'no country must never become CAD');
});

test('an English name the small name table lacks still resolves, and a nonsense name stays unknown (row 14)', () => {
  assert.equal(countryCodeOf('Bangladesh'), 'BD');
  assert.equal(countryCodeOf('Kazakhstan'), 'KZ');
  assert.equal(countryCodeOf('Sri Lanka'), 'LK');
  assert.equal(countryCodeOf('Canada'), 'CA');
  assert.equal(countryCodeOf('BD'), 'BD');
  assert.equal(countryCodeOf('Atlantis'), null);
  assert.equal(countryCodeOf(null), null);
});

test('the region reaches the prompt fields, and an unknown region stays "unknown" (row 15)', () => {
  const ca = marketPromptFields(marketFromLocation({ country: 'CA', region: 'Ontario' }));
  assert.equal(ca.MARKET_REGION_OR_UNKNOWN, 'Ontario');
  assert.equal(ca.REGION_MATTERS_HINT, 'yes');
  const us = marketPromptFields(marketFromLocation({ country: 'US', region: 'Texas' }));
  assert.equal(us.MARKET_REGION_OR_UNKNOWN, 'Texas');
  const noRegion = marketPromptFields(marketFromLocation({ country: 'CA' }));
  assert.equal(noRegion.MARKET_REGION_OR_UNKNOWN, 'unknown');
  const orphan = marketPromptFields(marketFromLocation({ region: 'Ontario' }));
  assert.equal(orphan.MARKET_REGION_OR_UNKNOWN, 'unknown', 'a region with no country must not travel alone');
  assert.equal(orphan.MARKET_COUNTRY_OR_UNKNOWN, 'unknown');
});

test('the same region matters, a different one does not compare, and the euro area may price alike (row 15)', () => {
  const on = marketFromLocation({ country: 'CA', region: 'Ontario' });
  assert.equal(comparability(on, marketFromLocation({ country: 'CA', region: 'ontario' })).regionMatters, false);
  assert.equal(comparability(on, marketFromLocation({ country: 'CA', region: 'Alberta' })).regionMatters, true);
  assert.equal(comparability(on, marketFromLocation({ country: 'US' })).comparability, 'different_country');
  assert.equal(comparability(marketFromLocation({ country: 'BG' }), marketFromLocation({ country: 'DE' })).comparability, 'possibly_alike');
});
