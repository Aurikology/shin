/**
 * The review prompt (app/public/js/review-prompt.js): the decision, the timing, the web no-op, the event.
 * The platform's own prompt is the only ask (Apple, Google Play and the Competition Bureau are the named
 * costs of anything more), so the tests also pin that nothing here draws a question or a dialog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  shouldAskForReview, winOf, emptyState, readState, writeState, reviewBlocked, requestNativeReview,
  createReviewPrompter, platformOf, localDay, REVIEW_KEY, ASK_DELAY_MS, MIN_DAYS_BETWEEN_ASKS,
} from '../public/js/review-prompt.js';
import { GOOD, GREAT, REASONABLE, BAD, NO_PRICE } from './verdict-fixtures.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 14, 15, 0, 0).getTime();
const WIN = { basis: 'own_prices', zone: 'good' };

/** A record in which every condition holds; each test breaks exactly one. */
function readyState(over = {}) {
  return { ...emptyState(), sessions: 2, wins: 3, winDays: ['2026-11-12', '2026-11-14'], recent: [false, false], ...over };
}
const facts = (over = {}) => ({ state: readyState(), win: WIN, thumbDown: false, corrected: false, version: '2026-11-14.1', now: NOW, ...over });

test('the decision says yes when every condition holds', () => {
  assert.deepEqual(shouldAskForReview(facts()), { ask: true, blockedBy: null });
  assert.equal(shouldAskForReview(facts({ win: { basis: 'own_prices', zone: 'great' } })).ask, true);
});

test('the answer must rest on own_prices', () => {
  for (const basis of ['claude_typical', 'national_average', 'category_prior', 'other_size']) {
    assert.equal(shouldAskForReview(facts({ win: { basis, zone: 'great' } })).blockedBy, 'not_own_prices', basis);
  }
  assert.equal(shouldAskForReview(facts({ win: null })).blockedBy, 'not_own_prices');
});

test('the zone must be great or good', () => {
  for (const zone of ['reasonable', 'bad', null]) {
    assert.equal(shouldAskForReview(facts({ win: { basis: 'own_prices', zone } })).blockedBy, 'zone', String(zone));
  }
});

test('a thumbs-down on that scan stops it', () => {
  assert.equal(shouldAskForReview(facts({ thumbDown: true })).blockedBy, 'thumb_down');
});

test('a correction opened on that scan stops it', () => {
  assert.equal(shouldAskForReview(facts({ corrected: true })).blockedBy, 'corrected');
});

test('it takes a third win', () => {
  assert.equal(shouldAskForReview(facts({ state: readyState({ wins: 2 }) })).blockedBy, 'few_wins');
  assert.equal(shouldAskForReview(facts({ state: readyState({ wins: 0 }) })).blockedBy, 'few_wins');
  assert.equal(shouldAskForReview(facts({ state: readyState({ wins: 4 }) })).ask, true);
});

test('the wins must fall on at least two different local days', () => {
  assert.equal(shouldAskForReview(facts({ state: readyState({ winDays: ['2026-11-14'] }) })).blockedBy, 'one_day');
  assert.equal(shouldAskForReview(facts({ state: readyState({ winDays: ['2026-11-14', '2026-11-14'] }) })).blockedBy, 'one_day');
});

test('never in the first session', () => {
  assert.equal(shouldAskForReview(facts({ state: readyState({ sessions: 1 }) })).blockedBy, 'first_session');
  assert.equal(shouldAskForReview(facts({ state: readyState({ sessions: 0 }) })).blockedBy, 'first_session');
});

test('the last two scans must not be misses', () => {
  for (const recent of [[true, false], [false, true], [true, true], [false], []]) {
    assert.equal(shouldAskForReview(facts({ state: readyState({ recent }) })).blockedBy, 'recent_miss', JSON.stringify(recent));
  }
  // An older miss, before the last two, does not count against it.
  assert.equal(shouldAskForReview(facts({ state: readyState({ recent: [false, false] }) })).ask, true);
});

test('never twice for one app version', () => {
  assert.equal(shouldAskForReview(facts({ state: readyState({ askedVersions: ['2026-11-14.1'] }) })).blockedBy, 'asked_this_version');
  assert.equal(shouldAskForReview(facts({ state: readyState({ askedVersions: ['2026-09-19.1'], lastAskedAt: NOW - 200 * DAY }) })).ask, true);
});

test('at least 120 days between asks', () => {
  assert.equal(shouldAskForReview(facts({ state: readyState({ lastAskedAt: NOW - (MIN_DAYS_BETWEEN_ASKS - 1) * DAY }) })).blockedBy, 'too_soon');
  assert.equal(shouldAskForReview(facts({ state: readyState({ lastAskedAt: NOW - MIN_DAYS_BETWEEN_ASKS * DAY }) })).ask, true);
});

test('winOf reads the verdict the way the sheet draws it', () => {
  assert.deepEqual(winOf(GOOD), { basis: 'own_prices', zone: 'good' });
  assert.deepEqual(winOf(GREAT), { basis: 'own_prices', zone: 'great' });
  assert.equal(winOf(REASONABLE), null);
  assert.equal(winOf(BAD), null);
  assert.equal(winOf(NO_PRICE), null);
  assert.equal(winOf({ ...GOOD, basis: 'claude_typical' }), null);
  assert.equal(winOf(null), null);
  // A price typed on the sheet decides the zone, as on the sheet.
  assert.deepEqual(winOf(NO_PRICE, 399), { basis: 'own_prices', zone: 'great' });
  assert.equal(winOf(NO_PRICE, 749), null);
});

test('the record survives a round trip, and garbage reads as empty', () => {
  const store = new Map();
  const read = (k, f) => (store.has(k) ? store.get(k) : f);
  const write = (k, v) => { store.set(k, v); return true; };
  assert.deepEqual(readState(read), emptyState());
  const s = readyState({ askedVersions: ['a'], lastAskedAt: 5 });
  writeState(s, write);
  assert.deepEqual(readState(read), s);
  store.set(REVIEW_KEY, '{not json');
  assert.deepEqual(readState(read), emptyState());
  store.set(REVIEW_KEY, JSON.stringify({ wins: 'lots', recent: [1, 'x', true], winDays: 7 }));
  assert.deepEqual(readState(read), { ...emptyState(), recent: [true] });
});

test('local days are the shopper\'s own', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(localDay(new Date(2026, 0, 6, 0, 1).getTime()), '2026-01-06');
});

/* ------------------------------------------------------------------ timing */

function nativeWin(platform = 'ios') {
  const calls = [];
  return {
    calls,
    Capacitor: {
      getPlatform: () => platform,
      isPluginAvailable: (n) => n === 'InAppReview',
      Plugins: { InAppReview: { requestReview: () => { calls.push('requestReview'); return Promise.resolve(); } } },
    },
  };
}

function rig({ win = nativeWin(), blocked = () => false, state = readyState() } = {}) {
  const store = new Map([[REVIEW_KEY, JSON.stringify(state)]]);
  const timers = [];
  const events = [];
  const prompter = createReviewPrompter({
    win,
    now: () => NOW,
    track: (type, payload) => events.push({ type, payload }),
    version: '2026-11-14.1',
    isBlocked: () => blocked(),
    read: (k, f) => (store.has(k) ? store.get(k) : f),
    write: (k, v) => { store.set(k, v); return true; },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  const saved = () => readState((k, f) => (store.has(k) ? store.get(k) : f));
  return { prompter, timers, events, win, saved };
}

// The record before this win is counted: two wins on two days, so the answer being closed is the third.
const closing = { verdict: GOOD, typedCents: null, thumbDown: false, corrected: false };
const twoWins = readyState({ wins: 2 });

test('the ask goes out one second after the sheet closes, not before', () => {
  const r = rig({ state: twoWins });
  const decision = r.prompter.answerClosed(closing);
  assert.equal(decision.ask, true);
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, ASK_DELAY_MS);
  assert.equal(ASK_DELAY_MS, 1000);
  assert.deepEqual(r.win.calls, [], 'nothing is asked while the second runs');
  r.timers[0].fn();
  assert.deepEqual(r.win.calls, ['requestReview']);
});

test('the closing answer is counted as the third win', () => {
  const r = rig({ state: twoWins });
  r.prompter.answerClosed(closing);
  assert.equal(r.saved().wins, 3);
});

for (const [name, blocked] of [
  ['a sheet is open', { sheetOpen: true }],
  ['the price pad is open', { padOpen: true }],
  ['a field has the keyboard', { typing: true }],
  ['the camera is mid-scan', { state: 'reading' }],
  ['the pad state is up', { state: 'asking' }],
  ['the app is in the background', { hidden: true }],
  ['the screen is gone', { dead: true }],
]) {
  test(`when the second is up and ${name}, it does not ask and does not use up the ask`, () => {
    assert.equal(reviewBlocked(blocked), true);
    const r = rig({ state: twoWins, blocked: () => reviewBlocked(blocked) });
    r.prompter.answerClosed(closing);
    r.timers[0].fn();
    assert.deepEqual(r.win.calls, []);
    assert.deepEqual(r.events, []);
    assert.deepEqual(r.saved().askedVersions, []);
    assert.equal(r.saved().lastAskedAt, null);
  });
}

test('a camera at rest is not blocked', () => {
  assert.equal(reviewBlocked({}), false);
  assert.equal(reviewBlocked({ state: 'idle' }), false);
});

test('asking records the version and the day, and logs one review_asked with no personal data', () => {
  const r = rig({ state: twoWins });
  r.prompter.answerClosed(closing);
  r.timers[0].fn();
  assert.deepEqual(r.events, [{ type: 'review_asked', payload: { platform: 'ios', appVersion: '2026-11-14.1' } }]);
  assert.deepEqual(r.saved().askedVersions, ['2026-11-14.1']);
  assert.equal(r.saved().lastAskedAt, NOW);
  // The next win in this version asks for nothing.
  const again = r.prompter.answerClosed(closing);
  assert.equal(again.blockedBy, 'asked_this_version');
});

test('Android asks through the same plugin and says so in the event', () => {
  const r = rig({ win: nativeWin('android'), state: twoWins });
  r.prompter.answerClosed(closing);
  r.timers[0].fn();
  assert.deepEqual(r.win.calls, ['requestReview']);
  assert.equal(r.events[0].payload.platform, 'android');
});

test('a thumbs-down or a correction on the scan is not counted and not asked', () => {
  for (const over of [{ thumbDown: true }, { corrected: true }]) {
    const r = rig({ state: twoWins });
    const decision = r.prompter.answerClosed({ ...closing, ...over });
    assert.equal(decision.ask, false);
    assert.equal(r.timers.length, 0);
    assert.equal(r.saved().wins, 2);
  }
});

test('an answer that is not a win asks for nothing and counts nothing', () => {
  const r = rig({ state: twoWins });
  const decision = r.prompter.answerClosed({ ...closing, verdict: BAD });
  assert.equal(decision.ask, false);
  assert.equal(r.saved().wins, 2);
});

test('the record counts sessions once per page load and keeps the last two scan outcomes', () => {
  const r = rig({ state: emptyState() });
  r.prompter.noteSession();
  r.prompter.noteSession();
  assert.equal(r.saved().sessions, 1);
  r.prompter.noteScan(true);
  r.prompter.noteScan(false);
  r.prompter.noteScan(false);
  assert.deepEqual(r.saved().recent, [false, false]);
  r.prompter.noteScan(true);
  assert.deepEqual(r.saved().recent, [false, true]);
});

test('a bridge that rejects is reported loudly and does not crash', async () => {
  const win = nativeWin();
  win.Capacitor.Plugins.InAppReview.requestReview = () => Promise.reject(new Error('no activity'));
  const r = rig({ win, state: twoWins });
  const realError = console.error;
  const said = [];
  console.error = (...args) => said.push(args);
  try {
    r.prompter.answerClosed(closing);
    r.timers[0].fn();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  } finally {
    console.error = realError;
  }
  assert.equal(said.length, 1, 'the fault is said on the console');
  assert.deepEqual(r.events.map((e) => e.type), ['review_asked', 'review_fault']);
});

/* ------------------------------------------------------------------ the web */

test('in a browser the call is a no-op: nothing asked, nothing recorded, nothing logged', () => {
  assert.equal(platformOf({}), 'web');
  assert.equal(platformOf({ Capacitor: { getPlatform: () => 'web' } }), 'web');
  assert.equal(requestNativeReview({}), 'web');
  assert.equal(requestNativeReview({ Capacitor: { getPlatform: () => 'web' } }), 'web');
  const web = { Capacitor: { getPlatform: () => 'web' } };
  const r = rig({ win: web, state: twoWins });
  const decision = r.prompter.answerClosed(closing);
  assert.deepEqual(decision, { ask: false, blockedBy: 'web' });
  assert.equal(r.timers.length, 0);
  assert.deepEqual(r.events, []);
  assert.equal(r.saved().wins, 2);
});

test('a wrapper built without the plugin asks for nothing and does not use up the ask', () => {
  const win = { Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => false } };
  assert.equal(requestNativeReview(win), 'unavailable');
  const r = rig({ win, state: twoWins });
  r.prompter.answerClosed(closing);
  r.timers[0].fn();
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.saved().askedVersions, []);
});

/* -------------------------------------------------- the platform's prompt only */

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('nothing draws a Pexi question or dialog about rating', () => {
  // Code only: the header comment names the forbidden things in order to forbid them.
  const mod = src('../public/js/review-prompt.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(mod, /innerHTML|createElement|confirm\(|alert\(|\.showModal/, 'the review module draws nothing');
  assert.doesNotMatch(mod, /do you like|enjoying pexi|rate us/i);
});

/* --------------------------------------------------------- the camera wiring */

test('the camera hands every closed answer sheet to the prompter, and only counts final outcomes', () => {
  const cam = src('../public/js/screens/camera.js');
  assert.match(cam, /import \{[^}]*createReviewPrompter[^}]*reviewBlocked[^}]*\} from '\.\.\/review-prompt\.js'/);
  assert.match(cam, /reviewPrompter\.noteSession\(\)/);
  // The close is read at the top of reset(), before the answer's own state is cleared.
  const reset = cam.slice(cam.indexOf('    function reset() {'));
  assert.ok(reset.indexOf('reviewNoteClose()') > -1 && reset.indexOf('reviewNoteClose()') < reset.indexOf('lastScanId = null'), 'reset() reads the closed sheet before clearing it');
  assert.match(cam, /reviewPrompter\.answerClosed\(\{[^}]*thumbDown[^}]*corrected/s);
  assert.match(cam, /reviewPrompter\.noteScan\(false\)/);
  assert.match(cam, /reviewPrompter\.noteScan\(true\)/);
  assert.match(cam, /reviewPrompter\.cancel\(\)/, 'a pending ask is dropped when the screen goes');
  assert.match(cam, /isBlocked: \(\) => reviewBlocked\(/);
});
