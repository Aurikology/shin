/**
 * 7.7 Hand audit tooling: a sample sized by a confidence bound for "under 2%
 * wrong", drawn fresh each round from a recorded seed, a sheet a person fills
 * in, and a scorer that reads the filled sheet and says pass or fail.
 * Nothing here labels a row: every verdict in these tests is written by the test
 * to stand in for the person.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AuditRow } from '../src/audit.ts';
import { parseCsv } from '../src/audit.ts';
import {
  binomialCdf,
  drawHandAudit,
  handAuditCsv,
  hypergeometricCdf,
  requiredSampleSize,
  scoreHandAudit,
  upperBound,
  ERROR_BAR,
  CONFIDENCE,
} from '../src/handaudit.ts';

function rows(n: number): AuditRow[] {
  return Array.from({ length: n }, (_, i) => ({
    source: i % 5 === 0 ? ('sale' as const) : ('prediction' as const),
    key: String(1000 + i),
    code: String(1000 + i),
    seller: 'Save-On-Foods',
    sellerSku: `sku-${i}`,
    shop: `save-on-foods|store ${i % 7}`,
    name: `item ${i}`,
    url: `https://shop.invalid/p/${i}`,
    seenOn: '2026-10-01',
    cents: 100 + i,
    referenceCents: i % 5 === 0 ? 200 + i : null,
    disagreement: 0,
    flagged: false,
    reason: '',
  }));
}

/** Stand-in for the person: fills every verdict, `wrong` for the listed row positions. */
function fill(csv: string, wrongAt: ReadonlySet<number> = new Set(), kind = 'sale paired with the wrong regular price'): string {
  const recs = parseCsv(csv);
  const header = Object.keys(recs[0]!);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const out = recs.map((r, i) => ({ ...r, verdict: wrongAt.has(i) ? 'wrong' : 'right', wrong_kind: wrongAt.has(i) ? kind : '', checked_by: 'person', checked_on: '2026-10-09' }));
  return [header.join(','), ...out.map((r) => header.map((h) => esc((r as Record<string, string>)[h] ?? '')).join(','))].join('\n') + '\n';
}

test('7.7 the bound: one-sided 95% exact; 0 wrong needs 149 rows to show "under 2%" on a large key', () => {
  assert.equal(ERROR_BAR, 0.02);
  assert.equal(CONFIDENCE, 0.95);
  const s = requiredSampleSize({});
  assert.equal(s.method, 'binomial');
  assert.equal(s.n, 149);
  assert.ok(binomialCdf(0, 149, 0.02) <= 0.05 && binomialCdf(0, 148, 0.02) > 0.05);
  // Allowing one wrong row costs more rows; the size is the smallest that still proves the bar.
  const one = requiredSampleSize({ allowedWrong: 1 });
  assert.ok(binomialCdf(1, one.n, 0.02) <= 0.05 && binomialCdf(1, one.n - 1, 0.02) > 0.05);
  assert.ok(one.n > 149);
});

test('7.7 a small key: the hypergeometric bound, and a census when the key is too small to sample', () => {
  const s = requiredSampleSize({ population: 60 });
  assert.equal(s.method, 'hypergeometric');
  // 2% of 60 is 1.2, so failing means 2+ wrong rows; the sample must make 0 found unlikely (5% or less) at 2 wrong.
  assert.equal(s.failingWrong, 2);
  assert.ok(hypergeometricCdf(0, 60, 2, s.n) <= 0.05);
  assert.ok(hypergeometricCdf(0, 60, 2, s.n - 1) > 0.05);
  assert.ok(s.n < 60 && !s.census);
  const tiny = requiredSampleSize({ population: 10 });
  assert.equal(tiny.census, true);
  assert.equal(tiny.n, 10);
});

test('7.7 the bound read back: 0 of 149 passes, 1 of 149 fails, and the 2026-09-30 result (7 of 39) fails', () => {
  assert.ok(upperBound(0, 149).rate < 0.02);
  assert.ok(upperBound(1, 149).rate >= 0.02);
  assert.ok(upperBound(0, 148).rate >= 0.02);
  const old = upperBound(7, 39);
  assert.ok(old.rate > 0.179, `${old.rate}`);
  // Census: the rate is exact; 1 wrong in 60 is under 2%, 2 is not.
  assert.ok(upperBound(1, 60, 60).rate < 0.02);
  assert.ok(upperBound(2, 60, 60).rate >= 0.02);
});

test('7.7 the sample: sized by the bound, reproducible from its recorded seed, fresh with a new seed, refuses a reused seed', () => {
  const pop = rows(500);
  const a = drawHandAudit(pop, { round: 1, seed: 11, drawnOn: '2026-10-09' });
  assert.equal(a.meta.n, a.rows.length);
  assert.equal(a.meta.n, requiredSampleSize({ population: 500 }).n);
  assert.equal(a.meta.seed, 11);
  assert.equal(new Set(a.rows.map((r) => r.sellerSku)).size, a.rows.length, 'no row twice');
  const again = drawHandAudit(pop, { round: 1, seed: 11, drawnOn: '2026-10-09' });
  assert.deepEqual(again.meta.rowIds, a.meta.rowIds);
  const b = drawHandAudit(pop, { round: 2, seed: 12, drawnOn: '2026-10-10' }, [a.meta]);
  assert.notDeepEqual(b.meta.rowIds, a.meta.rowIds);
  assert.throws(() => drawHandAudit(pop, { round: 2, seed: 11, drawnOn: '2026-10-10' }, [a.meta]), /seed 11/);
  // No seed given: one is drawn and recorded.
  const c = drawHandAudit(pop, { round: 3, drawnOn: '2026-10-11' }, [a.meta, b.meta]);
  assert.equal(typeof c.meta.seed, 'number');
  assert.match(c.meta.bound, /95%/);
});

test('7.7 the sheet: one row per sampled row, every hand column blank, no flag or audit hint to anchor the person', () => {
  const s = drawHandAudit(rows(300), { round: 1, seed: 5, drawnOn: '2026-10-09' });
  const recs = parseCsv(handAuditCsv(s));
  assert.equal(recs.length, s.meta.n);
  for (const r of recs) {
    assert.equal(r.verdict, '');
    assert.equal(r.correct_price_cents, '');
    assert.equal(r.wrong_kind, '');
    assert.ok(!('flagged' in r) && !('disagreement' in r) && !('reason' in r));
  }
  const sale = recs.find((r) => r.source === 'sale')!;
  assert.notEqual(sale.claimed_regular_cents, '', 'a sale row shows the regular price the key paired it with');
});

test('7.7 the scorer: blank is incomplete (never a pass), all right passes, one wrong fails with its kind counted', () => {
  const s = drawHandAudit(rows(1000), { round: 1, seed: 5, drawnOn: '2026-10-09' });
  const blank = scoreHandAudit(handAuditCsv(s), s.meta);
  assert.equal(blank.status, 'incomplete');
  assert.equal(blank.pass, false);

  const ok = scoreHandAudit(fill(handAuditCsv(s)), s.meta);
  assert.equal(ok.status, 'pass', ok.reason);
  assert.equal(ok.pass, true);
  assert.equal(ok.wrong, 0);
  assert.ok(ok.upper! < 0.02);

  const bad = scoreHandAudit(fill(handAuditCsv(s), new Set([3])), s.meta);
  assert.equal(bad.status, 'fail');
  assert.equal(bad.wrong, 1);
  assert.deepEqual(bad.byKind, { 'sale paired with the wrong regular price': 1 });
  assert.ok(Object.values(bad.bySource).reduce((x, y) => x + y, 0) === 1);
});

test('7.7 the scorer refuses a sheet that is not the drawn sample, or a verdict it cannot read', () => {
  const s = drawHandAudit(rows(1000), { round: 1, seed: 5, drawnOn: '2026-10-09' });
  const filled = fill(handAuditCsv(s));
  const lines = filled.trimEnd().split('\n');
  const dropped = [lines[0], ...lines.slice(2)].join('\n') + '\n';
  assert.equal(scoreHandAudit(dropped, s.meta).status, 'invalid');
  const swapped = filled.replace(s.meta.rowIds[0]!, 'prediction|X|Y|2026-01-01|1');
  assert.equal(scoreHandAudit(swapped, s.meta).status, 'invalid');
  const maybe = filled.replace(',right,', ',maybe,');
  const r = scoreHandAudit(maybe, s.meta);
  assert.equal(r.status, 'incomplete');
  assert.match(r.reason, /maybe/);
});
