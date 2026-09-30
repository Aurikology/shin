import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { groupHash, isFold, splitByProduct, splitByTime, splitSealedOpen, timeCutoff, type Fold } from '../src/split.ts';
import { createSealed, guardSealed, type SealGuard } from '../src/sealed.ts';
import { evaluate } from '../src/harness.ts';
import { categoryRangeModel } from '../src/baselines.ts';
import { catalogueDb, FAKE_GIT, noSealed, pricesDb, NEW, OLD } from './fixture.ts';

const obs = loadObservations(pricesDb());
const pred = buildPredictionKey(obs);
const sales = buildSaleKey(obs);

test('by product: no test product has a single training row, and both sides are non-empty', () => {
  for (const seed of [0, 1, 2, 3]) {
    const f = splitByProduct(obs, pred, sales, noSealed(), 0.3, seed);
    assert.ok(isFold(f));
    const trainKeys = new Set(f.train.map((o) => o.key));
    for (const k of f.testKeys) assert.equal(trainKeys.has(k), false, `seed ${seed}: ${k} on both sides`);
    for (const p of f.testPoints) assert.ok(f.testKeys.has(p.key));
    for (const s of f.testSales) assert.ok(f.testKeys.has(s.key!));
    assert.ok(f.testPoints.length > 0 && f.train.length > 0);
    // Every product not held out keeps all its rows.
    const heldOutRows = obs.filter((o) => o.key !== null && f.testKeys.has(o.key)).length;
    assert.equal(f.train.length + heldOutRows, obs.length);
  }
});

test('by product: the same product always lands on the same side', () => {
  assert.equal(groupHash('771000000000004', 5), groupHash('771000000000004', 5));
  const a = splitByProduct(obs, pred, sales, noSealed(), 0.3, 9);
  const b = splitByProduct(obs, pred, sales, noSealed(), 0.3, 9);
  assert.ok(isFold(a) && isFold(b));
  assert.deepEqual([...a.testKeys].sort(), [...b.testKeys].sort());
});

test('by time: learns only on rows strictly before the cutoff and scores only rows on or after it', () => {
  const f = splitByTime(obs, sales, noSealed());
  assert.ok(isFold(f));
  assert.equal(f.cutoff, NEW);
  assert.ok(f.train.every((o) => o.seenOn < NEW));
  assert.ok(f.train.some((o) => o.seenOn === OLD));
  assert.ok(f.testPoints.length > 0 && f.testPoints.every((p) => p.seenOn >= NEW));
  assert.ok(f.testSales.every((s) => s.seenOn >= NEW));
});

test('by time: a fixed cutoff is honoured', () => {
  const f = splitByTime(obs, sales, noSealed(), { cutoff: '2026-09-16' });
  assert.ok(isFold(f));
  assert.ok(f.train.every((o) => o.seenOn < '2026-09-16'));
  assert.equal(f.testPoints.length, 0);
  assert.ok(f.testSales.length > 0);
});

test('by time: impossible when every price shares one date, and says so', () => {
  const one = obs.filter((o) => o.seenOn === NEW);
  const f = splitByTime(one, [], noSealed());
  assert.equal(isFold(f), false);
  assert.match((f as { impossible: string }).impossible, /one date/);
  assert.equal(timeCutoff([{ seenOn: NEW }]), null);
});

test('a forged guard is refused by every split, and a hand-built fold is refused by the harness', () => {
  const forged = { mode: 'none', sha256: null } as SealGuard;
  assert.throws(() => splitByProduct(obs, pred, sales, forged), /not issued/);
  assert.throws(() => splitByTime(obs, sales, forged), /not issued/);
  assert.throws(() => splitSealedOpen(obs, pred, sales, forged), /not issued/);
  const forgedOpen = { mode: 'opened', only: new Set<string>(), count: 0, openedOn: 'x', sha256: 'x', keysSha256: 'x' } as SealGuard;
  assert.throws(() => splitByProduct(obs, pred, sales, forgedOpen), /not issued/);
  assert.throws(() => splitByTime(obs, sales, forgedOpen), /not issued/);
  const real = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1) as Fold;
  const copy: Fold = { ...real };
  assert.throws(() => evaluate(categoryRangeModel(), copy, { catalogue: catalogueDb() }), /not made by split/);
});

test('a direct caller cannot score a sealed product: the split applies the guard itself', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-split-sealed-'));
  try {
    const path = join(dir, 'sealed.json');
    const sealedKeys = pred.slice(0, 6).map((p) => p.key);
    createSealed(path, sealedKeys, 'test', undefined, FAKE_GIT);
    const guard = guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT });
    assert.equal(guard.mode, 'excluded');
    for (const f of [splitByProduct(obs, pred, sales, guard, 0.9, 0), splitByTime(obs, sales, guard)]) {
      assert.ok(isFold(f));
      for (const k of sealedKeys) {
        assert.equal(f.testKeys.has(k), false);
        assert.equal(f.train.some((o) => o.key === k), false);
      }
      assert.equal(f.sealed.sha256, guard.sha256);
    }
    // An opened guard only works with splitSealedOpen.
    const opened = guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true });
    assert.throws(() => splitByProduct(obs, pred, sales, opened), /splitSealedOpen/);
    const f = splitSealedOpen(obs, pred, sales, opened);
    assert.ok(isFold(f));
    assert.ok(f.testPoints.every((p) => sealedKeys.includes(p.key)));
    assert.ok(f.train.every((o) => o.key === null || !sealedKeys.includes(o.key)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('models on one fold are scored on the same items', () => {
  const f = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1) as Fold;
  const catalogue = catalogueDb();
  const a = evaluate(categoryRangeModel(), f, { catalogue });
  const b = evaluate(categoryRangeModel(), f, { catalogue, seed: 99 });
  assert.equal(a.askedHash, b.askedHash);
});
