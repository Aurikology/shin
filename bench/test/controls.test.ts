/**
 * 7.6 Prove the test works, on every rebuild. Three controls run on every fold
 * before anything is scored:
 *   known_good      the true prices of the held-out items (an oracle range): must pass;
 *   shuffled        each product gets ANOTHER product's true range: must fail calibration;
 *   whole_category  min to max of every training price in the leaf: must fail on width.
 * A control that behaves wrongly fails the run, and no model is scored.
 * The mutation tests break one control at a time and expect the run to stop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { groupHash, isFold, splitByProduct, splitByProductAndDate, splitByTime, type Fold } from '../src/split.ts';
import { categoryRangeModel } from '../src/baselines.ts';
import { assertControls, controlledRuns, derange, oracleModel, runControls, ControlsFailed } from '../src/controls.ts';
import { DEFAULT_BAR } from '../src/score.ts';
import type { Model } from '../src/harness.ts';
import { catalogueDb, noSealed, pricesDb } from './fixture.ts';

function setup() {
  const obs = loadObservations(pricesDb());
  const pred = buildPredictionKey(obs);
  const sales = buildSaleKey(obs);
  const byProduct = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1);
  const byTime = splitByTime(obs, sales, noSealed());
  const both = splitByProductAndDate(obs, sales, noSealed(), { testFraction: 0.5, seed: 1 });
  assert.ok(isFold(byProduct) && isFold(byTime) && isFold(both));
  return { obs, pred, sales, folds: [byProduct, byTime, both] as Fold[], catalogue: catalogueDb() };
}

test('7.6 derange: every product gets another product, reproducibly from the seed; one product cannot be deranged', () => {
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  const m = derange(keys, 3)!;
  assert.equal(m.size, keys.length);
  for (const k of keys) assert.notEqual(m.get(k), k);
  assert.deepEqual([...m.values()].sort(), [...keys].sort(), 'a derangement is a permutation');
  assert.deepEqual([...derange(keys, 3)!], [...m]);
  assert.notDeepEqual([...derange(keys, 4)!], [...m]);
  assert.equal(derange(['only'], 1), null);
});

test('7.6 on every fold the three controls behave: known-good passes, shuffled fails calibration, whole-category fails on width', () => {
  const { folds, catalogue } = setup();
  for (const fold of folds) {
    const rep = runControls(fold, { catalogue });
    assert.equal(rep.status, 'pass', `${fold.name}: ${JSON.stringify(rep.results.map((r) => [r.name, r.status, r.reason]))}`);
    const by = new Map(rep.results.map((r) => [r.name, r]));
    assert.equal(by.get('known_good')!.hitRate, 1);
    assert.ok(by.get('shuffled')!.failures.includes('calibration'));
    assert.ok(by.get('shuffled')!.hitRate! < 0.5, `${fold.name}: shuffled hit ${by.get('shuffled')!.hitRate}`);
    assert.ok(by.get('whole_category')!.failures.some((f) => f === 'width_p90' || f === 'width_own' || f === 'width_median'));
    assertControls(rep);
  }
});

test('7.6 mutation: a shuffle that does nothing makes the shuffled control misbehave and the run fail loudly', () => {
  const { folds, catalogue } = setup();
  const identity = (keys: readonly string[]) => new Map(keys.map((k) => [k, k]));
  const rep = runControls(folds[0]!, { catalogue, shuffle: identity });
  assert.equal(rep.status, 'fail');
  const s = rep.results.find((r) => r.name === 'shuffled')!;
  assert.equal(s.status, 'misbehaved', s.reason);
  assert.throws(() => assertControls(rep), (e: unknown) => e instanceof ControlsFailed && /shuffled/.test((e as Error).message));
});

test('7.6 mutation: with the width checks switched off, the whole-category control misbehaves', () => {
  const { folds, catalogue } = setup();
  const noWidth = { ...DEFAULT_BAR, widthP90Max: Infinity, ownWidthMedianMax: Infinity };
  const rep = runControls(folds[0]!, { catalogue, bar: noWidth, widthMedianMax: Infinity });
  assert.equal(rep.status, 'fail');
  assert.equal(rep.results.find((r) => r.name === 'whole_category')!.status, 'misbehaved');
  assert.equal(rep.results.find((r) => r.name === 'known_good')!.status, 'ok');
});

test('7.6 mutation: with the calibration check switched off, the shuffled control misbehaves', () => {
  const { folds, catalogue } = setup();
  const rep = runControls(folds[0]!, { catalogue, bar: { ...DEFAULT_BAR, calibrationTolerance: 1 } });
  assert.equal(rep.status, 'fail');
  assert.equal(rep.results.find((r) => r.name === 'shuffled')!.status, 'misbehaved');
});

test('7.6 mutation: a known-good that is not good (oracle doubled) makes the known-good control misbehave', () => {
  const { folds, catalogue } = setup();
  const fold = folds[1]!;
  const good = oracleModel(fold);
  const broken: Model = {
    ...good,
    name: 'known_good',
    fit(ctx) {
      const p = good.fit(ctx);
      return (q) => {
        const r = p(q);
        return r ? { lowCents: r.lowCents * 2, highCents: r.highCents * 2, midCents: r.midCents * 2 } : null;
      };
    },
  };
  const rep = runControls(fold, { catalogue, knownGood: broken });
  assert.equal(rep.status, 'fail');
  assert.equal(rep.results.find((r) => r.name === 'known_good')!.status, 'misbehaved');
});

test('7.6 a fold with one held-out product cannot run the shuffled control: not run, which is not a pass', () => {
  const { obs, pred, sales, catalogue } = setup();
  const hs = pred.map((p) => groupHash(p.key, 9)).sort((a, b) => a - b);
  const fold = splitByProduct(obs, pred, sales, noSealed(), (hs[0]! + hs[1]!) / 2, 9);
  assert.ok(isFold(fold));
  assert.equal(fold.testKeys.size, 1);
  const rep = runControls(fold, { catalogue });
  assert.equal(rep.status, 'not_run');
  assert.equal(rep.results.find((r) => r.name === 'shuffled')!.status, 'not_run');
  assert.throws(() => assertControls(rep), ControlsFailed);
});

test('7.6 every rebuild: models are scored only when every fold\'s controls behave; one misbehaving control stops all scoring', () => {
  const { folds, catalogue } = setup();
  const ok = controlledRuns(folds, () => [categoryRangeModel()], { catalogue });
  assert.equal(ok.aborted, false);
  assert.equal(ok.runs.length, folds.length);
  assert.equal(ok.controls.length, folds.length);

  const bad = controlledRuns(folds, () => [categoryRangeModel()], { catalogue, shuffle: (keys) => new Map(keys.map((k) => [k, k])) });
  assert.equal(bad.aborted, true);
  assert.equal(bad.runs.length, 0, 'nothing is scored after a control misbehaves');
  assert.match(bad.reason, /shuffled/);
});
