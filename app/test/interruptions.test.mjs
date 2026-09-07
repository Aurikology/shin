/**
 * The interruption budget, tested against the contract that states it.
 *
 * docs/design/AVATAR.md section 3: an appearance is REACTIVE if it lands
 * within two seconds of the user's own act on the same surface, and reactive
 * appearances are unbudgeted, "because capping an answer to a question the
 * user just asked would make the product worse at the only thing it does".
 * What is budgeted is UNPROMPTED: two per session, four per day, and zero
 * notifications in v1. The file adds that "no third source may be added
 * without a row in this table".
 *
 * Before 2026-09-07 none of that was enforced. It was satisfied by accident:
 * the two unprompted sources each carried a one-shot boolean inside the camera
 * screen, so a session could not exceed two because there were only two flags
 * to trip. Nothing counted a day, and a third source would have broken the
 * contract silently. These tests are what make the numbers real.
 *
 * The store reads and writes localStorage, which does not exist in node, so it
 * is stubbed here. That is honest rather than convenient: the persisted half of
 * the budget is exactly the half a stub can get wrong, so the day cap is tested
 * by writing timestamps into the stub and reading the behaviour back out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'shin.store';
let backing = {};
globalThis.localStorage = {
  getItem: (k) => (k in backing ? backing[k] : null),
  setItem: (k, v) => { backing[k] = String(v); },
  removeItem: (k) => { delete backing[k]; },
};

const store = await import('../public/js/store.js');

function reset() {
  backing = {};
  store.reset();
}

test('a fresh session may interrupt, and the budget says how often', () => {
  reset();
  assert.equal(store.canInterrupt(), true);
  const left = store.interruptionBudget();
  assert.equal(left.session, 2, 'AVATAR.md section 3: two unprompted per session');
  assert.equal(left.day, 4, 'AVATAR.md section 3: four unprompted per day');
});

test('the session cap stops the third unprompted line', () => {
  reset();
  store.recordInterruption();
  assert.equal(store.canInterrupt(), true, 'one spent, one left');
  store.recordInterruption();
  assert.equal(store.canInterrupt(), false, 'both spent');
  assert.equal(store.interruptionBudget().session, 0);
});

test('the day cap survives a reload, which the session cap does not', () => {
  reset();
  // Four unprompted lines already spent today, from earlier sessions. The
  // session counter is zero because this is a new session; the day counter is
  // not, because it is the half that persists.
  const now = Date.now();
  store.update((s) => ({
    ...s,
    interruptions: [1, 2, 3, 4].map((h) => new Date(now - h * 60 * 60 * 1000).toISOString()),
  }));
  assert.equal(store.interruptionBudget().session, 2, 'a reload is a new session');
  assert.equal(store.interruptionBudget().day, 0, 'but the day is still spent');
  assert.equal(store.canInterrupt(), false, 'the tighter of the two caps wins');
});

test('yesterday does not count against today', () => {
  reset();
  const old = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  store.update((s) => ({ ...s, interruptions: [old, old, old, old, old] }));
  assert.equal(store.canInterrupt(), true, 'a 26 hour old interruption is not today');
  assert.equal(store.interruptionBudget().day, 4);
});

test('the record is pruned rather than grown, so it cannot become a log', () => {
  reset();
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  store.update((s) => ({ ...s, interruptions: [old, old, old] }));
  store.recordInterruption();
  const kept = store.get().interruptions;
  assert.equal(kept.length, 1, `three stale entries should not survive a write, got ${kept.length}`);
});
