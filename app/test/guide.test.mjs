/**
 * The new-user walkthrough (screens/guide.js, guide-state.js). Aurik, 2026-11-22: "set up the app
 * walk through for new users".
 *
 * WHAT THIS HOLDS
 *   1. A first launch lands on the walkthrough in front of the camera, and only in front of the
 *      camera: agree, permissions and any other screen pass through unchanged.
 *   2. Once seen (finished or skipped) it never stands in front of the camera again.
 *   3. Four cards in scan order, every word from ui-strings in English and French.
 *   4. Skip on every card but the last; Back on every card but the first; nothing blocks.
 *   5. Finishing marks it seen, dismisses the early access banner (the fourth card says the same),
 *      and lands on the camera; a replay from You goes back instead.
 *   6. You has the row that replays it (RULINGS: onboarding watchable more than once).
 *
 * NOT A BROWSER: the mini-dom stores innerHTML without parsing it. Layout is checked by the
 * Playwright pass, written down in the commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const state = await import('../public/js/guide-state.js');
const guide = (await import('../public/js/screens/guide.js'));
const { TABLES } = await import('../public/js/ui-strings.js');
const { EARLY_ACCESS_KEY } = await import('../public/js/early-access.js');

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Renders the screen into a fake root that keeps its click handler, so a test can press buttons by data-act. */
function mount(params = {}) {
  const calls = [];
  let handler = null;
  const root = {
    innerHTML: '',
    addEventListener(type, fn) { if (type === 'click') handler = fn; },
    removeEventListener() {},
    querySelector: () => null,
  };
  const ctx = { params, replace: (id) => calls.push(['replace', id]), go: (id, p) => calls.push(['go', id, p]) };
  const stop = guide.default.render(root, ctx);
  const press = (act) => {
    assert.match(root.innerHTML, new RegExp(`data-act="${act}"`), `no ${act} button on this card`);
    handler({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act } } : null) } });
  };
  return { root, calls, press, stop };
}

test('1. a first launch lands on the walkthrough in front of the camera, and nowhere else', () => {
  const s = mem();
  assert.equal(state.landing('camera', s), 'guide');
  for (const id of ['agree', 'permissions', 'consent', 'onboarding', 'setup']) assert.equal(state.landing(id, s), id, `${id} was replaced`);
});

test('1b. a phone that has already scanned is not walked through after an update', () => {
  assert.equal(state.landing('camera', mem(), { history: [{ id: 'x' }] }), 'camera');
  assert.equal(state.landing('camera', mem(), { history: [] }), 'guide');
});

test('2. once seen it never stands in front of the camera again; storage that throws shows it, never blocks', () => {
  const s = mem();
  state.markGuideSeen(s);
  assert.equal(state.landing('camera', s), 'camera');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(state.guidePending(broken), true);
  assert.doesNotThrow(() => state.markGuideSeen(broken));
});

test('2b. main.js and the permissions screen both ask landing(), so neither path skips it', () => {
  assert.match(read('../public/js/main.js'), /const first = landing\(firstScreen\(store\.get\(\)\), globalThis\.localStorage, store\.get\(\)\)/);
  assert.match(read('../public/js/screens/permissions.js'), /ctx\.replace\(landing\(firstScreen\(/);
  assert.match(read('../public/js/main.js'), /paywall, savings, guide[,\]]/, 'the guide screen is not registered');
});

test('3. four cards in scan order, each with a title and body in English and French', () => {
  assert.deepEqual(guide.GUIDE_CARDS.map((c) => c.art), ['barcode', 'tag', 'verdict', 'search']);
  for (const lang of ['en', 'fr']) {
    for (const c of guide.GUIDE_CARDS) {
      for (const k of [`guide_${c.id}_title`, `guide_${c.id}_body`]) assert.ok(TABLES[lang][k], `${lang} has no ${k}`);
    }
    for (const k of ['guide_title', 'guide_skip', 'guide_next', 'guide_back', 'guide_start', 'guide_done', 'guide_step', 'you_guide_row']) {
      assert.ok(TABLES[lang][k], `${lang} has no ${k}`);
    }
  }
});

test('4. Skip on every card but the last, Back on every card but the first, Next walks all four', () => {
  storage.clear?.();
  const m = mount();
  for (let i = 0; i < 4; i += 1) {
    const html = m.root.innerHTML;
    assert.match(html, new RegExp(`data-card="${i + 1}"`));
    assert.equal(/data-act="back"/.test(html), i > 0, `card ${i + 1}: Back`);
    assert.equal(/data-act="skip"/.test(html), i < 3, `card ${i + 1}: Skip`);
    if (i < 3) m.press('next');
  }
  assert.match(m.root.innerHTML, /data-act="done"/);
  m.press('back');
  assert.match(m.root.innerHTML, /data-card="3"/);
  m.stop();
});

test('5. finishing marks it seen, dismisses the early access banner, and lands on the camera', () => {
  globalThis.localStorage.removeItem(state.GUIDE_KEY);
  globalThis.localStorage.removeItem(EARLY_ACCESS_KEY);
  const m = mount();
  m.press('next'); m.press('next'); m.press('next');
  m.press('done');
  assert.equal(state.guidePending(), false);
  assert.equal(globalThis.localStorage.getItem(EARLY_ACCESS_KEY), '1', 'the banner would repeat what card 4 said');
  assert.deepEqual(m.calls.at(-1), ['replace', 'camera']);
  m.stop();
});

test('5b. Skip on the first card also marks it seen and lands on the camera', () => {
  globalThis.localStorage.removeItem(state.GUIDE_KEY);
  const m = mount();
  m.press('skip');
  assert.equal(state.guidePending(), false);
  assert.deepEqual(m.calls.at(-1), ['replace', 'camera']);
  m.stop();
});

test('5c. a replay ends on Done, not Start scanning', () => {
  const m = mount({ replay: '1' });
  m.press('next'); m.press('next'); m.press('next');
  assert.match(m.root.innerHTML, new RegExp(TABLES.en.guide_done));
  m.stop();
});

test('6. You has a "How Pexi works" row that replays the walkthrough', () => {
  const you = read('../public/js/screens/you.js');
  assert.match(you, /data-act="guide"/);
  assert.match(you, /ctx\.go\('guide', \{ replay: 1 \}\)/);
});
