/**
 * D-242 (2026-10-28): the phone's back button left the app from an open sheet.
 * Opening the search, the price pad or a verdict added no history entry, so with
 * a verdict on screen `history.length` was 2 and back landed on about:blank.
 *
 * The router now gives a sheet stack one entry of its own (`ctx.sheet.open`),
 * runs the screen's close on back instead of repainting, and pops that entry
 * when the screen closes the sheet itself (`ctx.sheet.close`), so the next back
 * is a real one and never a dead press on a second copy of the camera.
 *
 * The browser here is a small model of a session history: a list of entries, an
 * index, pushState truncating the forward entries, and back() firing popstate
 * on a later task the way a browser does. It is a model, not Chrome or Android;
 * the Playwright measurement in the lane report is the one against a real engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser, MiniElement } from './mini-dom.mjs';

const doc = makeDocument();
installBrowser({ doc, storage: makeStorage() });

/** A session history: entry 0 is the page the app was opened from (about:blank in the defect). */
function makeHistory(startUrl) {
  const listeners = [];
  const h = {
    entries: [{ url: 'about:blank', state: null }, { url: startUrl, state: null }],
    index: 1,
    get length() { return h.entries.length; },
    get state() { return h.entries[h.index].state; },
    pushState(state, _t, url) {
      h.entries.splice(h.index + 1);
      h.entries.push({ url: resolve(url), state: structuredClone(state) });
      h.index += 1;
    },
    replaceState(state, _t, url) {
      h.entries[h.index] = { url: resolve(url), state: structuredClone(state) };
    },
    pending: [],
    back() { h.pending.push(-1); },
    /** Runs the queued traversals, as the browser's next task would. */
    flush() {
      while (h.pending.length) {
        const d = h.pending.shift();
        const to = h.index + d;
        if (to < 0) continue;
        h.index = to;
        if (h.entries[to].url === 'about:blank') { h.left = true; continue; }
        for (const fn of listeners) fn({ state: h.entries[to].state });
      }
    },
    left: false,
    listeners,
  };
  function resolve(url) {
    if (url.startsWith('?')) return `http://app/${url}`;
    return url;
  }
  return h;
}

const hist = makeHistory('http://app/?s=camera');
globalThis.history = hist;
Object.defineProperty(globalThis, 'location', {
  configurable: true,
  get() {
    const u = new URL(hist.entries[hist.index].url === 'about:blank' ? 'http://app/' : hist.entries[hist.index].url);
    return { href: u.href, search: u.search };
  },
});
window.addEventListener = (type, fn) => { if (type === 'popstate') hist.listeners.push(fn); };
window.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const router = await import('../public/js/router.js');

/* A camera screen with one sheet, closed by its own button or by back. */
let sheetUp = false;
let paints = 0;
let api = null;
router.register({
  id: 'camera',
  title: 'Pexi',
  render(_root, ctx) {
    paints += 1;
    sheetUp = false;
    api = {
      openVerdict() { sheetUp = true; ctx.sheet.open(() => { sheetUp = false; }); },
      done() { sheetUp = false; ctx.sheet.close(); },
      goSaved() { ctx.go('watchlist'); },
    };
  },
});
router.register({ id: 'watchlist', title: 'Saved', render() {} });

const root = new MiniElement('div', doc);
root.focus = () => {};
doc.getElementById = () => null;
router.start(root, {}, 'camera');

test('D-242: a verdict open is a history entry of its own (history.length 2 before, 3 now)', () => {
  assert.equal(hist.length, 2);
  api.openVerdict();
  assert.equal(hist.length, 3, 'opening the verdict added no history entry');
  assert.equal(hist.state?.sheet, true);
});

test('D-242: back with a verdict open closes it and stays on the camera, without leaving the app', () => {
  const before = paints;
  hist.back();
  hist.flush();
  assert.equal(hist.left, false, 'back left the app');
  assert.equal(sheetUp, false, 'the verdict is still up after back');
  assert.equal(router.currentId(), 'camera');
  assert.equal(paints, before, 'back repainted the camera instead of only closing the sheet');
  assert.equal(new URL(hist.entries[hist.index].url).searchParams.get('s'), 'camera');
});

test('D-242: a second sheet in the same stack reuses the one entry, so one back reaches the camera', () => {
  api.openVerdict();
  const len = hist.length;
  api.openVerdict(); // the pad turning into a verdict
  assert.equal(hist.length, len, 'the second sheet pushed a second entry');
  hist.back();
  hist.flush();
  assert.equal(sheetUp, false);
  assert.equal(hist.left, false);
});

test('D-242: closing the sheet by its own button pops the entry, so the next back is not a dead press', () => {
  api.openVerdict();
  const at = hist.index;
  api.done();
  hist.flush();
  assert.equal(hist.index, at - 1, 'the sheet entry was left behind on the history');
  assert.equal(router.sheetOpen(), false);
  // The next back now goes where a back on the bare camera goes: out of the app.
  hist.back();
  hist.flush();
  assert.equal(hist.left, true, 'the next back did nothing');
  hist.left = false;
  hist.index = 1;
});

test('D-242: leaving for another screen from an open sheet replaces its entry, so back from there lands on the camera', () => {
  hist.entries.splice(2);
  hist.index = 1;
  api.openVerdict();
  api.goSaved();
  assert.equal(router.currentId(), 'watchlist');
  assert.equal(hist.length, 3, 'Saved stacked on top of the sheet entry');
  hist.back();
  hist.flush();
  assert.equal(router.currentId(), 'camera');
  assert.equal(hist.left, false);
});

test('D-242: the camera opens and closes the entry from its one state switch', () => {
  const src = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = src.slice(src.indexOf('function setState(next) {'), src.indexOf('function trackScanAbandonedIfMidScan'));
  assert.match(body, /syncSheetHistory\(next, sheetUp\)/, 'setState does not hand the sheet to the router');
  const sync = src.slice(src.indexOf('function syncSheetHistory'), src.indexOf('function setState(next) {'));
  assert.match(sync, /ctx\.sheet\.open\(/);
  assert.match(sync, /reset\(\)/, 'back must close the sheet the way its own close does');
  assert.match(sync, /ctx\.sheet\.close\(\)/);
});
