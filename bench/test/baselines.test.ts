import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { isFold, splitByProduct, splitByTime } from '../src/split.ts';
import { evaluate } from '../src/harness.ts';
import { baselines, categoryMedianModel, categoryRangeModel, claudeGuessModel, claudeSample } from '../src/baselines.ts';
import { catalogueDb, noSealed, pricesDb } from './fixture.ts';

const obs = loadObservations(pricesDb());
const pred = buildPredictionKey(obs);
const sales = buildSaleKey(obs);
const catalogue = catalogueDb();

test('category range (range.ts): by product it can only answer from the category', () => {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  const run = evaluate(categoryRangeModel(), f, { catalogue });
  assert.ok(run.scores);
  assert.equal(run.scores.abstained, 0);
  const by = (run.extra as { answeredBy: Record<string, number> }).answeredBy;
  assert.equal(by.this_product, undefined);
  assert.ok((by.leaf_category ?? 0) + (by.parent_category ?? 0) > 0);
  // The middle half of a category much wider than one product: it does not pass, and is far wider than one product's spread (1.11x).
  assert.equal(run.gate!.pass, false);
  assert.ok(run.scores.width!.median >= 1.4, `width ${run.scores.width!.median}`);
});

test('category range (range.ts): by time it answers from the product own older prices', () => {
  const f = splitByTime(obs, sales, noSealed());
  assert.ok(isFold(f));
  const run = evaluate(categoryRangeModel(), f, { catalogue });
  const by = (run.extra as { answeredBy: Record<string, number> }).answeredBy;
  assert.ok((by.this_product ?? 0) > 0);
  assert.ok(run.scores!.ownWidth!.n > 0 && run.scores!.ownWidth!.median < 1.2);
});

test('category median is a point estimate and never passes as a range', () => {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  const run = evaluate(categoryMedianModel(), f, { catalogue });
  assert.ok(run.scores!.scored > 0);
  assert.ok(run.gate!.failures.includes('claim_too_low'));
});

test('Claude guess is on record and not run; its sample is fixed by the seed', () => {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  const run = evaluate(claudeGuessModel(), f, { catalogue });
  assert.equal(run.ran, false);
  assert.match(run.notRunReason!, /not run/);
  assert.deepEqual(
    claudeSample(pred, 5).map((p) => p.key),
    claudeSample([...pred].reverse(), 5).map((p) => p.key),
  );
  assert.equal(baselines().length, 3);
});
