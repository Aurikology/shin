/**
 * Row 34 (docs/audit-google-doc-2026-09-19.md) and beta-gaps rule 8: prices are
 * written in the currency they are in, never as Canadian dollars, never
 * converted, with one formatter for the whole client.
 *
 * Two kinds of check. The source half fails if the CAD-only `cad()` helper, a
 * second copy of the market helper, or a hard-coded 'CAD' comes back into any
 * client file. The behaviour half formats real cents against real markets and
 * fails if a non-Canadian market ever prints as Canadian dollars.
 *
 * `sold_in_canada` in server.ts is NOT a formatter: it mirrors a column of the
 * catalogue database and stays.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const JS_ROOT = fileURLToPath(new URL('../public/js/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const FILES = walk(JS_ROOT).map((full) => ({
  rel: relative(JS_ROOT, full).split(sep).join('/'),
  text: readFileSync(full, 'utf8'),
}));

const store = await import('../public/js/store.js');
const { money } = await import('../public/js/lib/money.js');
const { observationCard } = await import('../public/js/screens/camera.js');

/** Run `fn` with the user's market set, then clear it. */
function inMarket(country, currency, fn) {
  store.setMarket(country, currency);
  try {
    return fn();
  } finally {
    store.setMarket('', '');
  }
}

/* ------------------------------------------------------------------ source */

test('cad() is gone from every client file, comments included', () => {
  assert.ok(FILES.length > 20, 'the walk found almost no client files, so it proves nothing');
  const hits = FILES.filter((f) => /\bcad\(/.test(f.text)).map((f) => f.rel);
  assert.deepEqual(hits, [], `cad( is back in: ${hits.join(', ')}`);
  assert.deepEqual(FILES.filter((f) => /\bexport (function|const) cad\b/.test(f.text)).map((f) => f.rel), []);
});

test('there is one money formatter, in lib/money.js, and no second copy anywhere', () => {
  const definers = FILES.filter((f) => /\b(function|const) (money|marketMoney|formatMoney|cad)\b/.test(f.text)).map((f) => f.rel);
  assert.deepEqual(definers, ['lib/money.js'], `a second money formatter exists: ${definers.join(', ')}`);
});

test("no client file hard-codes 'CAD' outside the country table and the formatter", () => {
  const hits = FILES.filter((f) => f.rel !== 'lib/countries.js' && f.rel !== 'lib/money.js' && /['"]CAD['"]/.test(f.text)).map((f) => f.rel);
  assert.deepEqual(hits, [], `CAD is written into: ${hits.join(', ')}`);
});

test('the screens that show a price import the one formatter', () => {
  for (const rel of ['screens/camera.js', 'screens/pastscans.js', 'screens/removed.js', 'screens/share.js', 'screens/savings.js', 'screens/watchlist.js', 'prose.js']) {
    const text = FILES.find((f) => f.rel === rel)?.text ?? '';
    assert.ok(/import \{[^}]*\bmoney\b[^}]*\} from '(\.\.\/|\.\/)lib\/money\.js'/.test(text), `${rel} does not import money from lib/money.js`);
  }
});

/* --------------------------------------------------------------- behaviour */

test('a non-CAD market never formats as Canadian dollars', () => {
  const cases = [
    ['France', 'EUR', /€/],
    ['United Kingdom', 'GBP', /£/],
    ['Japan', 'JPY', /¥/],
    ['India', 'INR', /₹|INR/],
    ['Switzerland', 'CHF', /CHF/],
  ];
  for (const [country, currency, mark] of cases) {
    for (const tag of ['en-CA', 'fr-CA']) {
      const out = inMarket(country, currency, () => money(499, undefined, tag));
      assert.ok(mark.test(out), `${currency} in ${tag} is missing its own mark: ${out}`);
      assert.ok(!out.includes('$'), `${currency} in ${tag} was written with a dollar sign: ${out}`);
    }
  }
});

test('the price is never converted: same cents, same digits, only the mark and punctuation move', () => {
  const digits = (s) => s.replace(/[^0-9]/g, '');
  for (const currency of ['CAD', 'USD', 'EUR', 'GBP', '']) {
    assert.equal(digits(money(1999, currency, 'en-CA')), '1999', currency);
    assert.equal(digits(money(1999, currency, 'fr-CA')), '1999', currency);
  }
  assert.equal(digits(money(1000, 'JPY', 'en-CA')), '10', 'yen has no minor unit: 1000 cents is 10, never converted');
});

test('with no currency known the plain number shows, with no symbol at all', () => {
  assert.equal(money(499, undefined, 'en-CA'), '4.99', 'no market chosen');
  assert.equal(money(499, undefined, 'fr-CA'), '4,99');
  assert.equal(money(499, '', 'en-CA'), '4.99');
  assert.equal(money(499, 'ZZ', 'en-CA'), '4.99', 'a code that is not three letters');
  assert.equal(money(499, null, 'en-CA'), '4.99', 'null means the market, and there is none');
});

test('English and French keep their number order for CAD and USD', () => {
  for (const currency of ['CAD', 'USD']) {
    assert.equal(money(499, currency, 'en-CA'), '$4.99', currency);
    assert.equal(money(499, currency, 'fr-CA'), '4,99 $', currency);
    assert.equal(money(-499, currency, 'en-CA'), '-$4.99', currency);
    assert.equal(money(-499, currency, 'fr-CA'), '-4,99 $', currency);
  }
  assert.equal(money(499, 'EUR', 'en-CA'), '€4.99');
  assert.match(money(499, 'EUR', 'fr-CA'), /^4,99\s€$/);
});

test('a currency the answer carries wins over the market; no argument reads the market', () => {
  assert.equal(inMarket('France', 'EUR', () => money(499, 'CAD', 'en-CA')), '$4.99');
  assert.equal(inMarket('Canada', 'CAD', () => money(499, undefined, 'en-CA')), '$4.99');
  assert.equal(inMarket('France', 'EUR', () => money(499, undefined, 'en-CA')), '€4.99');
  assert.equal(inMarket('France', 'EUR', () => money(499, '', 'en-CA')), '4.99', 'an empty currency means unknown, not "use the market"');
});

test('a value that is not a number is the dash, never a thrown error', () => {
  for (const bad of [null, undefined, NaN, Infinity, 'x']) assert.equal(money(bad, 'CAD', 'en-CA'), '--');
});

test('a real screen builder prints the market currency: a euro shopper never sees a dollar', () => {
  const html = inMarket('France', 'EUR', () => observationCard(499, 'Carrefour'));
  assert.match(html, /€4\.99|4,99\s€/, 'the price card lost the euro');
  assert.ok(!/\$\s*\d/.test(html), `the price card printed a dollar sign for a euro market: ${html}`);
});
