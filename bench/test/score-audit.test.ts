import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareToBaseline, gate, intervalScore, scoreAll, SKIP_INTERVAL_SCORE, zoneOf } from '../src/score.ts';
import { auditPredictionKey, auditSaleKey, keyErrorRate, mergeSheet, parseCsv, rowId, sampleForReread, toCsv, wilson, type AuditRow } from '../src/audit.ts';

const iv = { lowCents: 100, highCents: 200, midCents: 150 };

test('interval score: width inside, plus 2/alpha times the miss outside (log scale)', () => {
  const w = Math.log(2);
  assert.ok(Math.abs(intervalScore(150, iv, 0.5) - w) < 1e-12);
  assert.ok(Math.abs(intervalScore(50, iv, 0.5) - (w + 4 * Math.log(2))) < 1e-12);
  assert.ok(Math.abs(intervalScore(400, iv, 0.8) - (w + 10 * Math.log(2))) < 1e-9);
});

test('zones: below low is low, above high is high, the ends are typical', () => {
  assert.equal(zoneOf(99, iv), 'low');
  assert.equal(zoneOf(100, iv), 'typical');
  assert.equal(zoneOf(200, iv), 'typical');
  assert.equal(zoneOf(201, iv), 'high');
});

test('scores: hit rate, per category, width, within-X sentences, abstentions', () => {
  const s = scoreAll(
    [
      { key: 'a', category: 'x', realCents: 150, interval: iv },
      { key: 'b', category: 'x', realCents: 300, interval: iv },
      { key: 'c', category: 'y', realCents: 160, interval: iv },
      { key: 'd', category: 'y', realCents: 100, interval: null },
    ],
    [{ key: 'a', saleCents: 90, regularCents: 150, interval: iv }],
    0.5,
  );
  assert.equal(s.scored, 3);
  assert.equal(s.abstained, 1);
  // A skip counts as a miss: 2 hits of 4 eligible, 2 of 3 answered.
  assert.equal(s.hitRate, 0.5);
  assert.equal(s.hitRateAnswered, 2 / 3);
  assert.equal(s.answerRate, 0.75);
  assert.deepEqual(s.perCategory.x, { n: 2, products: 2, hits: 1, hitRate: 0.5 });
  assert.deepEqual(s.perCategory.y, { n: 2, products: 2, hits: 1, hitRate: 0.5 });
  assert.equal(s.width!.median, 2);
  assert.equal(s.within!['10%'], 2 / 3);
  assert.equal(s.sale.saleLowRate, 1);
  assert.equal(s.sale.regularFalseLowRate, 0);
  assert.ok(s.sentences.some((x) => /within 10% of the real price, 67% of the time/.test(x)));
  assert.ok(s.sentences.some((x) => /50% of the time counting skips as misses/.test(x)));
});

test('gate: silence never passes; a point estimate is not a range', () => {
  const empty = gate(scoreAll([], [], 0.5), null);
  assert.equal(empty.pass, false);
  assert.ok(empty.failures.includes('nothing_scored') && empty.failures.includes('sale_not_measured'));
  const point = gate(scoreAll([{ key: 'a', category: 'x', realCents: 100, interval: { lowCents: 100, highCents: 100, midCents: 100 } }], [], 0), null);
  assert.ok(point.failures.includes('claim_too_low'));
});

function auditRow(i: number, flagged: boolean): AuditRow {
  return {
    source: 'prediction', key: String(i), code: String(i), seller: 'S', sellerSku: `sku,"${i}"`, shop: 'S|', name: `Name, with "quotes" ${i}`,
    url: null, seenOn: '2026-09-01', cents: 100 + i, referenceCents: 100, disagreement: flagged ? 2 + i / 100 : i / 1000, flagged, reason: 'r',
  };
}

test('re-read rows: 50, flagged worst-first, a random half drawn from ALL rows, CSV survives commas and quotes', () => {
  const rows = [...Array.from({ length: 40 }, (_, i) => auditRow(i, i < 30)), ...Array.from({ length: 60 }, (_, i) => auditRow(100 + i, false))];
  const sheet = sampleForReread(rows, 50, 7);
  assert.equal(sheet.length, 50);
  assert.equal(new Set(sheet.map(rowId)).size, 50);
  const random = sheet.filter((r) => r.pickedBecause === 'random');
  const flagged = sheet.filter((r) => r.pickedBecause === 'flagged');
  assert.ok(random.length >= 25);
  // The random half can hold flagged rows too: it is a draw from everything.
  assert.ok(random.some((r) => r.flagged), 'random half never drew a flagged row (30 of 100 are flagged)');
  assert.ok(flagged.every((r) => r.flagged));
  for (let i = 1; i < flagged.length; i++) assert.ok(flagged[i - 1]!.disagreement >= flagged[i]!.disagreement);
  const back = parseCsv(toCsv(sheet));
  assert.equal(back.length, 50);
  assert.equal(back[0]!.name, sheet[0]!.name);
  assert.match(back[0]!.seller_sku!, /^sku,"\d+"$/);
  assert.equal(back[0]!.reread_verdict, '');
});

function mark(csv: string, verdictFor: (r: Record<string, string>, i: number) => string): string {
  const recs = parseCsv(csv);
  const header = Object.keys(recs[0]!);
  const esc = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header.join(','), ...recs.map((r, i) => header.map((h) => esc(h === 'reread_verdict' ? verdictFor(r, i) : r[h] ?? '')).join(','))].join('\n') + '\n';
}

test('key error rate is NOT MEASURED until random rows are re-read; then it comes only from them', () => {
  assert.equal(keyErrorRate(null).status, 'not measured');
  const rows = [...Array.from({ length: 30 }, (_, i) => auditRow(i, i < 25)), ...Array.from({ length: 30 }, (_, i) => auditRow(100 + i, false))];
  const csv = toCsv(sampleForReread(rows, 50, 1));
  assert.equal(keyErrorRate(csv).status, 'not measured');
  let randomSeen = 0;
  const filled = mark(csv, (r) => (r.picked_because === 'flagged' ? 'wrong' : randomSeen++ < 2 ? 'wrong' : 'right'));
  const nRandom = parseCsv(csv).filter((r) => r.picked_because === 'random').length;
  const rate = keyErrorRate(filled);
  assert.equal(rate.status, 'measured');
  if (rate.status === 'measured') {
    assert.equal(rate.randomReread, nRandom);
    assert.equal(rate.errorRate, 2 / nRandom);
    assert.equal(rate.flagPrecision, 1);
  }
});

test('the one persistent sheet: hand marks survive a re-run, new rows are appended only to refill the queue', () => {
  const rows = Array.from({ length: 200 }, (_, i) => auditRow(i, i % 10 === 0));
  const first = mergeSheet(null, rows, '2026-09-28');
  assert.equal(first.added, 50);
  // Nothing re-read yet: a re-run adds nothing and changes nothing.
  const again = mergeSheet(first.csv, rows, '2026-09-29');
  assert.equal(again.added, 0);
  assert.equal(again.csv, first.csv);
  // Mark 20 rows by hand, then re-run: the 20 marks are kept and 20 new rows are appended.
  const marked = mark(first.csv, (_, i) => (i < 20 ? (i === 0 ? 'wrong' : 'right') : ''));
  const third = mergeSheet(marked, rows, '2026-09-30');
  assert.equal(third.added, 20);
  assert.equal(third.total, 70);
  assert.equal(third.marked, 20);
  const recs = parseCsv(third.csv);
  assert.equal(recs.filter((r) => r.reread_verdict).length, 20);
  assert.equal(recs[0]!.reread_verdict, 'wrong');
  assert.equal(new Set(recs.map((r) => r.row_id)).size, 70, 'a row was put on the sheet twice');
  assert.deepEqual([...new Set(recs.slice(50).map((r) => r.added_on))], ['2026-09-30']);
});

test('audit: the reference is the true median of ALL other shops within the window', () => {
  const pt = (cents: number, i: number, seenOn = '2026-09-01') => ({ key: '1', code: '1', shop: `S${i}|`, seller: `S${i}`, sellerSku: 's', name: 'n', url: null, cents, seenOn });
  // Four others at 100, 110, 120, 1000: the median is 115 (mean of the middle two), not the lower 110.
  const rows = auditPredictionKey([{ key: '1', code: '1', points: [pt(130, 0), pt(100, 1), pt(110, 2), pt(120, 3), pt(1000, 4)] }]);
  assert.equal(rows[0]!.referenceCents, 115);
  // A shop priced 200 days earlier is outside the 90-day window and is not compared.
  const old = auditPredictionKey([{ key: '1', code: '1', points: [pt(500, 0, '2026-02-01'), pt(100, 1), pt(100, 2)] }]);
  const r500 = old.find((r) => r.cents === 500)!;
  assert.equal(r500.referenceCents, null);
  assert.equal(r500.flagged, false);
  assert.match(r500.reason, /not auditable/);
});

test('wilson interval: 0 of 50 still allows up to about 7%', () => {
  const w = wilson(0, 50);
  assert.equal(w.low, 0);
  assert.ok(Math.abs(w.high - 0.0713) < 0.001);
});

test('sale audit: a sale at or above its regular price is flagged', () => {
  const base = { key: '1', code: '1', seller: 'A', sellerSku: 's', shop: 'A|', name: 'n', url: null, seenOn: '2026-09-01', regularSeenOn: '2026-08-01', pairing: 'same_listing' as const };
  const rows = auditSaleKey([
    { ...base, saleCents: 500, regularCents: 400 },
    { ...base, saleCents: 300, regularCents: 400 },
    { ...base, saleCents: 50, regularCents: 400 },
    { ...base, saleCents: 300, regularCents: null, regularSeenOn: null, pairing: 'none' },
  ]);
  assert.deepEqual(rows.map((r) => r.flagged), [true, false, true, false]);
});

test('sanity floor: low <= 0 or high/low over 100 is invalid, counts as a miss, and costs the skip score', () => {
  const s = scoreAll(
    [
      { key: 'a', category: 'x', realCents: 150, interval: { lowCents: 0, highCents: 200, midCents: 100 } },
      { key: 'b', category: 'x', realCents: 150, interval: { lowCents: 10, highCents: 1001, midCents: 150 } },
      { key: 'c', category: 'x', realCents: 150, interval: { lowCents: 10, highCents: 1000, midCents: 150 } },
    ],
    [],
    0.5,
  );
  assert.equal(s.invalid, 2);
  assert.equal(s.scored, 1);
  assert.equal(s.hitRate, 1 / 3);
  assert.equal(s.perItem[0]!.is, SKIP_INTERVAL_SCORE);
  assert.ok(Number.isFinite(s.intervalScoreMean!));
});

test('B4 comparison: better only when the whole 95% interval is below zero; a missing baseline is not measured', () => {
  const cand = Array.from({ length: 80 }, (_, i) => ({ key: String(i % 40), is: 0.1 }));
  const worse = cand.map((c) => ({ ...c, is: 0.5 }));
  assert.equal(compareToBaseline(cand, worse, 'b').status, 'better');
  assert.equal(compareToBaseline(worse, cand, 'b').status, 'not_better');
  // Slightly better on average (0.10 against 0.11) but far inside the product-to-product noise: not better.
  const noisy = cand.map((c, i) => ({ ...c, is: i % 2 ? 0.01 : 0.21 }));
  const cmp = compareToBaseline(cand, noisy, 'b');
  assert.ok(cmp.meanDiff! < 0);
  assert.ok(cmp.ci95!.low < 0 && cmp.ci95!.high > 0);
  assert.equal(cmp.status, 'not_better');
  assert.equal(compareToBaseline(cand, null, 'b').status, 'not_measured');
  assert.equal(compareToBaseline(cand, worse.slice(1), 'b').status, 'not_measured');
  // Fewer than 30 products: not measured, however large the difference.
  assert.equal(compareToBaseline(cand.slice(0, 20), worse.slice(0, 20), 'b').status, 'not_measured');
  // Better by 1%, noise-free: under the 2% margin, not better.
  const nearCopy = cand.map((c) => ({ ...c, is: 0.101 }));
  assert.equal(compareToBaseline(cand, nearCopy, 'b').status, 'not_better');
  const r = compareToBaseline(cand, worse, 'b');
  assert.equal(r.winShare, 1);
  assert.ok(r.mcError! >= 0 && r.threshold! < 0);
  const g = gate(scoreAll([{ key: 'a', category: 'x', realCents: 100, interval: { lowCents: 90, highCents: 110, midCents: 100 } }], [], 0.5), [compareToBaseline(cand, null, 'b')]);
  assert.ok(g.failures.includes('baseline_not_measured'));
});

