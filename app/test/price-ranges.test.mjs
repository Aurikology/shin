/**
 * Rows 44, W9, W14, W31, W32 of docs/audit-google-doc-2026-09-19.md.
 *
 *   44, W9   the user's GREAT, GOOD and BAD ranges, up to 30 percent, in percent or
 *            dollars, stored with their unit (lib/ranges.js, store.js).
 *   W14      alert aggressiveness is a stored setting and nothing more.
 *   W31      the welcome screen "Evaluating Deal..." with a progress bar and his
 *            status line, and no invented saving.
 *   W32      the Savings Overview: Recently Scanned from the real history, Total
 *            Saved and Monthly Goal Progress only from a measured figure.
 *
 * Each test here was made to fail by removing the behaviour it names, then put
 * back (see the report that came with this file). What this cannot check is how
 * any of it looks on a phone: there is no browser in this run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const ranges = await import('../public/js/lib/ranges.js');
const picker = await import('../public/js/lib/range-picker.js');
const flow = await import('../public/js/onboarding-flow.js');
const store = await import('../public/js/store.js');
const onboarding = (await import('../public/js/screens/onboarding.js')).default;
const savings = await import('../public/js/screens/savings.js');
const { t } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const resetStore = () => { storage.clear(); store.reset(); };

/* ---------------------------------------------------------------- 44, W9 */

test('a range can be 30 percent, the store offers it, and the picker draws it', () => {
  assert.ok(ranges.PERCENT_CHOICES.includes(30), 'his "Conservative 30%+" cannot be expressed');
  assert.ok(store.LINE_CHOICES.includes(30));
  assert.equal(flow.THRESHOLD.percent.max, 30, 'the welcome slider stops before 30');
  resetStore();
  store.setRange('good', 30);
  assert.equal(store.get().lineUnderPct, 30);
  assert.match(picker.rangePickerHtml(store.get(), 'setup'), /data-range-kind="good" data-range-val="30"/);
});

test('there are three ranges, each with its own row, and a Percentage and Dollar Amount toggle', () => {
  resetStore();
  const html = picker.rangePickerHtml(store.get(), 'setup');
  for (const kind of ['great', 'good', 'bad']) {
    assert.match(html, new RegExp(`data-range-row="${kind}"`), `no ${kind} row`);
    assert.match(html, new RegExp(`ranges_${kind}_q|${t(`ranges_${kind}_q`).slice(0, 20)}`));
  }
  assert.match(html, /data-range-unit="percent"/);
  assert.match(html, /data-range-unit="amount"/);
});

test('great is kept at or beyond good, and the one just touched wins', () => {
  resetStore();
  store.setRange('great', 20);
  store.setRange('good', 25);
  assert.equal(store.get().lineUnderPct, 25);
  assert.equal(store.get().lineGreatPct, 25, 'raising good past great must lift great with it');
  store.setRange('great', 10);
  assert.equal(store.get().lineGreatPct, 10);
  assert.equal(store.get().lineUnderPct, 10, 'lowering great under good must lower good with it');
  store.setRange('bad', 30);
  assert.equal(store.get().lineOverPct, 30, 'bad is its own range');
});

test('dollar mode stores the amounts and the unit apart from the percents', () => {
  resetStore();
  store.setRange('good', 15);
  store.setRangeUnit('amount');
  store.setRange('good', 3);
  store.setRange('great', 5);
  assert.equal(store.get().lineUnit, 'amount');
  assert.equal(store.get().lineAmounts.good, 3);
  assert.equal(store.get().lineAmounts.great, 5);
  assert.equal(store.get().lineUnderPct, 15, 'a dollar amount overwrote the percent');
  store.setRangeUnit('percent');
  assert.equal(ranges.rangesOf(store.get()).good, 15, 'switching back lost the percent');
});

test('the picker click stores the range, and the unit toggle changes what is offered', () => {
  resetStore();
  const root = { querySelector: () => null };
  const pick = (sel, dataset) => ({ target: { closest: (s) => (s === sel ? { dataset } : null) } });
  assert.equal(picker.handleRangeClick(pick('[data-range-kind]', { rangeKind: 'great', rangeVal: '25' }), root, { store }), true);
  assert.equal(store.get().lineGreatPct, 25);
  assert.equal(picker.handleRangeClick(pick('[data-range-unit]', { rangeUnit: 'amount' }), root, { store }), true);
  assert.equal(store.get().lineUnit, 'amount');
  assert.match(picker.rangePickerHtml(store.get(), 'you'), /data-range-val="20"[^>]*>\$20</, 'dollar mode offers dollar buttons');
  assert.equal(picker.handleRangeClick({ target: { closest: () => null } }, root, { store }), false, 'a click that is not ours must fall through');
});

test('with nothing set the default range is still a full range', () => {
  const r = ranges.rangesOf({});
  // His 2026-09-17 numbers, the one default set (D10).
  assert.deepEqual(r, { unit: 'percent', great: 30, good: 20, bad: 20 });
});

test('the You screen and the setup screen both draw the same picker', () => {
  assert.match(read('../public/js/screens/setup.js'), /rangePickerHtml\(store\.get\(\), 'setup'\)/);
  assert.match(read('../public/js/screens/you.js'), /rangePickerHtml\(store\.get\(\), 'you'\)/);
});

/* -------------------------------------------- welcome: threshold and alerts */

test('the welcome mode toggle and threshold slider save into the ranges', () => {
  resetStore();
  flow.applyMode({ store }, 'amount');
  assert.equal(store.get().lineUnit, 'amount');
  assert.equal(flow.applyThreshold({ store }, 'amount', 4, true), true);
  assert.equal(store.get().lineAmounts.good, 4);
  flow.applyMode({ store }, 'percent');
  assert.equal(flow.applyThreshold({ store }, 'percent', 30, true), true);
  assert.equal(store.get().lineUnderPct, 30);
});

test('alert aggressiveness is a stored setting: his three options and their numbers', () => {
  resetStore();
  assert.equal(flow.applyAlertStyle({ store }, 'conservative'), true);
  assert.equal(store.get().alertStyle, 'conservative');
  assert.equal(store.get().alertMinPct, 30);
  flow.applyAlertStyle({ store }, 'aggressive');
  assert.equal(store.get().alertMinPct, 10);
  assert.equal(flow.applyAlertStyle({ store }, 'reckless'), false, 'an unknown style must not be stored');
  assert.equal(store.get().alertStyle, 'aggressive');
});

/* ------------------------------------------------------------------- W31 */

function renderStep(stepId) {
  const root = doc.createElement('div');
  const cleanup = onboarding.render(root, {
    params: { step: stepId },
    api: { postConsent() {}, postEvent() {} },
    go() {},
    replace() {},
  });
  return { html: root.innerHTML, cleanup };
}

test('Evaluating Deal is a welcome step in his order, with his text and a progress bar, and no saving', () => {
  resetStore();
  const ids = flow.visibleSteps().map((s) => s.id);
  assert.equal(ids.at(-1), 'evaluating', 'the evaluating screen is not the last welcome step');
  assert.equal(ids.at(-2), 'tip_accuracy');
  assert.equal(t('onb_eval_title'), 'Evaluating Deal...');
  assert.equal(t('onb_eval_status'), 'Comparing prices across local retailers...');
  const r = renderStep('evaluating');
  r.cleanup();
  assert.match(r.html, /Evaluating Deal\.\.\./);
  assert.match(r.html, /Comparing prices across local retailers\.\.\./);
  assert.match(r.html, /role="progressbar"[^>]*data-eval-bar/);
  assert.match(r.html, /Identifying it/, 'the bar must fill over the scan wait\'s own stage lines');
  assert.match(r.html, /Looking for prices/);
  assert.match(r.html, /Checking the sellers/);
  const text = r.html.replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(text, /\$|saved|save |savings|off\b/i, 'the demo printed a dollar or saving figure');
  assert.doesNotMatch(text, /[1-9]\d*\s*%/, 'the demo printed a percentage other than its own bar');
});

/* ------------------------------------------------------------------- W32 */

const GOOD = { source: 'a measured study', measuredAt: '2026-10-01' };

test('Savings Overview: Recently Scanned is the real history, newest first, capped', () => {
  const history = Array.from({ length: 7 }, (_, i) => ({
    id: `h${i}`, at: '2026-09-19T10:00:00Z',
    result: { kind: 'verdict', identity: { label: `Item ${i}` }, askingCents: 100 + i, tier: 'fair' },
  }));
  const v = savings.savingsView({ history }, {});
  assert.deepEqual(v.recent.map((r) => r.label), ['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4']);
  assert.equal(v.recent[0].cents, 100);
  const html = savings.savingsHtml(v);
  assert.match(html, /Recently Scanned/);
  assert.equal((html.match(/data-savings-row/g) ?? []).length, 5);
  assert.doesNotMatch(html, /Great Deal|Good Deal/, 'a verdict word was drawn on a history row');
});

test('Savings Overview: Total Saved and Monthly Goal Progress stay hidden until a measured figure exists', () => {
  const none = savings.savingsView({ history: [] }, {});
  assert.equal(none.totalSaved, null);
  assert.equal(none.goal, null);
  const hidden = savings.savingsHtml(none);
  assert.doesNotMatch(hidden, /data-savings="total"|data-savings="goal"|role="progressbar"|ilist-l">(Total Saved|Monthly Goal Progress)/);
  assert.doesNotMatch(hidden.replace(/<[^>]*>/g, ' '), /\$\s*\d/, 'a dollar figure was drawn with nothing measured');
  assert.match(hidden, /data-savings="empty"/, 'no history should say so');

  // A figure with no source is not measured, and stays hidden.
  assert.equal(savings.savingsView({ history: [] }, { total_saved: { saved: 150 } }).totalSaved, null);

  const shown = savings.savingsView(
    { history: [], onboarding: { answers: { monthlyGoal: 200 } } },
    { total_saved: { saved: 150, ...GOOD }, goal_progress: { saved: 50, ...GOOD } },
  );
  assert.equal(shown.totalSaved, 150);
  assert.deepEqual(shown.goal, { saved: 50, target: 200, pct: 25 });
  const html = savings.savingsHtml(shown);
  assert.match(html, /Total Saved/);
  assert.match(html, /Monthly Goal Progress/);
});

test('Savings Overview is a registered screen, reachable from the You screen', () => {
  assert.match(read('../public/js/main.js'), /licences, savings\]/);
  const you = read('../public/js/screens/you.js');
  assert.match(you, /data-act="savings"/);
  assert.match(you, /ctx\.go\('savings'\)/);
});
