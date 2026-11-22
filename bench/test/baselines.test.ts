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
  assert.equal(baselines().length, 4);
});

/* ---------------------------------------------------------------- price_tree */

import { priceTreeModel } from '../src/baselines.ts';
import { readCatalogueInfo, codeKey, type Observation } from '../src/data.ts';
import type { TrainContext, Query } from '../src/harness.ts';
import { products, LEAVES } from './fixture.ts';

function treeCtx(rows: readonly Observation[]): TrainContext {
  return { fold: 'by_product', observations: rows, prices: null as never, catalogue };
}
function queryFor(code: string): Query {
  const key = codeKey(code);
  return { key, code: key, asOf: '2026-09-20', info: readCatalogueInfo(catalogue, [key]).get(key) ?? null };
}

test('price_tree: trains only on the rows it is handed and answers a range from the product group', () => {
  const leafC = products().filter((p) => p.leaf === LEAVES[2].tag);
  const keysC = new Set(leafC.map((p) => codeKey(p.code)));
  const train = obs.filter((o) => o.key !== null && !keysC.has(o.key));
  const predict = priceTreeModel().fit(treeCtx(train));
  const a = products().find((p) => p.leaf === LEAVES[0].tag)!;
  const inA = predict(queryFor(a.code));
  assert.ok(inA && inA.lowCents <= inA.midCents && inA.midCents <= inA.highCents && inA.lowCents > 0);
  // Leaf C has no training row: its answer can only come from the parent group, built from leaves A and B (prices up to ~5 times lower).
  const c = leafC[0]!;
  const inC = predict(queryFor(c.code));
  assert.ok(inC);
  const cTruth = obs.filter((o) => o.key === codeKey(c.code) && !o.isSale).map((o) => o.cents);
  assert.ok(inC.midCents < Math.min(...cTruth), `parent answer ${inC.midCents} must not have seen leaf C prices ${Math.min(...cTruth)}`);
  // With the leaf C rows added, the same query moves up: the tree reads exactly what it is given.
  const withC = priceTreeModel().fit(treeCtx(obs))(queryFor(c.code));
  assert.ok(withC && withC.midCents > inC.midCents);
});

test('price_tree: no category data or no training prices is an explicit no-answer, not a guess', () => {
  const predict = priceTreeModel().fit(treeCtx(obs));
  assert.equal(predict({ key: '99999999999', code: '99999999999', asOf: '2026-09-20', info: null }), null);
  const empty = priceTreeModel();
  const none = empty.fit(treeCtx([]))(queryFor(products()[0]!.code));
  assert.equal(none, null);
  assert.equal((empty.report!() as { answeredBy: Record<string, number> }).answeredBy.no_tree, 1);
});

test('price_tree: scored on the folds through the harness (leak audits stay in force)', () => {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  const run = evaluate(priceTreeModel(), f, { catalogue });
  assert.equal(run.ran, true);
  assert.ok(run.scores && run.scores.scored > 0);
  assert.ok((run.extra as { answeredBy: Record<string, number> }).answeredBy.answered! > 0);
});
