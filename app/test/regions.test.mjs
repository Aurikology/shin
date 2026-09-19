/**
 * Audit rows 14 and 15, beta-gaps item 19: the region table (`lib/regions.js`)
 * covers the countries Jamin's rule needs, is well formed, and is what the picker
 * reads. The hint side (`{{REGION_MATTERS_HINT}}`, `{{CROSS_BORDER_HINT}}`
 * following the per-country flags) is guarded in `catalogue/test/regions-flags.test.ts`.
 *
 * Each test fails if the thing it guards is undone: a country in the minimum
 * list drops to zero regions, a code is repeated inside a country, or a country
 * that is flagged as region-sensitive has no regions to choose from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const c = await import('../public/js/lib/countries.js');
const r = await import('../public/js/lib/regions.js');

/** Countries where a region can change a price or is well defined. Every one must have regions. */
const MINIMUM = [
  'CA', 'US', 'AU', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT', 'IE', 'PL', 'SE', 'NO', 'DK', 'FI', 'PT',
  'MX', 'BR', 'AR', 'CL', 'CO', 'IN', 'CN', 'JP', 'KR', 'ID', 'PH', 'MY', 'TH', 'VN', 'TR', 'SA', 'AE', 'EG', 'NG',
  'ZA', 'KE', 'NZ', 'RU', 'UA', 'PK', 'BD',
];

test('every country in the minimum list has at least one region (row 15)', () => {
  const empty = MINIMUM.filter((code) => c.regionsOf(code).length === 0);
  assert.deepEqual(empty, [], `no regions for: ${empty.join(', ')}`);
  assert.ok(Object.keys(c.REGIONS).length >= MINIMUM.length, 'the region table shrank');
});

test('the well-known counts hold, so a truncated table is caught (row 15)', () => {
  const floor = { CA: 13, US: 51, AU: 8, GB: 4, DE: 16, FR: 13, ES: 19, IT: 20, CH: 26, MX: 32, BR: 27, IN: 36, CN: 31, JP: 47, KR: 17, TR: 81, RU: 83, NG: 37, KE: 47, NZ: 16 };
  for (const [code, n] of Object.entries(floor)) {
    assert.ok(c.regionsOf(code).length >= n, `${code} has ${c.regionsOf(code).length} regions, expected at least ${n}`);
  }
});

test('a region code, and an English name, appears once inside a country (row 15)', () => {
  const problems = [];
  for (const [country, list] of Object.entries(c.REGIONS)) {
    const codes = new Set();
    const names = new Set();
    for (const region of list) {
      if (!region.code || !region.en) problems.push(`${country}: a row is missing its code or its name`);
      const k = region.code.toLowerCase();
      if (codes.has(k)) problems.push(`${country}: code ${region.code} is repeated`);
      codes.add(k);
      const n = c.normalize(region.en);
      if (names.has(n)) problems.push(`${country}: name ${region.en} is repeated`);
      names.add(n);
    }
  }
  assert.deepEqual(problems, []);
});

test('every country with regions is a real country of the picker (row 15)', () => {
  for (const country of Object.keys(r.REGION_ROWS)) {
    assert.ok(c.countryByCode(country), `${country} has regions but is not in the country list`);
  }
});

test('the picker reads the regions module and finds a region by code, English or French name (row 15)', () => {
  assert.equal(c.regionsOf('gb').length, 4, 'the four UK nations');
  assert.equal(c.findRegion('DE', 'Bavaria')?.code, 'BY');
  assert.equal(c.findRegion('FR', 'Bretagne')?.en, 'Brittany');
  assert.equal(c.findRegion('JP', 'Tokyo')?.code, '13');
  assert.equal(c.findRegion('JP', 'Texas'), null, 'a US state must not resolve inside Japan');
  assert.equal(c.findRegion('KZ', 'Almaty'), null, 'a country with no table has nothing to find');
});

test('every country that is flagged region-sensitive has regions to choose from (row 15)', () => {
  const bare = r.REGION_MATTERS.filter((code) => c.regionsOf(code).length === 0);
  assert.deepEqual(bare, [], `regionMatters is set with no region list for: ${bare.join(', ')}`);
  for (const code of r.REGION_MATTERS) assert.ok(c.countryByCode(code), `${code} is flagged but is not a country`);
  assert.deepEqual(r.countryFlags('CA'), { regionMatters: true, crossBorderBloc: null });
  assert.deepEqual(r.countryFlags('NO'), { regionMatters: false, crossBorderBloc: 'EEA' });
  assert.deepEqual(r.countryFlags('fr'), { regionMatters: true, crossBorderBloc: 'EU' });
  assert.deepEqual(r.countryFlags('JP'), { regionMatters: false, crossBorderBloc: null });
});
