/**
 * 7.4 Paired comparison: per-item scores, resampled by product, with a noise
 * floor from repeated splits, against the category range and Claude alone.
 * The Claude arm is an INPUT (precomputed ranges in a file); nothing calls an API.
 * The verdict is "ahead of both by more than the noise", otherwise not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadObservations } from '../src/data.ts';
import { buildSaleKey } from '../src/keys.ts';
import { isFold, splitByProductAndDate, type Fold } from '../src/split.ts';
import type { Model, Query } from '../src/harness.ts';
import { categoryRangeModel } from '../src/baselines.ts';
import { claudeArmModel, loadClaudeArm, pairedCompare, pairedOnFolds, type SplitScores } from '../src/paired.ts';
import { rng } from '../src/audit.ts';
import { buildMarket } from './market.ts';
import { noSealed } from './fixture.ts';

/** n products with m items each; baseline scores around 1, the candidate shifted by `shift(split, product)` plus noise. */
function synth(splits: number, products: number, perProduct: number, shift: (s: number, p: number) => number, noise = 0.05, seed = 1): SplitScores[] {
  const r = rng(seed);
  const out: SplitScores[] = [];
  for (let s = 0; s < splits; s++) {
    const keys: string[] = [];
    const cand: number[] = [];
    const base: number[] = [];
    const claude: (number | null)[] = [];
    for (let p = 0; p < products; p++) {
      for (let i = 0; i < perProduct; i++) {
        const b = 1 + r() * 0.5;
        keys.push(`p${s}-${p}`);
        base.push(b);
        claude.push(b + (r() - 0.5) * noise);
        cand.push(b + shift(s, p) + (r() - 0.5) * noise);
      }
    }
    out.push({ split: `s${s}`, keys, candidate: cand, arms: { category_range: base, claude_alone: claude } });
  }
  return out;
}

test('7.4 clearly better than both on every split: ahead of both by more than the noise', () => {
  const v = pairedCompare(synth(5, 40, 3, () => -0.3));
  assert.equal(v.status, 'ahead', v.sentence);
  assert.equal(v.ahead, true);
  for (const a of v.arms) {
    assert.equal(a.status, 'ahead', a.note);
    assert.ok(-a.meanDiff! > a.noise!);
    assert.equal(a.perSplit.length, 5);
    assert.ok(a.perSplit.every((p) => p.products === 40));
  }
});

test('7.4 the same as the arms (only noise): not ahead', () => {
  const v = pairedCompare(synth(5, 40, 3, () => 0));
  assert.equal(v.status, 'not_ahead');
  assert.equal(v.ahead, false);
});

test('7.4 ahead of the category range but level with Claude: not ahead (both are required)', () => {
  const s = synth(5, 40, 3, () => -0.3);
  // Level: the candidate's own scores plus zero-mean noise (a constant sliver with no noise at all would, correctly, count as ahead).
  const r = rng(99);
  for (const x of s) x.arms.claude_alone = x.candidate.map((c) => c + (r() - 0.5) * 0.05);
  const v = pairedCompare(s);
  assert.equal(v.arms.find((a) => a.arm === 'category_range')!.status, 'ahead');
  assert.equal(v.arms.find((a) => a.arm === 'claude_alone')!.status, 'not_ahead');
  assert.equal(v.status, 'not_ahead');
});

test('7.4 the noise floor comes from repeated splits: a lead that flips sign between splits is not ahead, though each split alone is tight', () => {
  // Constant per split, so the within-split bootstrap has no spread at all; only the split-to-split noise can stop this.
  const shifts = [-0.3, 0.2, -0.1, 0.15, -0.25];
  const v = pairedCompare(synth(5, 40, 3, (s) => shifts[s]!, 0));
  const a = v.arms.find((x) => x.arm === 'category_range')!;
  assert.ok(a.meanDiff! < 0, 'the candidate leads on average');
  assert.ok(a.bootNoise! < 1e-9, `within-split noise ${a.bootNoise}`);
  assert.ok(a.splitNoise! > -a.meanDiff!, a.note);
  assert.equal(a.status, 'not_ahead');
});

test('7.4 resampled by product: one product carrying the whole lead does not pass', () => {
  // 39 products level, one product 40 points ahead: the mean says -1, a product bootstrap says noise.
  const v = pairedCompare(synth(5, 40, 3, (_s, p) => (p === 0 ? -40 : 0), 0.05));
  const a = v.arms.find((x) => x.arm === 'category_range')!;
  assert.ok(a.meanDiff! < -0.5);
  assert.equal(a.status, 'not_ahead', a.note);
});

test('7.4 not measured: one split (no noise floor), or too few products', () => {
  const one = pairedCompare(synth(1, 40, 3, () => -0.3));
  assert.equal(one.status, 'not_measured');
  assert.match(one.arms[0]!.note, /split/);
  const few = pairedCompare(synth(5, 10, 3, () => -0.3));
  assert.equal(few.status, 'not_measured');
  assert.match(few.arms[0]!.note, /products/);
  assert.equal(few.ahead, false);
});

test('7.4 an arm that was asked only some items is compared on those items only; an asked item it failed costs the skip score', () => {
  const s = synth(5, 40, 3, () => -0.3);
  for (const x of s) x.arms.claude_alone = x.arms.claude_alone!.map((c, i) => (i % 2 === 0 ? c : null));
  const v = pairedCompare(s);
  const c = v.arms.find((a) => a.arm === 'claude_alone')!;
  assert.equal(c.perSplit[0]!.items, 60);
  assert.equal(v.arms.find((a) => a.arm === 'category_range')!.perSplit[0]!.items, 120);
});

test('7.4 a missing arm is not measured, never a pass', () => {
  const s = synth(5, 40, 3, () => -0.3);
  for (const x of s) delete (x.arms as Record<string, unknown>).claude_alone;
  const v = pairedCompare(s, { arms: ['category_range', 'claude_alone'] });
  assert.equal(v.status, 'not_measured');
  assert.match(v.arms.find((a) => a.arm === 'claude_alone')!.note, /no claude_alone/);
});

test('7.4 the Claude arm is read from a file of precomputed ranges, never an API', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-claude-arm-'));
  const path = join(dir, 'claude.jsonl');
  writeFileSync(
    path,
    [
      JSON.stringify({ key: '123', asOf: '2026-10-01', lowCents: 100, highCents: 200, midCents: 150, coverage: 0.5 }),
      JSON.stringify({ key: '456', asOf: '2026-10-01', answer: null }),
      '',
    ].join('\n'),
  );
  const arm = loadClaudeArm(path);
  assert.equal(arm.rows, 2);
  assert.deepEqual(arm.answers.get('123|2026-10-01'), { lowCents: 100, highCents: 200, midCents: 150 });
  assert.equal(arm.answers.get('456|2026-10-01'), null);
  assert.equal(arm.answers.has('789|2026-10-01'), false);
  assert.throws(() => loadClaudeArm(join(dir, 'nope.jsonl')), /not found/);
  writeFileSync(join(dir, 'bad.jsonl'), '{"key":"1","asOf":"2026-10-01","lowCents":"x"}\n');
  assert.throws(() => loadClaudeArm(join(dir, 'bad.jsonl')), /line 1/);
  const m = claudeArmModel(arm);
  assert.equal(m.claimedCoverage, 0.5);
  const p = m.fit({} as never);
  const q = (key: string): Query => ({ key, code: key, asOf: '2026-10-01', info: null });
  assert.deepEqual(p(q('123')), { lowCents: 100, highCents: 200, midCents: 150 });
  assert.equal(p(q('456')), null);
});

/* ------------------------------------------- end to end on the synthetic market */

function folds(seeds: readonly number[]): { folds: Fold[]; catalogue: ReturnType<typeof buildMarket>['catalogue']; truth: ReturnType<typeof buildMarket>['truth'] } {
  const { prices, catalogue, truth } = buildMarket({ seed: 7 });
  const obs = loadObservations(prices);
  const sales = buildSaleKey(obs);
  const out = seeds.map((s) => splitByProductAndDate(obs, sales, noSealed(), { seed: s }));
  assert.ok(out.every(isFold));
  return { folds: out as Fold[], catalogue, truth };
}

/** Knows each product's true base price (a stand-in for a much better estimator): tight 50% band around it. */
function knowsTheBase(truth: readonly { code: string; base: number }[]): Model {
  const base = new Map(truth.map((t) => [t.code, t.base]));
  return {
    name: 'knows_the_base',
    description: 'test stand-in: the true base price, 50% band of +-3%',
    claimedCoverage: 0.5,
    runnable: true,
    fit: () => (q) => {
      const b = base.get(q.key);
      return b ? { lowCents: Math.round(b * 0.98), highCents: Math.round(b * 1.05), midCents: Math.round(b * 1.01) } : null;
    },
  };
}

test('7.4 end to end: a much better estimator is ahead of the category range and of a Claude arm read from file, on repeated product-and-date splits', () => {
  const { folds: fs, catalogue, truth } = folds([1, 2, 3]);
  // The "Claude" file: the category range's answers, written to a file and read back, as a stand-in for real Claude ranges.
  const dir = mkdtempSync(join(tmpdir(), 'bench-claude-arm-'));
  const path = join(dir, 'claude.jsonl');
  const lines: string[] = [];
  // Build the file from a simple rule so it is independent of the harness: the true base widened 2x either way.
  const base = new Map(truth.map((t) => [t.code, t.base]));
  for (const f of fs) for (const t of f.testPoints) {
    const b = base.get(t.key)!;
    lines.push(JSON.stringify({ key: t.key, asOf: t.seenOn, lowCents: Math.round(b / 2), highCents: Math.round(b * 2), midCents: Math.round(b), coverage: 0.5 }));
  }
  writeFileSync(path, [...new Set(lines)].join('\n') + '\n');
  const arm = loadClaudeArm(path);

  const good = pairedOnFolds(fs, () => knowsTheBase(truth), { catalogue, claude: arm });
  assert.equal(good.verdict.status, 'ahead', good.verdict.sentence);
  assert.deepEqual(good.verdict.arms.map((a) => a.arm).sort(), ['category_range', 'claude_alone']);

  const copyOf = (): Model => {
    const m = categoryRangeModel();
    return { name: 'copy_of_category_range', description: 'the category range, re-run as a candidate', claimedCoverage: m.claimedCoverage, runnable: true, fit: (ctx) => m.fit(ctx) };
  };
  const copy = pairedOnFolds(fs, copyOf, { catalogue, claude: arm });
  const vsRange = copy.verdict.arms.find((a) => a.arm === 'category_range')!;
  assert.equal(vsRange.status, 'not_ahead', vsRange.note);
  assert.equal(copy.verdict.ahead, false);
});
