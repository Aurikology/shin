/**
 * The source list, which is a decision and therefore worth asserting.
 *
 * `registry.ts` opens by saying its array is "a decision and not a list": the
 * order is trust order, and `resolveIdentity` breaks confidence ties by taking
 * the first source. Nothing checked that any particular adapter was in it.
 *
 * That is how soldcomps.ts spent its whole life as a file nobody imported. It
 * was written, tested, and reviewed; it just was not in this array, and no
 * suite anywhere could tell. These tests are the guard against the same silence
 * happening to the next one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultSources } from '../src/sources/registry.ts';

const ids = () => defaultSources().map((s) => s.id);

test('every adapter in the sources directory is registered', () => {
  // Named explicitly rather than read off the filesystem: a new adapter file
  // should make somebody decide where in the trust order it goes, and a test
  // that globs the directory would silently accept the answer "last".
  for (const id of ['recorded', 'corrections', 'observed', 'bestbuy', 'ebay', 'soldcomps']) {
    assert.ok(ids().includes(id), `${id} is not in defaultSources`);
  }
});

test('the trust order is the one the header argues for', () => {
  // Recorded first because a person saw every row; corrections second because a
  // person saw it but not us; observed third. The unrun adapters come last.
  assert.deepEqual(ids(), ['recorded', 'corrections', 'observed', 'bestbuy', 'ebay', 'soldcomps']);
});

test('an adapter with no credentials is a reportable absence, never a silent one', () => {
  // source.ts: an unverified adapter that returns nothing is indistinguishable
  // from a category with no prices, so the reason has to be sayable.
  const soldcomps = defaultSources().find((s) => s.id === 'soldcomps');
  assert.ok(soldcomps);
  const state = soldcomps.available();
  if (state.ok) return; // A machine with a key set. Nothing to assert here.
  assert.match(state.reason, /SOLDCOMPS_API_KEY/);
});

test('nothing unrun claims to be verified', () => {
  // The flag that keeps a shape from being read as evidence.
  for (const id of ['bestbuy', 'ebay', 'soldcomps']) {
    const source = defaultSources().find((s) => s.id === id);
    assert.equal(source?.verified, false, `${id} claims verified without ever being run`);
  }
});

test('soldcomps is the used-goods adapter it says it is', () => {
  const soldcomps = defaultSources().find((s) => s.id === 'soldcomps');
  assert.deepEqual([...(soldcomps?.categories ?? [])], ['used']);
});
