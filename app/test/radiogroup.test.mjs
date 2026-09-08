/**
 * The radio group's index maths.
 *
 * `lib/radiogroup.js` is deliberately split so that everything with arithmetic
 * in it is a pure function of (key, current, count) and everything else is
 * three lines of listener. That split exists for this file: the wrapping and
 * the tabindex invariant are the parts that are easy to get subtly wrong and
 * impossible to notice by looking, and they are testable under plain
 * `node --test` with no DOM, no jsdom and no new dependency.
 *
 * What is NOT tested here, and is therefore in the lane report as verified by
 * hand in a browser: that focus actually moves, that `.click()` reaches the
 * screens' delegated handlers, and that `aria-checked` has settled by the time
 * the microtask reads it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { indexFor, tabindexes, checkedIndex } from '../public/js/lib/radiogroup.js';

const N = 3; // every group in this app is three options, and has been from the start

test('right and down are the same key, and they wrap off the end', () => {
  assert.equal(indexFor('ArrowRight', 0, N), 1);
  assert.equal(indexFor('ArrowRight', 1, N), 2);
  assert.equal(indexFor('ArrowRight', 2, N), 0);

  assert.equal(indexFor('ArrowDown', 0, N), 1);
  assert.equal(indexFor('ArrowDown', 2, N), 0);
});

test('left and up are the same key, and they wrap off the front', () => {
  assert.equal(indexFor('ArrowLeft', 2, N), 1);
  assert.equal(indexFor('ArrowLeft', 1, N), 0);
  assert.equal(indexFor('ArrowLeft', 0, N), 2);

  assert.equal(indexFor('ArrowUp', 0, N), 2);
  assert.equal(indexFor('ArrowUp', 1, N), 0);
});

test('Home and End do not depend on where you are', () => {
  for (let at = 0; at < N; at += 1) {
    assert.equal(indexFor('Home', at, N), 0);
    assert.equal(indexFor('End', at, N), N - 1);
  }
});

test('a key the group does not claim moves nothing', () => {
  // Space and Enter are in this list on purpose. The buttons are real
  // `<button>`s, so the browser fires a click for both already; if this helper
  // ever starts answering for them the group selects twice per press.
  for (const key of [' ', 'Enter', 'Tab', 'Escape', 'a', 'PageDown', '']) {
    assert.equal(indexFor(key, 0, N), null, `${JSON.stringify(key)} should not move`);
  }
});

test('an empty or nonsense group returns null rather than NaN', () => {
  // The listener guards on this instead of guarding itself, so a group that
  // rendered nothing must not produce an index at all.
  assert.equal(indexFor('ArrowRight', 0, 0), null);
  assert.equal(indexFor('ArrowRight', 0, -1), null);
  assert.equal(indexFor('ArrowRight', 0, 2.5), null);
  assert.equal(indexFor('ArrowRight', 0, undefined), null);
});

test('an out-of-range current is treated as the first option', () => {
  // Reachable: the current index is read off the DOM, and a group repainted
  // mid-press can be a different length than it was.
  assert.equal(indexFor('ArrowRight', 99, N), 1);
  assert.equal(indexFor('ArrowRight', -4, N), 1);
  assert.equal(indexFor('ArrowLeft', 99, N), 2);
});

test('exactly one option is ever the tab stop', () => {
  for (let count = 1; count <= 6; count += 1) {
    // Every in-range selection, plus the out-of-range and nothing-checked
    // cases, because "no option is focusable" is the failure this whole file
    // exists to prevent and it is the one a stray -1 would produce.
    for (const selected of [-1, 0, 1, 2, 5, 99, null, undefined]) {
      const row = tabindexes(count, selected);
      assert.equal(row.length, count);
      assert.equal(
        row.filter((t) => t === 0).length,
        1,
        `count=${count} selected=${selected} produced ${JSON.stringify(row)}`,
      );
      assert.ok(row.every((t) => t === 0 || t === -1));
    }
  }
});

test('the tab stop is on the checked option when there is one', () => {
  assert.deepEqual(tabindexes(3, 0), [0, -1, -1]);
  assert.deepEqual(tabindexes(3, 1), [-1, 0, -1]);
  assert.deepEqual(tabindexes(3, 2), [-1, -1, 0]);
});

test('with nothing checked the first option takes the stop', () => {
  // checkedIndex returns -1 for a group where no option carries
  // aria-checked="true", and that -1 is fed straight to tabindexes.
  assert.deepEqual(tabindexes(3, checkedIndex([])), [0, -1, -1]);
  assert.deepEqual(tabindexes(3, -1), [0, -1, -1]);
});

test('an empty group produces no tab stops at all', () => {
  assert.deepEqual(tabindexes(0, 0), []);
  assert.deepEqual(tabindexes(-1, 0), []);
});

test('checkedIndex reads aria-checked as a string, not as truthiness', () => {
  // Deliberately duck-typed so this stays DOM-free. The trap being guarded is
  // aria-checked="false", which is a non-empty string and therefore truthy.
  const opt = (checked) => ({ getAttribute: () => checked });
  assert.equal(checkedIndex([opt('false'), opt('true'), opt('false')]), 1);
  assert.equal(checkedIndex([opt('false'), opt('false')]), -1);
  assert.equal(checkedIndex([opt(null), opt(null)]), -1);
  assert.equal(checkedIndex([opt('true'), opt('true')]), 0, 'first wins if the DOM is inconsistent');
});
