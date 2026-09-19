/**
 * Google Doc audit rows 14, 15, 34: the market picker offers every country in the
 * world with its ISO codes, the region step exists where regions change prices,
 * the region is stored and sent, and nothing defaults to Canada.
 *
 * Each test fails if the thing it guards is undone: shrink the list, drop the
 * region from the request, or put a Canada default back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const c = await import('../public/js/lib/countries.js');
const store = await import('../public/js/store.js');
const { scanContextFrom } = await import('../public/js/lib/scan-body.js');

const JS_DIR = fileURLToPath(new URL('../public/js/', import.meta.url));

test('the list has every country in the world, not a handful (row 14)', () => {
  assert.ok(c.COUNTRIES.length >= 240, `only ${c.COUNTRIES.length} countries: the list shrank`);
  // One from every continent, small and large, and the three the picker used to have.
  for (const code of ['CA', 'US', 'GB', 'FR', 'DE', 'JP', 'IN', 'CN', 'BR', 'AU', 'NZ', 'ZA', 'NG', 'EG', 'KE', 'MX',
    'AR', 'KZ', 'BD', 'IS', 'TV', 'KI', 'VA', 'MC', 'SG', 'AE', 'SA', 'TR', 'UA', 'NP', 'PG', 'FJ', 'CU', 'ET', 'MA']) {
    assert.ok(c.countryByCode(code), `${code} is missing from the country list`);
  }
});

test('every country has an ISO 3166 code, a currency code and both names (row 14)', () => {
  const seen = new Set();
  for (const k of c.COUNTRIES) {
    assert.match(k.code, /^[A-Z]{2}$/, k.en);
    assert.match(k.currency, /^[A-Z]{3}$/, k.en);
    assert.ok(k.en.trim() && k.fr.trim(), `${k.code} has no name in both languages`);
    assert.ok(!seen.has(k.code), `${k.code} is listed twice`);
    seen.add(k.code);
  }
});

test('the list is alphabetised in the reader\'s language and searches as you type (row 14)', () => {
  const en = c.searchCountries('', 'en').map((k) => k.en);
  const fr = c.searchCountries('', 'fr').map((k) => k.fr);
  assert.equal(en.length, c.COUNTRIES.length);
  const sorted = (xs, loc) => xs.every((x, i) => i === 0 || new Intl.Collator(loc).compare(xs[i - 1], x) <= 0);
  assert.ok(sorted(en, 'en'), 'English list is not alphabetical');
  assert.ok(sorted(fr, 'fr'), 'French list is not alphabetical');
  assert.deepEqual(c.searchCountries('germ', 'en').map((k) => k.code), ['DE']);
  assert.ok(c.searchCountries('etats', 'fr').some((k) => k.code === 'US'), 'accents must not block a match');
  assert.ok(c.searchCountries('allemagne', 'en').some((k) => k.code === 'DE'), 'French names must match in English mode');
  assert.ok(c.searchCountries('jp', 'en').some((k) => k.code === 'JP'), 'the ISO code must match');
  assert.ok(c.searchCountries('eur', 'en').some((k) => k.code === 'FR'), 'the currency code must match');
  assert.equal(c.searchCountries('zzzz', 'en').length, 0, 'nonsense matched something');
});

test('names read in English and French, and the French preposition is data, not glue (row 14)', () => {
  assert.equal(c.countryName(c.countryByCode('DE'), 'en'), 'Germany');
  assert.equal(c.countryName(c.countryByCode('DE'), 'fr'), 'Allemagne');
  assert.equal(c.countryInPhrase(c.countryByCode('CA'), 'fr'), 'au Canada');
  assert.equal(c.countryInPhrase(c.countryByCode('US'), 'fr'), 'aux États-Unis');
  assert.equal(c.countryInPhrase(c.countryByCode('FR'), 'fr'), 'en France');
  assert.equal(c.countryInPhrase(c.countryByCode('US'), 'en'), 'in the United States');
  assert.equal(c.countryInPhrase(c.countryByCode('JP'), 'en'), 'in Japan');
  assert.equal(c.findCountry('Etats-Unis')?.code, 'US');
  assert.equal(c.findCountry('nowhere'), null, 'an unknown country must stay unknown');
});

test('regions exist for Canada and the US, and the table extends by country code (row 15)', () => {
  assert.equal(c.regionsOf('CA').length, 13, 'Canada is ten provinces and three territories');
  assert.ok(c.regionsOf('US').length >= 51, 'US states and DC');
  assert.equal(c.findRegion('CA', 'Ontario')?.code, 'ON');
  assert.equal(c.findRegion('CA', 'Québec')?.en, 'Quebec');
  assert.equal(c.findRegion('CA', 'Texas'), null, 'a US state must not resolve inside Canada');
  assert.deepEqual(c.regionsOf('KZ'), [], 'a country with no region table has no region step');
  assert.ok(Object.keys(c.REGIONS).length >= 3, 'the region table shrank');
});

test('a fresh user has no market, and no country, region or code is assumed (row 34)', () => {
  const m = store.market();
  assert.deepEqual({ ...m }, { country: '', currency: '', code: '', region: '' });
});

test('picking a country stores its code, and a region only sticks inside that country (row 15)', () => {
  store.setMarket('Japan', 'JPY');
  assert.equal(store.market().code, 'JP', 'the code is looked up from the name');
  store.setRegion('Ontario');
  assert.equal(store.market().region, '', 'a region the country does not have was stored');
  store.setMarket('Canada', 'CAD', 'CA');
  store.setRegion('Ontario');
  assert.equal(store.market().region, 'Ontario');
  store.setMarket('Canada', 'CAD', 'CA');
  assert.equal(store.market().region, 'Ontario', 're-picking the same country cleared the region');
  store.setMarket('United States', 'USD', 'US');
  assert.equal(store.market().region, '', 'a region survived a change of country');
  store.setRegion('Texas');
  assert.equal(store.market().region, 'Texas');
  store.setRegion('');
  assert.equal(store.market().region, '', 'an unchosen region must clear to unknown');
});

test('the scan context carries the code and the region, and only what the user chose (rows 14, 15)', () => {
  assert.deepEqual(
    scanContextFrom({ market: { country: 'Canada', currency: 'CAD', code: 'CA', region: 'Ontario' } }),
    { market: 'Canada', currency: 'CAD', countryCode: 'CA', region: 'Ontario' },
  );
  // A market saved before codes were stored still resolves one from the name.
  assert.equal(scanContextFrom({ market: { country: 'Brazil', currency: 'BRL' } }).countryCode, 'BR');
  // A country the table does not know sends no code and invents none.
  assert.equal(scanContextFrom({ market: { country: 'Atlantis', currency: '' } }).countryCode, undefined);
  assert.deepEqual(scanContextFrom({ market: { country: '', currency: '', code: '', region: '' } }), {});
  // No country: a region alone means nothing and is not sent.
  assert.equal(scanContextFrom({ market: { country: '', region: 'Ontario' } }).region, undefined);
});

/** Every .js file under the client folder. */
function clientFiles(dir = JS_DIR) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? clientFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('no client file defaults the market to Canada or to CAD (row 34)', () => {
  const offenders = [];
  for (const file of clientFiles()) {
    const src = readFileSync(file, 'utf8');
    if (/(\|\||\?\?)\s*['"]Canada['"]/.test(src)) offenders.push(`${file}: || 'Canada'`);
    if (/(\|\||\?\?)\s*['"]CAD['"]/.test(src)) offenders.push(`${file}: || 'CAD'`);
    if (/market:\s*\{\s*country:\s*['"]Canada['"]/.test(src)) offenders.push(`${file}: market pre-filled with Canada`);
  }
  assert.deepEqual(offenders, [], 'a Canada default is back');
});

test('the market screen lists the whole table and has a search box and a region step (rows 14, 15)', () => {
  const src = readFileSync(new URL('../public/js/screens/market.js', import.meta.url), 'utf8');
  assert.match(src, /searchCountries\(query, lang\(\)\)/, 'the screen no longer lists the table');
  assert.match(src, /type="search"/);
  assert.match(src, /store\.setRegion\(/);
  assert.match(src, /store\.setMarket\(row\.dataset\.country, row\.dataset\.currency, row\.dataset\.code\)/);
  assert.doesNotMatch(src, /const MARKETS = \[/, 'the three-entry list is back');
});
