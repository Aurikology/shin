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

test('every item holding a seller price answers, and that is four of the seven', () => {
  /*
   * CHANGED 2026-09-08, and this is the measurement that pass produced.
   *
   * The 2026-09-05 note here read: "Not one of these five was a threshold
   * turning away prices we held. Each is an empty hand." That was checked
   * against the thresholds, which had just been removed, and not against the
   * filter cascade sitting in front of them, and it was wrong about two of the
   * five rows. Tide was refused holding a Walmart price and the XM5 was refused
   * holding a manufacturer list price. Both are a seller's number and both drew
   * a blank screen for three days after the founder's instruction that they
   * should not.
   *
   * Coverage 2 of 7 -> 4 of 7. Read it for what it is: this measures how often
   * the spine will ANSWER, never whether the answer is right, and two of these
   * four now rest on a single price. What moved is the refusal, not the supply.
   */
  assert.equal(by.get('kd-original-225g')?.outcome, 'verdict');
  assert.equal(by.get('poang-used')?.outcome, 'verdict');
  // One Walmart price, and Walmart is the shop being stood in. Judged against
  // that store's own history, the way furniture already is.
  assert.equal(by.get('tide-simply-2720ml')?.outcome, 'verdict');
  // List price only, zero live retailer prices, and it says so on the answer.
  assert.equal(by.get('sony-wh1000xm5')?.outcome, 'verdict');
  assert.equal(report.verdicts, 4);
  // Every one of the two new answers carries its doubt where the doubt belongs.
  assert.equal(by.get('tide-simply-2720ml')?.confidence, 'low');
  assert.equal(by.get('sony-wh1000xm5')?.confidence, 'low');
});

test('the three refusals left are the three that are not about thin evidence', () => {
  // Produce is declined as a category, not missed as an item. "Produce is out
  // of v1", docs/decisions.md 2026-09-03, active, and it reverses on
  // crowdsourced volume rather than on one more price.
  assert.equal(by.get('navel-oranges-3lb')?.reason, 'category_unsupported');
  // The failure mode was identity, not price. No number is attached to a
  // product we cannot name, at any confidence.
  assert.equal(by.get('canon-eos-r6-used')?.reason, 'identity_unsure');
  // Five variant pages, no prices in any of them. Zero sellers is the one
  // refusal the founder's rule leaves standing.
  assert.equal(by.get('poang-new')?.reason, 'no_source_response');
  assert.equal(report.refusals, 3);
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
