/**
 * Tests for `crawl.ts --discover`'s flag parsing.
 *
 * Nothing here touches walmart.ca or the price database. `parseDiscoverArgs` was
 * split out of `main` on 2026-09-09 so exactly that could be true: the rate
 * probe D-049 asks for is driven entirely by these flags, and a typo in one of
 * them costs a live run against a seller that is already suspicious of this
 * address.
 *
 * The floor case is the one that matters. `--delay-ms` is refused below 3000 ms
 * rather than clamped up to it, because a clamp turns a wrong number into a
 * silent right one and the person who typed it never learns the floor exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiscoverArgs } from '../src/crawl.ts';
import { PRODUCT_SITEMAP_INDEXES } from '../src/walmart-sitemap.ts';

test('the flags absent leaves the old behaviour exactly as it was', () => {
  const r = parseDiscoverArgs(['--discover']);
  assert.equal(r.limit, null);
  assert.equal(r.offset, 0);
  assert.equal(r.delayMs, 3000);
  assert.equal(r.dryRun, false);
  assert.equal(r.stopOnThrottle, false);
  assert.deepEqual(r.indexes, [PRODUCT_SITEMAP_INDEXES.firstParty]);
});

test('the probe run reads as the probe run', () => {
  const r = parseDiscoverArgs(
    '--discover --offset 20 --limit 20 --delay-ms 30000 --stop-on-throttle'.split(' '),
  );
  assert.equal(r.limit, 20);
  assert.equal(r.offset, 20);
  assert.equal(r.delayMs, 30_000);
  assert.equal(r.stopOnThrottle, true);
  assert.equal(r.dryRun, false);
});

test('--delay-ms at the floor is allowed and anything under it is refused', () => {
  assert.equal(parseDiscoverArgs(['--discover', '--delay-ms', '3000']).delayMs, 3000);
  for (const bad of ['2999', '500', '0']) {
    assert.throws(
      () => parseDiscoverArgs(['--discover', '--delay-ms', bad]),
      /below the 3000 ms politeness floor/,
      `--delay-ms ${bad} should be refused, not clamped`,
    );
  }
});

test('--delay-ms is never quietly clamped up to the floor', () => {
  /* The failure this guards: a parse that returned 3000 for an input of 500
   * would pass every other test in this file while telling the caller nothing. */
  let threw = false;
  try {
    parseDiscoverArgs(['--discover', '--delay-ms', '500']);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});

test('--offset refuses a negative or fractional count', () => {
  assert.throws(() => parseDiscoverArgs(['--discover', '--offset', '-1']), /zero or more/);
  assert.throws(() => parseDiscoverArgs(['--discover', '--offset', '2.5']), /whole number/);
  assert.equal(parseDiscoverArgs(['--discover', '--offset', '0']).offset, 0);
});

test('a flag that wants a number and is given none says so', () => {
  assert.throws(() => parseDiscoverArgs(['--discover', '--delay-ms']), /--delay-ms needs a number/);
  assert.throws(() => parseDiscoverArgs(['--discover', '--offset', 'twenty']), /--offset needs a number/);
});

test('an unknown --indexes key is still refused by name', () => {
  assert.throws(() => parseDiscoverArgs(['--discover', '--indexes', 'nope']), /unknown --indexes value/);
  assert.deepEqual(parseDiscoverArgs(['--discover', '--indexes', 'marketplaceHead']).indexes, [
    PRODUCT_SITEMAP_INDEXES.marketplaceHead,
  ]);
});
