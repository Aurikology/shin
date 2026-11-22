/**
 * Progress (lib/progress.js, screens/progress.js), Aurik 2026-11-22: "a track progress sector ... show the
 * users they are saving more than the average person. documenting every purchase."
 *
 * WHAT THIS HOLDS
 *   1. The total is the honest spread (RULINGS "No savings claim ships until it is measured"): typical minus
 *      paid, only on Bought rows, only on sure answers (high, medium), never below zero per buy.
 *   2. A thin answer, a scan with no price, and a scan not marked Bought count for nothing.
 *   3. Currencies never mix: the main currency's buys only.
 *   4. Against the typical shopper: (paid - typical) / typical over the buys.
 *   5. The chart is the running total, oldest first, cut by range; an unknown range throws.
 *   6. Bought survives the hundred-row cap; setBought writes and unwrites the mark.
 *   7. The screen: two cards, the chart, the Bought switch, the bar with Progress, + and Settings, and
 *      never the word "saved" next to money.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const P = await import('../public/js/lib/progress.js');
const store = await import('../public/js/store.js');
const screen = (await import('../public/js/screens/progress.js')).default;
const { TABLES } = await import('../public/js/ui-strings.js');

const DAY = 864e5;
const NOW = Date.parse('2026-11-22T12:00:00Z');
const ans = (paid, typical, { confidence = 'high', currency = 'CAD' } = {}) => ({
  kind: 'distribution', id: 'x', label: 'Milk 2L', zone: 'good', confidence, centreCents: typical,
  p10Cents: typical - 50, p90Cents: typical + 50, currency, askingCents: paid, offByPct: null, basis: 'x',
});
const row = (id, daysAgo, result, bought = true) => ({ id, at: new Date(NOW - daysAgo * DAY).toISOString(), result, query: {}, bought });

test('1. the total is typical minus paid, on Bought sure answers, never below zero per buy', () => {
  const s = P.progressStats([
    row('a', 1, ans(400, 500)), // 100 under
    row('b', 2, ans(300, 350, { confidence: 'medium' })), // 50 under
    row('c', 3, ans(600, 500)), // 100 over: adds nothing to the total
  ], { now: NOW });
  assert.equal(s.underCents, 150);
  assert.equal(s.buys, 3);
  assert.equal(s.beat, 2);
});

test('2. a thin answer, a scan with no price, and a scan not marked Bought count for nothing', () => {
  const s = P.progressStats([
    row('a', 1, ans(400, 500, { confidence: 'low' })),
    row('b', 1, ans(null, 500)),
    row('c', 1, ans(400, 500), false),
    row('d', 1, { kind: 'verdict', tier: 'fair' }),
  ], { now: NOW });
  assert.equal(s.underCents, 0);
  assert.equal(s.buys, 0);
  assert.equal(s.vsTypicalPct, null);
  assert.deepEqual(s.series('all'), []);
});

test('3. currencies never mix', () => {
  const s = P.progressStats([
    row('a', 1, ans(400, 500)), row('b', 2, ans(400, 500)), row('c', 3, ans(100, 900, { currency: 'USD' })),
  ], { now: NOW });
  assert.equal(s.currency, 'CAD');
  assert.equal(s.underCents, 200);
});

test('4. against the typical shopper: paid 900 where typical was 1000 is 10% less', () => {
  const s = P.progressStats([row('a', 1, ans(400, 500)), row('b', 2, ans(500, 500))], { now: NOW });
  assert.equal(s.vsTypicalPct, -10);
});

test('5. the chart is the running total, oldest first, cut by range; an unknown range throws', () => {
  const s = P.progressStats([row('new', 1, ans(400, 500)), row('old', 100, ans(300, 400))], { now: NOW });
  assert.deepEqual(s.series('all').map((p) => p.cents), [100, 200]);
  assert.deepEqual(s.series('30d').map((p) => p.cents), [200], 'the 30-day line keeps the running total, not a reset one');
  assert.throws(() => s.series('1y'));
});

test('5b. counts: this week from the record, all time from scanCount', () => {
  const s = P.progressStats([row('a', 1, ans(1, 2), false), row('b', 9, ans(1, 2), false)], { now: NOW, scanCount: 40 });
  assert.equal(s.scansWeek, 1);
  assert.equal(s.scansTotal, 40);
});

test('6. Bought survives the hundred-row cap, and setBought writes and unwrites the mark', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}`, at: 'x', bought: i === 120 }));
  const kept = store.capHistory(rows);
  assert.equal(kept.length, 101);
  assert.equal(kept.at(-1).id, 'r120');
  store.reset();
  const id = store.recordVerdict(ans(400, 500), {});
  store.setBought(id, true);
  assert.equal(store.get().history[0].bought, true);
  assert.ok(store.get().history[0].boughtAt);
  store.setBought(id, false);
  assert.equal(store.get().history[0].bought, false);
});

test('7. the screen: two cards, chart, Bought switch, the bar, and no "saved" beside money', () => {
  store.reset();
  const id = store.recordVerdict(ans(400, 500), {});
  store.setBought(id, true);
  const root = { innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector: () => null };
  const stop = screen.render(root, { go() {}, params: {} });
  const html = root.innerHTML;
  assert.match(html, /class="prog-cards"/);
  assert.match(html, /class="prog-chart"/);
  assert.match(html, /data-bought="[^"]+" role="switch"\s+aria-checked="true"/);
  assert.match(html, /data-act="progress"[^>]*aria-current="page"/);
  assert.match(html, /class="mini-shutter" data-act="camera"/);
  assert.match(html, /data-act="you"/);
  stop();
  for (const lang of ['en', 'fr']) {
    for (const [k, v] of Object.entries(TABLES[lang])) {
      if (!k.startsWith('prog_') || k === 'prog_saved_items') continue; // the bookmark list's name, not money
      const text = typeof v === 'function' ? v({ n: '2', beat: '1', pct: '5', amount: '$1', paid: '$1', typical: '$2', name: 'x' }) : v;
      assert.doesNotMatch(text, /\bsaved?\b|\bsaving|économis/i, `${lang}.${k} claims a saving: ${text}`);
    }
  }
  const src = readFileSync(fileURLToPath(new URL('../public/js/lib/progress.js', import.meta.url)), 'utf8');
  assert.match(src, /confidence !== 'high' && a\.confidence !== 'medium'/);
});
