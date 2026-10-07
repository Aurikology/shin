/**
 * The Licences screen is a frozen, hand-written list (RULINGS.md, "Attribution,
 * provenance and correction data"). Defect D16 was that the list had drifted
 * from the data: stale counts, and whole sources (USDA, BC liquor, ANBL,
 * Walmart, Return-It, Consignaction) in use with no credit at all.
 *
 * These tests need no database. They read the loader source files for the
 * `product.source` and `observation.seller` values the code can write, and
 * fail when one has no attribution entry and is not on the short, reasoned
 * list of keys that are deliberately uncredited.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ATTRIBUTION } from '../src/attribution.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

/**
 * Keys the databases held on 2026-10-06 (the SELECTs are in attribution.ts).
 * A fixture, so the test also fails if somebody deletes a credit for a source
 * that is still in the data without touching the loaders.
 */
const IN_THE_DATA_2026_10_06 = [
  // product.source
  'icecat', 'usda', 'openfoodfacts', 'openbeautyfacts', 'consignaction',
  'openproductsfacts', 'openpetfoodfacts', 'returnit',
  // observation.seller
  'bcldb', 'anbl', 'openprices', 'walmart.ca',
  // not a column: store_osm on the Open Prices rows, and the live shop lookup
  'openstreetmap',
];

/**
 * Keys the code can write that are deliberately not on the Licences screen.
 * Every one needs a reason, and the Licences screen needs an entry the day the
 * reason stops being true.
 */
const NOT_CREDITED: Record<string, string> = {
  metro: 'loader exists, zero rows loaded as of 2026-10-06; add an entry before loading',
  canadiantire: 'crawler exists, zero rows in prices.db as of 2026-10-06; add an entry before loading',
  'save-on-foods': 'crawler exists, zero rows in prices.db as of 2026-10-06; add an entry before loading',
  user_scan: "the shopper's own scans, not a third party's data",
  user_derived: "names derived from the shopper's own scans, not a third party's data",
};

const attributed = new Map<string, string>();
for (const e of ATTRIBUTION) {
  for (const k of e.keys) {
    assert.ok(!attributed.has(k), `key ${k} is claimed by two entries`);
    attributed.set(norm(k), e.name);
  }
}

/** Every literal source or seller a loader can write, read from the files. */
function emittedByLoaders(): Map<string, string> {
  const found = new Map<string, string>();
  const note = (key: string, file: string): void => {
    // The Walmart crawler's SELLER is 'Walmart'; the price store normalises it to walmart.ca.
    const k = norm(key) === 'walmart' ? 'walmart.ca' : norm(key);
    found.set(k, file);
  };
  const cat = join(root, 'catalogue', 'src');
  for (const f of readdirSync(cat).filter((n) => /^(prepare_rows|fetch_).*\.py$/.test(n))) {
    const text = readFileSync(join(cat, f), 'utf8');
    for (const m of text.matchAll(/^SOURCE\s*=\s*"([^"]+)"/gm)) note(m[1]!, f);
    for (const m of text.matchAll(/"source":\s*"([^"]+)"/g)) note(m[1]!, f);
  }
  const price = join(root, 'price', 'src');
  for (const f of readdirSync(price).filter((n) => n.endsWith('.ts'))) {
    const text = readFileSync(join(price, f), 'utf8');
    for (const m of text.matchAll(/^(?:export )?const SELLER = '([^']+)'/gm)) note(m[1]!, f);
  }
  return found;
}

test('every source the loaders can write has an attribution entry or a reasoned exemption', () => {
  const emitted = emittedByLoaders();
  // Negative control: the scan must have seen the sources we know are there.
  for (const k of ['openfoodfacts', 'icecat', 'usda', 'bcldb', 'anbl', 'openprices', 'walmart.ca', 'returnit', 'consignaction']) {
    assert.ok(emitted.has(k), `the loader scan never saw ${k}; the scan is broken, not the list`);
  }
  const missing = [...emitted].filter(([k]) => !attributed.has(k) && !(k in NOT_CREDITED));
  assert.deepEqual(
    missing.map(([k, f]) => `${k} (in ${f})`),
    [],
    'a loader can write these and ATTRIBUTION has no entry for them',
  );
});

test('every source that was in the data on 2026-10-06 is credited', () => {
  const missing = IN_THE_DATA_2026_10_06.filter((k) => !attributed.has(norm(k)));
  assert.deepEqual(missing, []);
});

test('an exemption is never also a credit, and each carries a reason', () => {
  for (const [k, why] of Object.entries(NOT_CREDITED)) {
    assert.ok(why.length > 20, `${k} needs a real reason`);
    assert.ok(!attributed.has(k), `${k} is both credited and exempt; drop the exemption`);
  }
});

test('the check goes red: an uncredited key is caught by the same comparison', () => {
  const pretend = new Set([...emittedByLoaders().keys(), 'some-new-source']);
  const missing = [...pretend].filter((k) => !attributed.has(k) && !(k in NOT_CREDITED));
  assert.deepEqual(missing, ['some-new-source']);
});

test('every entry is complete and renders safely', () => {
  for (const e of ATTRIBUTION) {
    for (const field of [e.name, e.what, e.licence, e.url]) {
      assert.ok(field.trim().length > 0, `${e.name} has an empty field`);
      // The screen puts these into HTML; no markup characters, and no em dashes anywhere.
      assert.ok(!/[<>&—]/.test(field), `${e.name} has a character the screen or the style rules forbid`);
    }
    assert.ok(e.keys.length > 0, `${e.name} credits no source key`);
    assert.match(e.url, /^https:\/\//);
  }
});

test('each licence is stated as that source actually carries it', () => {
  const by = (key: string) => ATTRIBUTION.find((e) => e.keys.includes(key))!;
  for (const k of ['openfoodfacts', 'openbeautyfacts', 'openprices', 'openstreetmap']) {
    assert.match(by(k).licence, /ODbL/, `${k} is published under the ODbL`);
  }
  assert.match(by('openstreetmap').licence, /OpenStreetMap contributors/);
  // Not ODbL: must never be shown as if it were.
  assert.match(by('icecat').licence, /not ODbL/);
  assert.doesNotMatch(by('usda').licence, /ODbL/);
  assert.match(by('usda').licence, /CC0/);
  // BC's licence prescribes this statement when the provider names none.
  assert.match(by('bcldb').what, /Contains information licensed under the Open Government Licence - British Columbia\./);
  // Sources with no published reuse licence must say so and record the date their terms were read.
  for (const k of ['anbl', 'walmart.ca', 'returnit', 'consignaction']) {
    assert.match(by(k).licence, /^No reuse licence/, `${k} names a licence it does not carry`);
    assert.match(by(k).licence, /2026-10-06|permission/, `${k} does not record what the terms said`);
    assert.match(by(k).what, /(read|checked|search extract on) 2026-10-06/, `${k} has no dated terms reading`);
  }
});

test('Open Facts and Open Prices say what they are, with counts that carry a date', () => {
  for (const e of ATTRIBUTION) {
    const hasCount = /\d{1,3}(,\d{3})+|\b\d{2,}\b/.test(e.what);
    if (hasCount) assert.match(e.what, /2026-10-06/, `${e.name} shows a count with no measurement date`);
  }
});
