/**
 * R13 and R14: the app asks the server, at start, for the oldest build it supports and a list of
 * features to switch off (GET /api/app-status, app/src/app-status.ts).
 *
 * The rules this holds, each seen to fail first:
 *   - a build below the minimum gets the plain "Please update Pexi" screen, and the screen is the
 *     only thing it can reach;
 *   - a missing, failed, slow, malformed or HTML answer never blocks anything (a check that cannot
 *     be made must not lock a shopper out);
 *   - a feature the server names is hidden (its entry points and its route), and a feature name the
 *     app does not know is ignored;
 *   - the update gate needs a fresh answer: a cached "block" is never replayed offline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const remote = await import('../public/js/remote-status.js');
const router = await import('../public/js/router.js');
const { FLAGS } = await import('../public/js/flags.js');
const { APP_VERSION } = await import('../public/js/version.js');

const fresh = () => ({ flags: { centsFirstPad: true, feed: false, photoId: false }, doc: makeDocument() });
const answer = (body, { ok = true, status = 200, type = 'application/json' } = {}) => async () => ({
  ok,
  status,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
  json: async () => {
    if (typeof body === 'string') throw new SyntaxError('Unexpected token <');
    return body;
  },
});

test('versions compare as numbers, per part', () => {
  const below = remote.versionBelow;
  assert.equal(below('2026-09-19.1', '2026-11-18.1'), true);
  assert.equal(below('2026-11-18.1', '2026-11-18.1'), false, 'equal is supported');
  assert.equal(below('2026-11-18.2', '2026-11-18.1'), false);
  assert.equal(below('2026-11-18.9', '2026-11-18.10'), true, '9 is below 10, not above it as text');
  assert.equal(below('2027-01-02.1', '2026-12-31.9'), false);
});

test('anything that does not parse is never "below": unknown is not a reason to block', () => {
  for (const [v, min] of [['', '2026-11-18.1'], [undefined, '2026-11-18.1'], ['2026-11-18.1', null], ['2026-11-18.1', 'x'], ['dev', '2026-11-18.1']]) {
    assert.equal(remote.versionBelow(v, min), false, `${v} vs ${min}`);
  }
});

test('a status that is not the right shape is read as "nothing to say"', () => {
  for (const junk of [null, undefined, 5, 'x', [], { minVersion: 5, featuresOff: 'watchlist' }]) {
    assert.deepEqual(remote.normaliseStatus(junk), { minVersion: null, featuresOff: [] }, JSON.stringify(junk));
  }
  assert.deepEqual(remote.normaliseStatus({ minVersion: '2026-11-18.1', featuresOff: ['share', 7, 'Watchlist'] }), {
    minVersion: '2026-11-18.1',
    featuresOff: ['share', 'watchlist'],
  });
});

test('below the minimum: the update screen goes up, the app behind it cannot be reached', () => {
  const { flags, doc: d } = fresh();
  const screenRoot = d.createElement('main');
  screenRoot.setAttribute('id', 'screen');
  d.body.appendChild(screenRoot);
  d.getElementById = (id) => (id === 'screen' ? screenRoot : null);
  const out = remote.applyStatus({ minVersion: '2099-01-01.1', featuresOff: [] }, { flags, doc: d, version: '2026-09-19.1' });
  assert.equal(out.updateRequired, true);
  const gate = d.body.childNodes.find((n) => n.getAttribute?.('data-update-gate') !== null && n.hasAttribute?.('data-update-gate'));
  assert.ok(gate, 'no update screen was added');
  assert.match(gate.innerHTML, /Please update Pexi/);
  assert.match(gate.innerHTML, /apps\.apple\.com\/app\/id6821190920/, 'the App Store link is on the screen');
  assert.equal(gate.getAttribute('role'), 'alertdialog');
  assert.equal(screenRoot.hasAttribute('inert'), true, 'VoiceOver and taps must not reach the screen behind');
});

test('at or above the minimum: no screen, nothing changes', () => {
  const { flags, doc: d } = fresh();
  const out = remote.applyStatus({ minVersion: '2026-09-19.1', featuresOff: [] }, { flags, doc: d, version: '2026-09-19.1' });
  assert.equal(out.updateRequired, false);
  assert.equal(d.body.childNodes.length, 0);
});

test('a feature the server switches off is hidden: its route is refused and its buttons are hidden', () => {
  const { flags, doc: d } = fresh();
  const head = d.createElement('head');
  d.head = head;
  remote.applyStatus({ minVersion: null, featuresOff: ['watchlist', 'centsfirstpad', 'nonsense'] }, { flags, doc: d, version: APP_VERSION });
  assert.equal(router.screenAllowed('watchlist'), false, 'the watchlist screen is still routable');
  assert.equal(router.screenAllowed('savings'), true, 'a feature that was not named must stay on');
  assert.equal(flags.centsFirstPad, false, 'a flag-backed feature must be switched off in the flags');
  assert.equal(remote.featureOff('watchlist'), true);
  assert.equal(remote.featureOff('nonsense'), false, 'an unknown name is ignored, not stored');
  const style = head.childNodes.find((n) => n.tagName === 'style');
  assert.ok(style, 'no style was added to hide the buttons');
  assert.match(style.textContent, /\[data-act="watchlist"\]/);
  assert.match(style.textContent, /display:\s*none/);
  assert.doesNotMatch(style.textContent, /nonsense/);
  // Clean up the module-level state for the tests that follow.
  remote.applyStatus({ minVersion: null, featuresOff: [] }, { flags, doc: d, version: APP_VERSION });
  assert.equal(router.screenAllowed('watchlist'), true, 'a later status with an empty list must switch the feature back on');
});

test('a failed, refused, slow or HTML answer is "no answer", and an answer is read when there is one', async () => {
  const ask = (fetchFn, extra = {}) => remote.fetchAppStatus({ fetchFn, base: 'https://x.test', timeoutMs: 30, ...extra });
  assert.equal(await ask(async () => { throw new TypeError('Failed to fetch'); }), null);
  assert.equal(await ask(answer({}, { ok: false, status: 503 })), null);
  assert.equal(await ask(answer('<html>challenge</html>', { type: 'text/html' })), null);
  assert.equal(await ask(() => new Promise(() => {})), null, 'a hung request must give up, not hold the start-up');
  assert.deepEqual(await ask(answer({ minVersion: '2026-11-18.1', featuresOff: ['share'] })), {
    minVersion: '2026-11-18.1',
    featuresOff: ['share'],
  });
});

test('start-up: a failed check never blocks and never throws', async () => {
  const { flags, doc: d } = fresh();
  const out = await remote.startRemoteStatus({
    fetchFn: async () => { throw new TypeError('offline'); },
    base: '', storage: makeStorage(), doc: d, flags, version: '2026-09-19.1', timeoutMs: 30,
  });
  assert.equal(out.updateRequired, false);
  assert.equal(d.body.childNodes.length, 0);
});

test('start-up: a good answer is applied and kept; the kept copy re-applies features offline but never the block', async () => {
  const store = makeStorage();
  const first = fresh();
  await remote.startRemoteStatus({
    fetchFn: answer({ minVersion: '2099-01-01.1', featuresOff: ['share'] }),
    base: '', storage: store, doc: first.doc, flags: first.flags, version: '2026-09-19.1', timeoutMs: 30,
  });
  assert.equal(router.screenAllowed('share'), false);
  assert.equal(first.doc.body.childNodes.length > 0, true, 'the update screen was not shown on a fresh "yes"');
  // Next launch, offline: the switch-off list comes from the kept copy, the update gate does not.
  remote.applyStatus({ minVersion: null, featuresOff: [] }, { flags: first.flags, doc: first.doc, version: APP_VERSION });
  const second = fresh();
  const out = await remote.startRemoteStatus({
    fetchFn: async () => { throw new TypeError('offline'); },
    base: '', storage: store, doc: second.doc, flags: second.flags, version: '2026-09-19.1', timeoutMs: 30,
  });
  assert.equal(router.screenAllowed('share'), false, 'the kept switch-off list was not re-applied');
  assert.equal(out.updateRequired, false, 'a kept block was replayed with no fresh answer');
  assert.equal(second.doc.body.childNodes.length, 0);
  remote.applyStatus({ minVersion: null, featuresOff: [] }, { flags: second.flags, doc: second.doc, version: APP_VERSION });
});

test('the flags file is untouched by a status with nothing to say', () => {
  const before = JSON.stringify(FLAGS);
  remote.applyStatus({ minVersion: null, featuresOff: [] }, { flags: FLAGS, doc: makeDocument(), version: APP_VERSION });
  assert.equal(JSON.stringify(FLAGS), before);
});
