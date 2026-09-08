/**
 * D-015: a seller is the store's name, never the domain a page was fetched
 * from.
 *
 * The defect was one row in a verdict's provenance list reading "at walmart.ca"
 * in a column of proper names. Two constants caused it and two constants fixed
 * it, which is not a mechanism: the third crawler somebody writes will name its
 * source after the host it is pointed at, because that is the string already in
 * hand when the file is being written, and nothing would have complained.
 *
 * So the rule is asserted rather than the two values. This is deliberately a
 * test about the shape of a name and not a list of approved stores: an
 * allowlist would have to be edited every time a retailer is added, which makes
 * it a second register of merchants and exactly the drift the fix avoided by
 * not putting a lookup table in the client.
 *
 * The check that matters is in the third test. Matching already collapsed both
 * forms to one key before this change, so nothing about self-exclusion or the
 * distinct-seller count moved, and that is asserted here rather than believed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeSeller } from '../../spine/src/sources/source.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** Every `const SELLER = '...'` this package declares, with the file it is in. */
function declaredSellers(): { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(SRC + file, 'utf8');
    for (const m of text.matchAll(/^const SELLER = '([^']+)';/gm)) {
      out.push({ file, name: m[1]! });
    }
  }
  return out;
}

/**
 * A hostname, loosely: something ending in a public suffix this product would
 * plausibly meet. Loose on purpose. A name that trips this and is genuinely a
 * store's name is a conversation, not a false positive to be silenced.
 */
const LOOKS_LIKE_A_HOST = /\.(ca|com|net|org|io|co|shop|store)$/i;

test('the package declares sellers at all, so this file cannot pass by finding nothing', () => {
  const found = declaredSellers();
  assert.ok(found.length >= 2, `found only ${found.length} SELLER constants; the pattern has moved`);
});

test('no source names a seller after the domain it was fetched from', () => {
  const offenders = declaredSellers()
    .filter((s) => LOOKS_LIKE_A_HOST.test(s.name))
    .map((s) => `${s.file}: ${JSON.stringify(s.name)}`);

  assert.deepEqual(offenders, [], [
    'A seller is what a person reads in a provenance row, so it is the store\'s',
    'name and not the host a page came from. Fixing this in the screens instead',
    'would put a second copy of a name this tree already holds in the data.',
    '',
    ...offenders,
  ].join('\n'));
});

test('renaming a seller from its host does not move it to a different key', () => {
  // The whole safety of the D-015 fix rests on this, so it is checked rather
  // than believed: SELLER_NOISE strips the .ca and whitespace goes entirely, so
  // the domain form and the store name were already one seller to the engine.
  // If this ever stops being true, changing a SELLER constant silently splits a
  // retailer in two, and the spine's self-exclusion stops excluding the shop the
  // shopper is standing in.
  for (const [host, name] of [
    ['walmart.ca', 'Walmart'],
    ['canadiantire.ca', 'Canadian Tire'],
    ['bestbuy.ca', 'Best Buy'],
    ['loblaws.ca', 'Loblaws'],
  ]) {
    assert.equal(
      normalizeSeller(host!),
      normalizeSeller(name!),
      `${host} and ${name} are two sellers to the engine, so renaming one splits the store`,
    );
  }
});

test('a seller name survives normalisation as something, never as nothing', () => {
  // "Canada Computers" is the case the normaliser's own comment names: strip
  // "Canada" as noise and a real merchant collapses to "computers". A name that
  // normalised to an empty string would match every other empty one.
  for (const { file, name } of declaredSellers()) {
    assert.notEqual(normalizeSeller(name), '', `${file} declares a seller that normalises to nothing`);
  }
});
