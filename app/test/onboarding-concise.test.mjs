/**
 * The concise welcome flow, Aurik 2026-11-22: Cal AI's onboarding "tweaked to mirror Pexi", "informational
 * as well as concise", "we also need user data", cut to five screens on his answer the same day.
 *
 * WHAT THIS HOLDS
 *   1. The app walks exactly five screens: welcome, gender, how often, where, the camera and location ask.
 *   2. The welcome is Cal AI's: the mascot, a line about Pexi, Get started, and Skip (R-77), no top row.
 *   3. Each question has a "why we ask" line, in English and French; gender can be declined.
 *   4. A question's Continue waits for an answer; Skip the rest never waits; a replay never waits.
 *   5. Every answer is saved the moment it is tapped (store and events queue), the user data asked for.
 *   6. The end of the flow hands to the how-it-works walkthrough, then the camera.
 *
 * NOT A BROWSER: mini-dom stores innerHTML without parsing it. The look is checked by Playwright.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const flow = await import('../public/js/onboarding-flow.js');
const store = await import('../public/js/store.js');
const screen = (await import('../public/js/screens/onboarding.js')).default;
const { TABLES } = await import('../public/js/ui-strings.js');
const { FLAGS } = await import('../public/js/flags.js');

/** Renders one step into a root that keeps its click handler; `press(sel)` fires a click on a fake element. */
function render(step, params = {}) {
  const calls = [];
  const handlers = {};
  const root = {
    innerHTML: '',
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: (sel) => (sel === '[data-act="next"]' ? cta : null),
    querySelectorAll: () => [],
  };
  const cta = { disabled: null };
  const ctx = { params: { step, ...params }, replace: (...a) => calls.push(['replace', ...a]), go() {}, api: { postEvent() {}, postConsent() {} } };
  const stop = screen.render(root, ctx);
  cta.disabled = /data-act="next" disabled/.test(root.innerHTML);
  const clickOpt = async (opt) => {
    const el = { dataset: { opt }, classList: { toggle() {} }, setAttribute() {} };
    const group = { querySelectorAll: () => [el] };
    el.parentElement = group;
    await handlers.click({ target: { closest: (sel) => (sel === '[data-opt]' ? el : null) } });
  };
  const clickAct = async (act) => handlers.click({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act } } : null) } });
  return { root, html: root.innerHTML, calls, cta, clickOpt, clickAct, stop };
}

function fresh() {
  store.reset();
  storage.removeItem('pexi.guide.seen');
}

test('1. the flag is on and the app walks five screens, inside R-77\'s ceiling', () => {
  assert.equal(FLAGS.onboarding, true);
  assert.deepEqual(flow.visibleSteps().map((s) => s.id), ['welcome', 'gender', 'frequency', 'shops', 'permissions']);
  assert.ok(flow.visibleSteps().length <= 5);
});

test('2. the welcome: mascot, a line about Pexi, Get started and Skip, and no back, bar or top skip', () => {
  fresh();
  const r = render('welcome');
  assert.match(r.html, /onb-welcome-line/);
  assert.match(r.html, new RegExp(TABLES.en.onb_welcome_line.replace('.', '\\.')));
  assert.match(r.html, new RegExp(`data-act="next">${TABLES.en.onb_get_started}<`));
  assert.match(r.html, /class="linky onb-notnow" data-act="skip"/, 'no Skip on the first screen (R-77)');
  assert.doesNotMatch(r.html, /class="onb-top"/, 'the welcome carries the question screens\' top row');
  r.stop();
});

test('3. each question says why it is asked, in both languages; gender can be declined', () => {
  for (const lang of ['en', 'fr']) {
    for (const id of ['gender', 'frequency', 'shops']) {
      assert.ok(TABLES[lang][`onb_${id}_why`], `${lang}: no why line for ${id}`);
      assert.ok(TABLES[lang][`onb_${id}_q`], `${lang}: no question for ${id}`);
    }
    for (const o of flow.stepById('gender').options) assert.ok(TABLES[lang][`onb_gender_${o}`], `${lang}: no gender option ${o}`);
  }
  assert.ok(flow.stepById('gender').options.includes('prefer_not'));
  assert.match(TABLES.en.onb_frequency_q, /grocery shopping/);
  fresh();
  const r = render('gender');
  assert.match(r.html, /class="onb-why"/);
  r.stop();
});

test('4. a question\'s Continue waits for an answer and opens on a pick; Skip the rest never waits', async () => {
  fresh();
  const r = render('gender');
  assert.equal(r.cta.disabled, true, 'Continue is open before anything is chosen');
  assert.match(r.html, /data-act="skip"/);
  await r.clickOpt('prefer_not');
  assert.equal(r.cta.disabled, false, 'choosing did not open Continue');
  r.stop();
  const multi = render('shops');
  assert.equal(multi.cta.disabled, true);
  await multi.clickOpt('groceries');
  assert.equal(multi.cta.disabled, false);
  await multi.clickOpt('groceries');
  assert.equal(multi.cta.disabled, true, 'un-choosing the only shop left Continue open');
  multi.stop();
});

test('4b. a replay never waits', () => {
  fresh();
  store.update((s) => ({ ...s, onboarding: { doneAt: 'x', answers: {} } }));
  const r = render('gender', { replay: '1' });
  assert.equal(r.cta.disabled, false);
  r.stop();
});

test('5. the answers are saved the moment they are tapped: the user data', async () => {
  fresh();
  const g = render('gender');
  await g.clickOpt('female');
  g.stop();
  const f = render('frequency');
  await f.clickOpt('regular');
  f.stop();
  const a = store.get().onboarding.answers;
  assert.equal(a.gender, 'female');
  assert.equal(a.shopsPerWeek, 'regular');
});

test('6. the end of the flow hands to the walkthrough, and skipping the welcome still asks for permissions', async () => {
  fresh();
  const last = render('permissions');
  await last.clickAct('next');
  assert.deepEqual(last.calls.at(-1), ['replace', 'guide']);
  last.stop();
  fresh();
  const w = render('welcome');
  await w.clickAct('skip');
  assert.deepEqual(w.calls.at(-1), ['replace', 'permissions'], 'a skipped flow never asked for the camera');
  w.stop();
});
