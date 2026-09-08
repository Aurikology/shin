/**
 * The corpus test asserts one thing only: the spine reproduces the hand pilot.
 *
 * It deliberately does NOT assert a coverage target. Asserting the number the
 * kill gate is written against would turn the gate into a thing that passes
 * because a test says so, which is the failure the whole plan is arranged
 * against. What it locks is the shape: the same two items answer, the same five
 * refuse, and each refuses for the reason the pilot actually hit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, runCorpus } from '../src/harness.ts';
import { defaultDeps } from '../src/sources/registry.ts';

const report = await runCorpus(loadCorpus(), defaultDeps());
const by = new Map(report.rows.map((r) => [r.id, r]));

test('the corpus is the seven real pilot items and says so', () => {
  assert.equal(report.corpusSize, 7);
  assert.equal(report.corpusTarget, 100);
  assert.equal(report.gateRunnable, false);
  assert.ok(
    report.caveats.some((c) => c.includes('kill gate is not runnable')),
    'a report that cannot settle the gate must say so in its own text',
  );
});

test('every item reaches a terminal outcome and none throws', () => {
  assert.equal(report.rows.length, 7);
  assert.equal(report.verdicts + report.refusals, 7);
  for (const row of report.rows) {
    assert.ok(row.line.length > 0, `${row.id} produced no sentence`);
  }
});

test('the two items the pilot could price are the two that answer', () => {
  assert.equal(by.get('kd-original-225g')?.outcome, 'verdict');
  assert.equal(by.get('poang-used')?.outcome, 'verdict');
  assert.equal(report.verdicts, 2);
});

test('each of the five refusals gives the reason the pilot actually hit', () => {
  /*
   * Re-checked 2026-09-05, after every count threshold in the spine was removed
   * in favour of a low confidence band. Coverage did not move: still 2 of 7.
   *
   * That is the finding, and it is worth more than the deletion was. Not one of
   * these five was a threshold turning away prices we held. Each is an empty
   * hand: no usable price at all, a category we decline, or an identity too
   * doubtful to attach any price to. Thresholds were never what capped the
   * pilot, so nothing about relaxing them will lift coverage; only more sellers
   * will.
   */
  // The single Walmart price IS the shopper's own store, so excluding it leaves
  // nothing to compare against. Not a threshold: a set of size zero.
  //
  // The code changed on 2026-09-07 and the behaviour did not. Both of these
  // rows used to read `too_few_points`, which describes a count, over sets
  // emptied by two different conditions and by neither of them a count. That
  // mismatch is D-011 and its cause is D-012.
  assert.equal(by.get('tide-simply-2720ml')?.reason, 'all_points_from_asking_seller');
  // Produce is declined as a category, not missed as an item.
  assert.equal(by.get('navel-oranges-3lb')?.reason, 'category_unsupported');
  // The failure mode was identity, not price.
  assert.equal(by.get('canon-eos-r6-used')?.reason, 'identity_unsure');
  // List price only, zero live retailer prices.
  assert.equal(by.get('sony-wh1000xm5')?.reason, 'unusable_price_kinds');
  // Five variant pages, no prices in any of them.
  assert.equal(by.get('poang-new')?.reason, 'no_source_response');
});

test('the Kraft Dinner verdict is a walk-away with two lines', () => {
  const row = by.get('kd-original-225g');
  assert.equal(row?.tier, 'walk_away');
  assert.equal(row?.pointCount, 3, 'Metro must not appear in its own comparison set');
});

test('the report carries its caveats rather than leaving them to the reader', () => {
  assert.ok(report.caveats.some((c) => c.includes('stated stand-ins')));
  assert.ok(report.caveats.some((c) => c.includes('Coverage is not correctness')));
  assert.ok(report.caveats.some((c) => c.includes('bestbuy')), 'unverified adapters must be named');
});

test('coverage is computed against the recorded baseline, not a hoped-for one', () => {
  assert.equal(report.baselineCoverage, 2 / 7);
  assert.equal(report.coverage, report.verdicts / 7);
  assert.equal(report.beatsBaseline, report.coverage > 2 / 7);
});
