/**
 * Item 17: onboarding, Jamin's Welcome screen tab (docs/walkthrough/
 * jamin-notes-2026-09-17.md, screens 1 to 33).
 *
 * WHAT THIS HOLDS, each one written to go red if the behaviour is removed:
 *
 *   1. His order. The flow is his numbered list, in his order, and the steps
 *      skipped today are exactly the ones made of unmeasured figures or of a
 *      function that does not exist.
 *   2. Hidden until real. The "10,000 smart shoppers", the rating, the reviews,
 *      the savings figures and the "goal is realistic" line render only when a
 *      measured figure with a source and a date is published, and never from
 *      a number typed in without provenance (CLAUDE.md hard rule 2).
 *   3. The routing. main.js registers the screen and asks the flow which
 *      screen comes first; onboarding, then setup, then consent, then camera.
 *   4. Nothing blocks. Continue works with nothing chosen on every step, the
 *      paywall steps show his prices as given and grant nothing.
 *   5. Every answer is saved, through the store and the events queue.
 *
 * The screen is rendered against the small hand-built DOM the other screen
 * tests use, which stores innerHTML without parsing it. Clicks are delivered by
 * handing the screen's own click listener an event whose target answers
 * `closest()` for the selector under test; that is the whole of what the
 * handler asks of a target.
 *
 * NOT A BROWSER. Layout, spacing and the look of any of this were not seen by
 * a person or a real engine here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const flow = await import('../public/js/onboarding-flow.js');
const store = await import('../public/js/store.js');
const screen = (await import('../public/js/screens/onboarding.js')).default;
const { demoResultHtml } = await import('../public/js/screens/onboarding.js');
const strings = await import('../public/js/onboarding-strings.js');
const { t } = await import('../public/js/ui-strings.js');

const { STEPS, PUBLISHED_FIGURES, realFigure, visibleSteps, isVisible, nextStepId, firstScreen } = flow;

/* ------------------------------------------------------------------ helpers */

/** Renders one step, returns what a test needs to look at and to click. */
function render(stepId, extra = {}) {
  const root = doc.createElement('div');
  const calls = [];
  const cleanup = screen.render(root, {
    params: { ...extra, ...(stepId ? { step: stepId } : {}) },
    api: { postConsent() {}, postEvent() {} },
    go: (...a) => calls.push(['go', ...a]),
    replace: (...a) => calls.push(['replace', ...a]),
  });
  // This DOM does not parse innerHTML, so the slider a real page would hold is
  // stood in for; a test that cares overrides it.
  root.querySelector = (sel) => (sel === '[data-range="threshold"]' ? { value: '20' } : null);
  const listener = (type) => root.listeners.find((l) => l.type === type)?.fn;
  return {
    root,
    calls,
    html: root.innerHTML,
    cleanup,
    /** Deliver a click to the screen. `hits` maps a selector to what closest() returns for it. */
    async click(hits) {
      const target = { closest: (sel) => hits[sel] ?? null };
      await listener('click')({ target });
    },
    input(hits) {
      listener('input')({ target: { closest: (sel) => hits[sel] ?? null } });
    },
  };
}

const next = { '[data-act]': { dataset: { act: 'next' } } };

function resetStore() {
  // The events queue lives in memory as well as in storage and outlives a
  // store reset, so its stored copy is kept: clearing only the copy would make
  // every count taken before a save disagree with the one taken after.
  const queue = storage.getItem('shin.track.queue');
  storage.clear();
  if (queue !== null) storage.setItem('shin.track.queue', queue);
  store.reset();
}

function trackedTypes() {
  const raw = storage.getItem('shin.track.queue');
  return raw ? JSON.parse(raw).map((e) => e.type) : [];
}

function trackedEvents(type) {
  const raw = storage.getItem('shin.track.queue');
  return raw ? JSON.parse(raw).filter((e) => e.type === type) : [];
}

const GOOD = { source: 'a measured study', measuredAt: '2026-10-01' };

/** Puts real figures in for the duration of `fn`, and always takes them out. */
function withFigures(figures, fn) {
  Object.assign(PUBLISHED_FIGURES, figures);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(figures)) delete PUBLISHED_FIGURES[k];
  }
}

/* ------------------------------------------------------------ 1. his order */

test('the flow is his numbered list, in his order', () => {
  /* His 1 to 29, then his 31 ("Evaluating Deal..."); his 30 is the camera. */
  assert.deepEqual(STEPS.map((s) => s.n), [...Array.from({ length: 29 }, (_, i) => i + 1), 31]);
  assert.deepEqual(STEPS.slice(0, 7).map((s) => s.id),
    ['welcome', 'promise', 'shops', 'frequency', 'priority', 'heard', 'tried']);
  assert.deepEqual(STEPS.slice(22).map((s) => s.id),
    ['trial', 'permissions', 'plans', 'tip_scan', 'tip_eval', 'tip_fix', 'tip_accuracy', 'evaluating']);
});

test('today the walked steps are his list minus the figure steps and sign-in', () => {
  const skipped = [8, 17, 19, 21, 22];
  const expected = STEPS.map((s) => s.n).filter((n) => !skipped.includes(n));
  assert.deepEqual(visibleSteps().map((s) => s.n), expected);
});

test('sign-in is skipped with no accounts and appears once accounts exist', () => {
  const signin = STEPS.find((s) => s.id === 'signin');
  assert.equal(isVisible(signin), false);
  assert.equal(isVisible(signin, { capabilities: { accounts: true } }), true);
  assert.ok(visibleSteps({ capabilities: { accounts: true } }).some((s) => s.id === 'signin'));
});

/* -------------------------------------------------- 2. hidden until real */

test('no figure is real by default, so every figure slot is hidden', () => {
  for (const name of ['shoppers', 'rating', 'reviews', 'savings_trend', 'savings_timeline', 'goal_progress', 'goal_realistic']) {
    assert.equal(realFigure(name), null, `${name} must be hidden until a measured number exists`);
  }
});

test('a number without a source and a date is not real', () => {
  assert.equal(realFigure('shoppers', { shoppers: { value: 10000 } }), null);
  assert.equal(realFigure('shoppers', { shoppers: { value: 10000, source: 'x' } }), null);
  assert.equal(realFigure('shoppers', { shoppers: { value: 10000, ...GOOD } })?.value, 10000);
  assert.equal(realFigure('rating', { rating: { value: 4.8, ...GOOD } }), null, 'a rating with no review count');
  assert.equal(realFigure('rating', { rating: { value: 5.4, count: 12, ...GOOD } }), null, 'a rating above 5');
  assert.equal(realFigure('rating', { rating: { value: 4.8, count: 12, ...GOOD } })?.value, 4.8);
  assert.equal(realFigure('reviews', { reviews: { items: [{ text: 'x' }], ...GOOD } }), null, 'a review with no source');
});

test('a figure step returns to the flow the moment its figure is real', () => {
  const social = STEPS.find((s) => s.id === 'social');
  assert.equal(isVisible(social), false);
  assert.equal(isVisible(social, { figures: { shoppers: { value: 10000, ...GOOD } } }), true);
});

test('rendered, no step carries an unmeasured claim, in either language', () => {
  const banned = /10,000|4\.8 star|star rating|smart shoppers|Consistently saving|realistic and achievable|great potential|Designed to maximize/i;
  resetStore();
  for (const s of STEPS) {
    const r = render(s.id);
    assert.ok(!banned.test(r.html), `step ${s.id} rendered an unmeasured claim: ${r.html.slice(Math.max(0, r.html.search(banned) - 30), r.html.search(banned) + 30)}`);
    r.cleanup();
  }
});

test('the social step shows each measured line only when that line is real', () => {
  resetStore();
  withFigures({ shoppers: { value: 10000, ...GOOD } }, () => {
    const r = render('social');
    assert.match(r.html, /Join over 10,000 smart shoppers like you/);
    assert.ok(!/star rating/.test(r.html), 'a rating that was never measured appeared');
    r.cleanup();
  });
  withFigures({ shoppers: { value: 10000, ...GOOD }, rating: { value: 4.8, count: 30, ...GOOD } }, () => {
    const r = render('social');
    assert.match(r.html, /4\.8 star rating/);
    r.cleanup();
  });
  // and with nothing real, asking for that step draws the first step instead
  const r = render('social');
  assert.equal(r.root.innerHTML.includes('data-step="welcome"'), true);
  r.cleanup();
});

test('the monthly goal status line is hidden unless it is measured', () => {
  resetStore();
  const off = render('monthly');
  assert.match(off.html, /\$100\.00 \/ month/, 'his target still shows');
  assert.ok(!/realistic and achievable/.test(off.html));
  off.cleanup();
  withFigures({ goal_realistic: { value: true, ...GOOD } }, () => {
    const on = render('monthly');
    assert.match(on.html, /Goal is realistic and achievable/);
    on.cleanup();
  });
});

/* ------------------------------------------------------------ 3. routing */

test('first launch order: onboarding, setup, consent, camera', () => {
  assert.equal(firstScreen({}), 'onboarding');
  assert.equal(firstScreen({ onboarding: { answers: {} } }), 'onboarding', 'answers without a finish do not count');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' } }), 'setup');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' }, seenIntro: true }), 'consent');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' }, seenIntro: true, consentSeen: true }), 'camera');
  assert.equal(firstScreen({ onboarding: { skippedAt: 'x', doneAt: 'y' }, seenIntro: true, consentSeen: true }), 'camera');
});

test('main.js registers the screen and takes the first screen from the flow', () => {
  const main = readFileSync(fileURLToPath(new URL('../public/js/main.js', import.meta.url)), 'utf8');
  assert.match(main, /import onboarding from '\.\/screens\/onboarding\.js'/);
  assert.match(main, /for \(const s of \[[^\]]*\bonboarding\b[^\]]*\]\)/);
  assert.match(main, /import \{ firstScreen, replayUrlFor \} from '\.\/onboarding-flow\.js'/);
  assert.match(main, /firstScreen\(store\.get\(\)\)/);
  assert.equal(screen.id, 'onboarding');
});

test('Continue from the first step walks his order and ends at setup, on record', async () => {
  resetStore();
  const seen = [];
  let id = null;
  for (let guard = 0; guard < 40; guard += 1) {
    const r = render(id);
    const step = r.html.match(/data-step="([a-z_]+)"/)[1];
    seen.push(step);
    await r.click(next);
    r.cleanup();
    const last = r.calls.at(-1);
    assert.equal(last[0], 'replace');
    if (last[1] !== 'onboarding') {
      assert.equal(last[1], 'setup', 'a fresh install goes to setup after the flow');
      break;
    }
    id = last[2].step;
  }
  assert.deepEqual(seen, visibleSteps().map((s) => s.id));
  assert.ok(store.get().onboarding.doneAt, 'finishing must be on record');
  assert.equal(firstScreen(store.get()), 'setup');
  assert.ok(trackedTypes().includes('onboarding_done'));
});

test('every step can be left with nothing chosen, and Skip leaves from any step', async () => {
  for (const s of visibleSteps()) {
    resetStore();
    const r = render(s.id);
    await r.click(next);
    r.cleanup();
    assert.ok(r.calls.some((c) => c[0] === 'replace'), `step ${s.id} did not let the person continue`);
  }
  resetStore();
  const r = render('heard');
  await r.click({ '[data-act]': { dataset: { act: 'skip' } } });
  r.cleanup();
  assert.deepEqual(r.calls.at(-1), ['replace', 'setup']);
  assert.equal(store.get().onboarding.skippedAt, 'heard');
  assert.ok(trackedTypes().includes('onboarding_skip'));
});

/* ------------------------------------------------------------ 4. paywall */

test('the paywall shows his text and his prices as given', () => {
  resetStore();
  const trial = render('trial');
  assert.match(trial.html, /We want you to try SHIN Pro for free/);
  assert.match(trial.html, /No Payment Due Now/);
  assert.match(trial.html, /Try Now/);
  trial.cleanup();
  const plans = render('plans');
  assert.match(plans.html, /Start your 3-day FREE trial to unlock unlimited scans/);
  assert.match(plans.html, /\$39\.99 billed annually/);
  assert.match(plans.html, /\(\$3\.33\/mo\)/);
  assert.match(plans.html, /\$12\.99\/mo/);
  plans.cleanup();
});

test('the paywall does not block: Continue and Not now both go on, and Pro is never granted', async () => {
  resetStore();
  const a = render('plans');
  await a.click(next);
  a.cleanup();
  assert.equal(a.calls.at(-1)[1], 'onboarding', 'Continue with no plan chosen goes to the next step');
  assert.equal(a.calls.at(-1)[2].step, 'tip_scan');
  const b = render('plans');
  await b.click({ '[data-act]': { dataset: { act: 'notnow' } } });
  b.cleanup();
  assert.deepEqual(b.calls.at(-1), ['replace', 'setup']);
  assert.equal(store.isPro(), false, 'nothing here may grant Pro');
  assert.equal(store.get().proUntil, null);
  const trial = render('trial');
  await trial.click(next);
  trial.cleanup();
  assert.equal(trial.calls.at(-1)[2].step, 'permissions');
});

/* ------------------------------------------------------------- 5. saving */

test('a multiple-choice answer is saved to the store and to the events queue', async () => {
  resetStore();
  const r = render('shops');
  const group = { querySelectorAll: () => [] };
  const pick = (opt) => ({ '[data-opt]': { dataset: { opt }, parentElement: group } });
  await r.click(pick('pharmacies'));
  await r.click(pick('bigbox'));
  r.cleanup();
  assert.deepEqual(store.get().onboarding.answers.shopTypes, ['bigbox', 'pharmacies']);
  const events = trackedEvents('onboarding_answer').filter((e) => e.payload.key === 'shopTypes');
  assert.equal(events.length, 2);
  assert.deepEqual(events.at(-1).payload.value, ['bigbox', 'pharmacies']);
  await r.click(pick('bigbox'));
  assert.deepEqual(store.get().onboarding.answers.shopTypes, ['pharmacies'], 'tapping again takes it off');
});

test('a single choice is saved the moment it is tapped, not on Continue', async () => {
  resetStore();
  const r = render('frequency');
  await r.click({ '[data-opt]': { dataset: { opt: 'regular' }, parentElement: { querySelectorAll: () => [] } } });
  r.cleanup();
  assert.equal(store.get().onboarding.answers.shopsPerWeek, 'regular');
  assert.equal(r.calls.length, 0, 'nothing navigated');
});

test('the price range: a touched slider becomes the user\'s own line, an untouched one does not', async () => {
  resetStore();
  assert.equal(store.get().lineUnderPct ?? 10, 10);
  // untouched: recorded as an answer, flagged untouched, the app default left alone
  const a = render('threshold');
  a.root.querySelector = (sel) => (sel === '[data-range="threshold"]' ? { value: '20' } : null);
  await a.click(next);
  a.cleanup();
  assert.equal(store.get().onboarding.answers.dealThreshold, 20);
  assert.equal(trackedEvents('onboarding_answer').at(-1).payload.touched, false);
  assert.equal(store.get().lineUnderPct ?? 10, 10, 'an untouched default must not overwrite the app default');
  // touched: the existing setting the price line reads
  const b = render('threshold');
  const range = { value: '15' };
  b.root.querySelector = (sel) => (sel === '[data-range="threshold"]' ? range
    : sel === '[data-out="threshold"]' ? { innerHTML: '' } : null);
  b.input({ '[data-range="threshold"]': range });
  await b.click(next);
  b.cleanup();
  assert.equal(store.get().lineUnderPct, 15);
  assert.equal(trackedEvents('onboarding_answer').at(-1).payload.touched, true);
});

test('dollar mode is stored as dollar amounts with its unit and never written into the percentage line', () => {
  resetStore();
  const before = store.get().lineUnderPct ?? 10;
  assert.equal(flow.applyThreshold({ store }, 'amount', 5, true), true);
  assert.equal(store.get().lineUnderPct ?? 10, before, 'a dollar figure must not become a percent');
  assert.equal(store.get().lineUnit, 'amount');
  assert.equal(store.get().lineAmounts.good, 5);
  assert.equal(flow.applyThreshold({ store }, 'amount', 99, true), false, 'out of the slider range is refused');
  assert.equal(flow.applyThreshold({ store }, 'percent', 20, false), false);
  assert.equal(flow.applyThreshold({ store }, 'percent', 15, true), true);
  assert.equal(store.get().lineUnderPct, 15);
  assert.equal(store.get().lineUnit, 'percent');
});

test('the monthly goal is recorded with whether the person moved it', async () => {
  resetStore();
  const m = render('monthly');
  m.root.querySelector = (sel) => (sel === '[data-out="monthly"]' ? { textContent: '' } : null);
  await m.click({ '[data-step-by]': { dataset: { stepBy: '1' } } });
  await m.click(next);
  m.cleanup();
  // the events queue outlives a store reset within one run, so take the latest
  const goal = trackedEvents('onboarding_answer').filter((e) => e.payload.key === 'monthlyGoal').at(-1);
  assert.ok(goal, 'the monthly goal was not recorded');
  assert.equal(goal.payload.value, 110);
});

/* ---------------------------------------------------------------- strings */

test('the onboarding text has no em dash in either language, and both have the same keys', () => {
  assert.deepEqual(Object.keys(strings.ONB_EN).sort(), Object.keys(strings.ONB_FR).sort());
  for (const table of [strings.ONB_EN, strings.ONB_FR]) {
    for (const [key, value] of Object.entries(table)) {
      const text = typeof value === 'function' ? value({ n: '5', v: '4', total: '9' }) : value;
      assert.ok(!text.includes(String.fromCharCode(0x2014)), `${key} has an em dash`);
    }
  }
  assert.equal(t('onb_promise'), 'Scan any product and instantly know if it’s worth it');
});

/* ------------------------------------------------------------ 6. replay */
/*
 * "Watch the welcome again": opt-in, unlimited, from the You screen and from
 * `?onboarding=1`. It must run the whole flow in the same order, land on the
 * camera, record itself like a first run, wipe nothing, and re-trigger nothing
 * one-time.
 */

/** A person who has finished everything and has data worth losing. */
function seedFinishedUser() {
  resetStore();
  store.update({
    seenIntro: true,
    consentSeen: true,
    personality: 'warm',
    lineUnderPct: 15,
    lineOverPct: 5,
    history: [{ id: 'scan-1', at: '2026-09-18T12:00:00.000Z', result: { kind: 'verdict' } }],
    ratings: [{ scanId: 'scan-1', rating: 'up' }],
    onboarding: {
      doneAt: '2026-09-01T00:00:00.000Z',
      skippedAt: null,
      step: 'tip_accuracy',
      answers: {
        shopTypes: ['bigbox', 'pharmacies'], shopsPerWeek: 'regular', dealThresholdMode: 'percent',
        dealThreshold: 15, monthlyGoal: 250, planInterest: 'annual', locationAllowed: true,
      },
    },
  });
  store.setConsent({ photos: true, location: true });
}

const snapshot = () => JSON.stringify(store.get());
const countOf = (type) => trackedEvents(type).length;

/** Continue through every step of a replay; returns the ids seen and where it landed. */
async function walkReplay() {
  const seen = [];
  let extra = { replay: 1 };
  let id = null;
  for (let guard = 0; guard < 40; guard += 1) {
    const r = render(id, extra);
    seen.push(r.html.match(/data-step="([a-z_]+)"/)[1]);
    await r.click(next);
    r.cleanup();
    const last = r.calls.at(-1);
    if (last[1] !== 'onboarding') return { seen, landed: last[1] };
    assert.equal(last[2].replay, 1, 'a replay must carry itself to the next step');
    id = last[2].step;
    extra = { replay: 1 };
  }
  throw new Error('the replay never ended');
}

test('the You screen has a Watch the welcome again row that starts a replay', () => {
  const you = readFileSync(fileURLToPath(new URL('../public/js/screens/you.js', import.meta.url)), 'utf8');
  assert.match(you, /data-act="welcome"/);
  assert.match(you, /t\('onb_replay_row'\)/);
  assert.match(you, /ctx\.go\('onboarding', \{ replay: 1 \}\)/);
  assert.equal(t('onb_replay_row'), 'Watch the welcome again');
});

test('?onboarding=1 replays once, and only for someone who has finished the first run', () => {
  const done = { onboarding: { doneAt: 'x' } };
  assert.equal(flow.wantsReplay('?onboarding=1'), true);
  assert.equal(flow.wantsReplay('?onboarding=0'), false);
  assert.equal(flow.wantsReplay(''), false);
  assert.equal(flow.replayUrlFor('?onboarding=1', done), '?s=onboarding&replay=1');
  assert.equal(flow.replayUrlFor('?onboarding=1', {}), null, 'a new user cannot skip setup with a parameter');
  assert.equal(flow.replayUrlFor('?s=camera', done), null);
  const main = readFileSync(fileURLToPath(new URL('../public/js/main.js', import.meta.url)), 'utf8');
  assert.match(main, /replayUrlFor\(location\.search, store\.get\(\)\)/);
  assert.match(main, /history\.replaceState\(\{\}, '', replayUrl\)/);
});

test('a replay is opt-in: first-run behaviour is the same with or without the switch', () => {
  assert.equal(flow.isReplay({}, { onboarding: { doneAt: 'x' } }), false, 'nothing asked, nothing replays');
  assert.equal(flow.isReplay({ replay: '1' }, { onboarding: { doneAt: 'x' } }), true);
  assert.equal(flow.isReplay({ replay: 1 }, {}), false, 'an unfinished first run is not a replay');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' }, seenIntro: true, consentSeen: true }), 'camera');
  assert.equal(firstScreen({}), 'onboarding', 'a real new user still sees it once, automatically');
});

test('a replay runs the whole flow in the same order and lands on the camera', async () => {
  seedFinishedUser();
  const { seen, landed } = await walkReplay();
  assert.deepEqual(seen, visibleSteps().map((s) => s.id));
  assert.equal(landed, 'camera');
});

test('a replay wipes and flips nothing: walking through leaves everything saved as it was', async () => {
  seedFinishedUser();
  const before = snapshot();
  await walkReplay();
  assert.equal(snapshot(), before, 'the store changed during a replay nobody changed anything in');
  const s = store.get();
  assert.equal(s.lineUnderPct, 15);
  assert.deepEqual(s.onboarding.answers.shopTypes, ['bigbox', 'pharmacies']);
  assert.equal(s.onboarding.answers.dealThreshold, 15);
  assert.equal(s.onboarding.answers.monthlyGoal, 250);
  assert.equal(s.consent.location, true);
  assert.equal(s.history.length, 1);
  assert.equal(s.ratings.length, 1);
  assert.equal(s.onboarding.doneAt, '2026-09-01T00:00:00.000Z', 'the first-run stamp is not reset or replaced');
  assert.equal(s.seenIntro, true);
  assert.equal(s.consentSeen, true);
  assert.equal(store.isPro(), false, 'a replay grants nothing');
});

test('a replay shows what is saved, so tapping through changes nothing', () => {
  seedFinishedUser();
  const shops = render('shops', { replay: 1 });
  assert.match(shops.html, /class="onb-opt on"[^>]*aria-checked="true"[^>]*data-opt="bigbox"/);
  assert.match(shops.html, /class="onb-opt on"[^>]*aria-checked="true"[^>]*data-opt="pharmacies"/);
  assert.ok(!/class="onb-opt on"[^>]*data-opt="supermarkets"/.test(shops.html));
  shops.cleanup();
  const threshold = render('threshold', { replay: 1 });
  assert.match(threshold.html, /15% OFF/, 'the slider starts at the saved line, not at his recommended 20');
  threshold.cleanup();
  const monthly = render('monthly', { replay: 1 });
  assert.match(monthly.html, /\$250\.00 \/ month/);
  monthly.cleanup();
});

test('a replay saves what the person actually changes, and only that', async () => {
  seedFinishedUser();
  const before = JSON.parse(snapshot());
  const r = render('frequency', { replay: 1 });
  await r.click({ '[data-opt]': { dataset: { opt: 'frequent' }, parentElement: { querySelectorAll: () => [] } } });
  r.cleanup();
  const after = JSON.parse(snapshot());
  assert.equal(after.onboarding.answers.shopsPerWeek, 'frequent');
  after.onboarding.answers.shopsPerWeek = before.onboarding.answers.shopsPerWeek;
  delete after.onboarding.updatedAt;
  delete before.onboarding.updatedAt;
  assert.deepEqual(after, before, 'one tap must change one answer and nothing else');
});

test('a replay is recorded like a first run, and never records a first run finishing', async () => {
  seedFinishedUser();
  const start = countOf('onboarding_replay_start');
  const done = countOf('onboarding_replay_done');
  const steps = countOf('onboarding_step');
  const firstRunDone = countOf('onboarding_done');
  const skips = countOf('onboarding_skip');
  await walkReplay();
  assert.equal(countOf('onboarding_replay_start') - start, 1);
  assert.equal(countOf('onboarding_replay_done') - done, 1);
  assert.equal(countOf('onboarding_step') - steps, visibleSteps().length, 'every replayed screen is an event');
  assert.equal(countOf('onboarding_done'), firstRunDone, 'a replay must not record a second first-run finish');
  assert.equal(countOf('onboarding_skip'), skips);
  const answers = trackedEvents('onboarding_answer').filter((e) => e.payload.kept === true);
  assert.ok(answers.length >= 2, 'walked-through answers are recorded as events even though nothing is re-saved');
});

test('a replay can be run again and again, with no limit', async () => {
  seedFinishedUser();
  const before = snapshot();
  const start = countOf('onboarding_replay_start');
  for (let i = 0; i < 3; i += 1) {
    const { landed } = await walkReplay();
    assert.equal(landed, 'camera');
  }
  assert.equal(countOf('onboarding_replay_start') - start, 3);
  assert.equal(snapshot(), before);
});

test('skipping out of a replay changes nothing and is recorded as a replay skip', async () => {
  seedFinishedUser();
  const before = snapshot();
  const skips = countOf('onboarding_replay_skip');
  const r = render('plans', { replay: 1 });
  await r.click({ '[data-act]': { dataset: { act: 'notnow' } } });
  r.cleanup();
  assert.deepEqual(r.calls.at(-1), ['replace', 'camera']);
  const r2 = render('heard', { replay: 1 });
  await r2.click({ '[data-act]': { dataset: { act: 'skip' } } });
  r2.cleanup();
  assert.deepEqual(r2.calls.at(-1), ['replace', 'camera']);
  assert.equal(snapshot(), before, 'a replay skip must not stamp skippedAt or change the plan answer');
  assert.equal(countOf('onboarding_replay_skip') - skips, 1);
});

test('a replay flag on a first run is ignored: the first run still finishes and stamps itself', async () => {
  resetStore();
  const r = render('heard', { replay: 1 });
  await r.click({ '[data-act]': { dataset: { act: 'skip' } } });
  r.cleanup();
  assert.deepEqual(r.calls.at(-1), ['replace', 'setup']);
  assert.equal(store.get().onboarding.skippedAt, 'heard');
});

/* ------------------------------------------------------------- item 19: demo */

/**
 * A demo scan on the permissions step, so someone can see the product work
 * before granting camera permission (docs/scanner-build-order-2026-09-19.md
 * item 19; failure.md D19). `identifyDemo` is a SEAM: `/api/identify/demo`
 * is another session's route to build, so it is stubbed here rather than
 * hit for real, the same way `postConsent`/`postEvent` already are above.
 *
 * `render()`'s shared helper only stubs `[data-range="threshold"]`, and its
 * `api` carries no `identifyDemo`, so this uses its own small render that
 * adds both without touching the shared helper other tests in this file
 * depend on.
 */
function renderPermissions(identifyDemo) {
  const root = doc.createElement('div');
  const cleanup = screen.render(root, {
    params: { step: 'permissions' },
    api: { postConsent() {}, postEvent() {}, identifyDemo },
    go: () => {},
    replace: () => {},
  });
  let slotHtml = '';
  const demoSlot = {
    get innerHTML() { return slotHtml; },
    set innerHTML(v) { slotHtml = v; },
  };
  // paintPermissions() no-ops on a selector that resolves to null (`if (!el)
  // continue;`), so only the demo slot needs a real stand-in here.
  root.querySelector = (sel) => (sel === '[data-demo-slot]' ? demoSlot : null);
  const listener = root.listeners.find((l) => l.type === 'click')?.fn;
  return {
    cleanup,
    slot: () => slotHtml,
    async seeDemo() {
      await listener({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act: 'see-demo' } } : null) } });
    },
  };
}

const DEMO_ANSWER = {
  demo: true,
  model: 'deterministic-sample-v1',
  product: { code: 'd', name: 'Demo Thing', brand: 'Demo Co', size: '1 ea' },
  category: 'demo',
  askingCents: 199,
  verdictWord: 'fair',
  band: 'confident',
};

test('the demo link paints a real demo answer, always badged as one', async () => {
  const r = renderPermissions(async () => DEMO_ANSWER);
  await r.seeDemo();
  r.cleanup();
  assert.match(r.slot(), /DEMO/, 'the demo card does not carry the demo badge at all');
  assert.match(r.slot(), /Demo Co Demo Thing/);
  assert.match(r.slot(), /\$1\.99/);
});

test('the price and the verdict never render without the demo badge beside them', () => {
  const html = demoResultHtml(DEMO_ANSWER);
  const priceLine = /<p class="onb-demo-price">([\s\S]*?)<\/p>/.exec(html);
  const verdictLine = /<p class="onb-demo-verdict">([\s\S]*?)<\/p>/.exec(html);
  assert.ok(priceLine, 'no price line rendered for a demo with an asking price');
  assert.match(priceLine[1], /onb-demo-badge/, 'the price shows with no demo badge next to it');
  assert.ok(verdictLine, 'no verdict line rendered for a demo with a verdict word');
  assert.match(verdictLine[1], /onb-demo-badge/, 'the verdict shows with no demo badge next to it');
});

test('a demo with no price and no verdict still shows the top badge, and renders neither line', () => {
  const html = demoResultHtml({ demo: true, product: { name: 'Thing' } });
  assert.match(html, /onb-demo-badge/);
  assert.doesNotMatch(html, /onb-demo-price/);
  assert.doesNotMatch(html, /onb-demo-verdict/);
});

test('the demo link degrades honestly when the route does not exist yet, never a fabricated answer', async () => {
  const r = renderPermissions(async () => null);
  await r.seeDemo();
  r.cleanup();
  assert.ok(!r.slot().includes('onb-demo-badge'), 'a missing route painted a demo card anyway');
  assert.match(r.slot(), new RegExp(t('onb_demo_unavailable')));
});

test('a demo card never leaks a missing fact onto the screen', () => {
  const html = demoResultHtml({ demo: true, product: {} });
  assert.doesNotMatch(html, /undefined|null|NaN/);
});
