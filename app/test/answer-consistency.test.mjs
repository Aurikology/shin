/**
 * The answer a shopper sees must be consistent and calibrated (walkthrough
 * 2026-10-06, defects D10, D12, D13, D39, and the shopper's own pending report).
 *
 *   D10  ONE default threshold set, great 30% under, good 20% under, bad 20% over,
 *        everywhere: the client range code, the bell, the store and the server.
 *   D12  the word is worked out from the bell that is DRAWN (same centre, same
 *        thresholds), so word and picture cannot disagree anywhere across the bell.
 *   D13  low confidence keeps the answer but is drawn hollow, with the plain face,
 *        a neutral line and a short "not fully confident: why" beside the word.
 *   D39  the 12-dot maximum never overlaps its labels.
 *   and  the shopper's pending report is its own dot on the chart, outside the bell.
 *
 * A test of a fix must fail without the fix: each assertion below was run against
 * the code as it stood before (20/10/10 client defaults, the server's zone shown as
 * sent, two label rows, no report dot) and failed there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const ranges = await import('../public/js/lib/ranges.js');
const VC = await import('../public/js/lib/verdict-chart.js');
const store = await import('../public/js/store.js');
const { thresholdsFrom } = await import('../public/js/lib/scan-body.js');
const { DEFAULT_THRESHOLDS: SERVER_DEFAULTS } = await import('../../price/src/estimate.ts');
const F = await import('./verdict-fixtures.mjs');
const { distributionSheet, distFace } = await import('../public/js/screens/camera.js');
const { say } = await import('../public/js/voice.js');
const { confidenceWords } = await import('../public/js/lib/history-answer.js');

const { usableVerdict, zoneFor, zoneCuts, zoneAtX, shopperOf, bellGeometry, bellSvg, placeLabels, labelWidth } = VC;

/* ------------------------------------------------------------------- D10 */

test('D10: one default set, great 30 / good 20 / bad 20, client and server alike', () => {
  assert.deepEqual({ ...ranges.DEFAULT_PERCENTS }, { great: 30, good: 20, bad: 20 });
  assert.equal(VC.DEFAULT_THRESHOLDS.greatPct, ranges.DEFAULT_PERCENTS.great);
  assert.equal(VC.DEFAULT_THRESHOLDS.goodPct, ranges.DEFAULT_PERCENTS.good);
  assert.equal(VC.DEFAULT_THRESHOLDS.badPct, ranges.DEFAULT_PERCENTS.bad);
  assert.deepEqual({ ...SERVER_DEFAULTS }, { greatPct: 30, goodPct: 20, badPct: 20 }, "the server's twin is the same three numbers");
});

test('D10: a shopper who never set anything reads the default set and sends nothing', () => {
  storage.clear();
  store.reset();
  const s = store.get();
  assert.equal(s.lineGreatPct, null);
  assert.equal(s.lineUnderPct, null);
  assert.equal(s.lineOverPct, null);
  assert.deepEqual(ranges.rangesOf(s), { unit: 'percent', great: 30, good: 20, bad: 20 });
  assert.equal(thresholdsFrom(s), undefined, 'the client never invents a number; the server applies its own default');
});

test('D10: setting a range marks the lines as the shopper\'s own', () => {
  storage.clear();
  store.reset();
  store.setRange('good', 15);
  assert.equal(store.get().linesSet, true);
  assert.equal(store.get().lineUnderPct, 15);
});

test('D10: stored 20/10/10 that the shopper never set becomes unset; a real choice is kept', () => {
  const old = { lineGreatPct: 20, lineUnderPct: 10, lineOverPct: 10 };
  const migrated = ranges.migrateLines({ ...old, linesSet: false });
  assert.deepEqual([migrated.lineGreatPct, migrated.lineUnderPct, migrated.lineOverPct], [null, null, null]);
  assert.deepEqual(ranges.rangesOf(migrated), { unit: 'percent', great: 30, good: 20, bad: 20 });
  // A blob from before the marker existed, with the old triple: never a choice.
  assert.deepEqual([ranges.migrateLines(old).lineGreatPct, ranges.migrateLines(old).linesSet], [null, false]);
  // The same triple, set by the shopper after the fix (marker true): kept.
  const chosen = ranges.migrateLines({ ...old, linesSet: true });
  assert.deepEqual([chosen.lineGreatPct, chosen.lineUnderPct, chosen.lineOverPct], [20, 10, 10]);
  // Any other triple was set by the shopper in the past: kept and marked.
  const theirs = ranges.migrateLines({ lineGreatPct: 25, lineUnderPct: 15, lineOverPct: 20 });
  assert.deepEqual([theirs.lineGreatPct, theirs.lineUnderPct, theirs.lineOverPct, theirs.linesSet], [25, 15, 20, true]);
});

test('D10: an old saved state is migrated when the store loads it', async () => {
  storage.clear();
  storage.setItem('shin.v1', JSON.stringify({ lineGreatPct: 20, lineUnderPct: 10, lineOverPct: 10, lineUnit: 'percent' }));
  const fresh = await import(`../public/js/store.js?reload=${Date.now()}`);
  assert.equal(fresh.get().lineUnderPct, null);
  assert.deepEqual(ranges.rangesOf(fresh.get()), { unit: 'percent', great: 30, good: 20, bad: 20 });
  storage.setItem('shin.v1', JSON.stringify({ lineGreatPct: 25, lineUnderPct: 15, lineOverPct: 20 }));
  const kept = await import(`../public/js/store.js?reload=${Date.now() + 1}`);
  assert.equal(kept.get().lineUnderPct, 15);
  storage.clear();
});

/* ------------------------------------------------------------------- D12 */

/** A very wide bell on own prices, like the walkthrough's JPW case: centre $13.92, p10 to p90 about $3.23 to $59.99. */
const WIDE = (() => {
  const base = F.GOOD;
  const sigmaLog = 1.04;
  const centreCents = 1392;
  return { ...base, centreCents, sigmaLog, p10Cents: 323, p90Cents: 5999, confidence: 'medium', dots: [{ cents: 2499, store: 'BC Liquor', city: 'Victoria', seenOn: '2026-09-20', kind: 'regular', quantity: '750 ml' }, { cents: 2699, store: 'Save-On-Foods', city: 'Victoria', seenOn: '2026-09-21', kind: 'regular', quantity: '750 ml' }], shopper: { cents: 1700, zone: 'reasonable', offByPct: 22.1, beyond: null, suspect: null } };
})();

test('D12: the word is the zone strip under the marker, at every price across the bell', () => {
  for (const raw of [WIDE, F.GOOD, F.NO_PRICE, F.LOW_CONFIDENCE, { ...F.GOOD, thresholds: { greatPct: 40, goodPct: 10, badPct: 5, fromShopper: true } }]) {
    const v = usableVerdict(raw);
    const g = bellGeometry(v);
    const cuts = zoneCuts(v.centreCents, v.thresholds);
    let checked = 0;
    for (let i = 0; i <= 400; i += 1) {
      const logPrice = g.domain.lo + ((g.domain.hi - g.domain.lo) * i) / 400;
      const cents = Math.max(1, Math.round(Math.exp(logPrice)));
      const x = g.x(cents);
      // Skip the sliver at a boundary where rounding the x position to a tenth of a unit could land either side.
      if ([cuts.great, cuts.good, cuts.bad].some((cut) => Math.abs(g.x(cut) - x) < 0.3)) continue;
      assert.equal(zoneFor(cents, v.centreCents, v.thresholds), zoneAtX(x, g), `price ${cents} on a bell centred ${v.centreCents}: the word and the strip under the marker disagree`);
      checked += 1;
    }
    assert.ok(checked > 300, 'the walk covered the bell');
  }
});

test('D12: the zone sent by the server never overrides the bell that is drawn', () => {
  // The server said "bad" for a price the drawn bell puts in the middle (a stale or differently-centred zone).
  const stale = usableVerdict({ ...WIDE, shopper: { ...WIDE.shopper, cents: 1392, zone: 'bad', offByPct: 0 } });
  assert.equal(shopperOf(stale).zone, 'reasonable');
  const html = distributionSheet({ ...WIDE, shopper: { ...WIDE.shopper, cents: 1392, zone: 'bad', offByPct: 0 } });
  assert.match(html, /data-zone="reasonable"/);
  assert.match(html, />Reasonable price</);
  assert.doesNotMatch(html, />Bad price</);
});

test('D12: the cuts that change the word are ticked on the curve, one per cut that is on the axis', () => {
  const v = usableVerdict(WIDE);
  const g = bellGeometry(v);
  assert.equal(g.cutTicks.length, 3);
  const svg = bellSvg(v);
  assert.equal((svg.match(/class="vb-cut"/g) ?? []).length, 3);
  // The marker at +22% on this very wide bell sits within a few units of the centre line, and the tick shows it is past the cut.
  const cuts = zoneCuts(v.centreCents, v.thresholds);
  assert.ok(g.x(1700) > g.x(cuts.bad), 'the marker is right of the "bad" cut');
  assert.ok(g.x(1700) - g.centreX < 12, 'and it is near the centre line, which is why the cut has to be drawn');
  assert.equal(zoneFor(1700, v.centreCents, v.thresholds), 'bad');
});

/* ------------------------------------------------------------------- D13 */

test('D13: a low-confidence answer still answers, drawn hollow, with the plain face and a reason beside the word', () => {
  for (const zone of ['great', 'good', 'reasonable', 'bad']) {
    const cents = { great: 400, good: 470, reasonable: 600, bad: 760 }[zone];
    const v = { ...F.LOW_CONFIDENCE, shopper: null };
    const html = distributionSheet({ ...v, basis: 'category_prior', shopper: { cents, zone, offByPct: 0, beyond: null, suspect: null } });
    assert.match(html, /data-conf="thin"/, `${zone}: hollow`);
    assert.match(html, /data-confidence="low"/);
    assert.doesNotMatch(html, /data-state="(delighted|angry)"/, `${zone}: no intense face on a hollow field`);
    assert.match(html, /class="vd-doubt" data-dist-conf>Not fully confident: a rough estimate for its category</, zone);
    // The line is beside the word: directly after the headline, before the "how far off" line.
    assert.ok(html.indexOf('data-dist-headline') < html.indexOf('data-dist-conf') && html.indexOf('data-dist-conf') < html.indexOf('data-dist-line'));
    // N12: the bubble speaks the zone's hedged line (never the confident one), whatever the attitude.
    const bubble = html.match(/<p class="bubble-text">([^<]*)<\/p>/)?.[1].replace(/&#39;/g, "'");
    const shown = html.match(/data-zone="(\w+)"/)[1];
    const unsure = ["deadpan", "warm", "blunt"].map((who) => say(`dist_${shown}_unsure`, {}, who));
    const sure = ["deadpan", "warm", "blunt"].map((who) => say(`dist_${shown}`, {}, who));
    assert.ok(unsure.includes(bubble), `${zone}: bubble "${bubble}" is not one of the hedged lines`);
    assert.ok(!sure.includes(bubble), `${zone}: a not-confident answer spoke the confident line`);
  }
  assert.equal(distFace('great', 'low'), 'good');
  assert.equal(distFace('great', 'medium'), 'delighted');
  assert.equal(distFace('bad', 'low'), 'walk');
});

test('D13: the reason names where the centre came from, in both languages', () => {
  const html = (basis) => distributionSheet({ ...F.LOW_CONFIDENCE, basis });
  assert.match(html('claude_typical'), /Not fully confident: an AI estimate, no prices for this item/);
  assert.match(html('own_prices'), /Not fully confident: few prices for this item/);
  assert.match(html('other_size'), /Not fully confident: worked out from another size of this item/);
});

test('N12: a medium-confidence answer also speaks the hedged line, because its sheet says it is not fully confident', () => {
  const html = distributionSheet({ ...F.GREAT, confidence: 'medium' });
  const bubble = html.match(/<p class="bubble-text">([^<]*)<\/p>/)?.[1].replace(/&#39;/g, "'");
  const unsure = ['deadpan', 'warm', 'blunt'].map((who) => say('dist_great_unsure', {}, who));
  assert.ok(unsure.includes(bubble), `medium spoke "${bubble}"`);
  const sure = distributionSheet({ ...F.GREAT, confidence: 'high' });
  assert.ok(['deadpan', 'warm', 'blunt'].map((who) => say('dist_great', {}, who)).includes(sure.match(/<p class="bubble-text">([^<]*)<\/p>/)?.[1].replace(/&#39;/g, "'")));
});

test('D13: a spread wider than five times says the range in plain words, and a narrow one says nothing', () => {
  const wide = { ...F.LOW_CONFIDENCE, p10Cents: 300, p90Cents: 3000 };
  const html = distributionSheet(wide);
  assert.match(html, /class="vd-doubt vd-spread" data-dist-spread>Prices for this kind of item vary a lot: \$3\.00 to \$30\.00\./);
  const narrow = { ...F.LOW_CONFIDENCE, p10Cents: 900, p90Cents: 1800 };
  assert.doesNotMatch(distributionSheet(narrow), /data-dist-spread/);
  assert.equal(confidenceWords(narrow).spread, '');
  assert.match(confidenceWords(wide).spread, /vary a lot/);
});

test('D08: Correct and Share sit at the top of the half detent, before the basis line; Save stays in the peek', () => {
  const html = distributionSheet(F.GOOD, { name: 'Peanut Butter' });
  const half = html.slice(html.indexOf('sheet-half'));
  const actions = half.indexOf('vd-half-actions');
  assert.ok(actions >= 0, 'no action row in the half detent');
  assert.ok(actions < half.indexOf('data-vd-basis'), 'actions must come before the basis line');
  assert.match(half.slice(actions, half.indexOf('data-vd-basis')), /data-act="correct"[\s\S]*data-act="share"/);
  const peek = html.slice(0, html.indexOf('sheet-half'));
  assert.match(peek, /data-act="dist-save"/);
});

test('D12: the basis line says the centre blends this item\'s prices with its category', () => {
  const html = distributionSheet({ ...F.MEDIUM_SALE_BULK, basis: 'own_prices', n: 2 });
  assert.match(html, /blends this item(?:'|&#39;)s prices at 2 shops with its category\./);
});

/* ------------------------------------------------- the shopper's own report */

test("the shopper's pending report is its own labelled dot, outside the bell and unlike a store dot", () => {
  const report = { cents: 549, store: 'Save-On-Foods', seenOn: '2026-10-06', status: 'waiting_for_second_source' };
  const html = distributionSheet(F.GOOD, { name: 'Peanut Butter', shopperReport: report });
  assert.match(html, /class="vb-report" data-vb-report="549"/);
  assert.match(html, /class="vb-reportdot"/);
  assert.match(html, />Your report</);
  assert.match(html, /<title>Your report: \$5\.49 at Save-On-Foods, counts once a second source agrees<\/title>/);
  // A diamond path, not the store dots' circle.
  assert.doesNotMatch(html.match(/class="vb-reportdot"[^>]*/)[0], /<circle/);
  // The bell is the same with or without it: the report moves nothing (same curve, same centre).
  const without = distributionSheet(F.GOOD, { name: 'Peanut Butter' });
  const curve = (s) => s.match(/class="vb-curve" d="([^"]*)"/)[1];
  assert.equal(curve(html), curve(without));
  assert.doesNotMatch(without, /vb-report/);
  // Store dots are unchanged: the report is not one of them.
  assert.equal((html.match(/class="vb-dot /g) ?? []).length, (without.match(/class="vb-dot /g) ?? []).length);
  // French.
  assert.match(distributionSheet(F.GOOD, { shopperReport: report }), /vb-report/);
});

test('the pending report widens the axis rather than being cut off, and a far one is pinned at the edge', () => {
  const v = usableVerdict(F.GOOD);
  const near = bellGeometry(v, { report: { cents: 400 } });
  assert.equal(near.report.pinned, null);
  assert.ok(near.report.x >= near.side && near.report.x <= near.width - near.side);
  const far = bellGeometry(v, { report: { cents: 1_000_000 } });
  assert.equal(far.report.pinned, 'high');
  assert.equal(far.report.x, far.width - far.side);
});

/* ------------------------------------------------------------------- D39 */

test('D39: with the 12-dot maximum no two dot labels touch, and none runs off the chart', () => {
  const names = ['Save-On-Foods', 'Walmart Supercentre', 'METRO', 'Sobeys', 'Loblaws', 'FreshCo', 'No Frills', 'Real Canadian Superstore', 'Shoppers Drug Mart', 'Costco Wholesale', 'Giant Tiger', 'T&T Supermarket'];
  for (const spread of [0.5, 2, 30, 80]) {
    const items = names.map((n, i) => ({ i, x: 20 + i * spread, text: `${n} 750 ml`.slice(0, 20) }));
    const placed = placeLabels(items, { rows: 3, width: 340 });
    assert.ok(placed.length >= 3, 'a crowded chart still labels some of them');
    for (const a of placed) {
      const w = labelWidth(a.text);
      assert.ok(a.x - w / 2 >= -0.01 && a.x + w / 2 <= 340.01, `${a.text} runs off the chart`);
      for (const b of placed) {
        if (a === b || a.row !== b.row) continue;
        const gap = Math.abs(a.x - b.x) - (labelWidth(a.text) + labelWidth(b.text)) / 2;
        assert.ok(gap >= 7.9, `${a.text} and ${b.text} touch in row ${a.row} (gap ${gap.toFixed(1)})`);
      }
    }
  }
  // The whole sheet, with 12 real dots.
  const html = distributionSheet(F.CROWDED, { name: 'X' });
  const labels = [...html.matchAll(/class="vb-dotlbl" x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)</g)].map((m) => ({ x: +m[1], y: +m[2], text: m[3] }));
  assert.ok(labels.length > 0);
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || a.y !== b.y) continue;
      assert.ok(Math.abs(a.x - b.x) - (labelWidth(a.text) + labelWidth(b.text)) / 2 >= 7.9, 'two labels in one row touch');
    }
  }
});
