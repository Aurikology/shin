/**
 * The keyboard behaviour three groups already promised and none of them had.
 *
 * `setup.js`, `you.js` and `market.js` each wrote `role="radiogroup"` around
 * children carrying `role="radio"` and `aria-checked`, and then handled clicks
 * and nothing else. That combination is worse than plain buttons: the ARIA
 * tells a screen reader "this is a radio group, arrow between the options", and
 * arrowing does nothing, while Tab -- which in a real radio group visits the
 * group once -- stops on all three options in a row. The markup was making a
 * promise the code did not keep.
 *
 * `grep -rn "keydown" public/js/` returned zero hits repo-wide before this file,
 * so there was no house pattern to follow. This is the pattern: WAI-ARIA APG
 * "Radio Group", the roving-tabindex variant.
 *
 *   Tab            enters the group once, landing on the checked option
 *   Left / Up      previous, wrapping
 *   Right / Down   next, wrapping
 *   Home / End     first / last
 *   Space / Enter  select the focused option
 *
 * Selection follows focus, which is the APG default for a radio group and is
 * the right call here: all three of these groups are cheap, reversible and
 * instantly visible (a face morphs, a market row lights), so there is nothing
 * to protect a user from by making them confirm.
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES NOT DO.
 *
 * It does not own selection state. The options are `<button>`s, so Space and
 * Enter already fire a native `click`, and every one of the three screens
 * already has a delegated click handler that knows how to select. Arrow keys
 * therefore move focus and then call `.click()`, so keyboard and pointer walk
 * the exact same code path and there is no second implementation of "what
 * happens when you pick warm" to keep in step.
 *
 * It does not read a JS variable to decide who is checked. It reads
 * `aria-checked` off the DOM, after the screen's own handler has run (hence the
 * `queueMicrotask` -- the screens listen on `#screen`, an ancestor, so their
 * handler runs after this one in the same dispatch). The consequence is that
 * the accessible state and the roving tabindex cannot drift apart, because one
 * is computed from the other.
 */

import { on } from './dom.js';

/** The keys this helper claims. Space and Enter are not here: see above. */
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End']);

/**
 * Where a key press moves to, given where it is now. Pure, and the only thing
 * in this file with any arithmetic in it, which is why it is exported and
 * tested (`app/test/radiogroup.test.mjs`) rather than buried in the listener.
 *
 * Returns `null` for a key that does not move, and for a group of zero, so a
 * caller never has to guard the empty case itself.
 *
 * Wrapping in both directions is not a flourish. A three-option group where
 * Right on the last option does nothing reads as broken, and these groups are
 * three options, always.
 */
export function indexFor(key, current, count) {
  if (!Number.isInteger(count) || count <= 0) return null;
  const at = Number.isInteger(current) && current >= 0 && current < count ? current : 0;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return (at - 1 + count) % count;
    case 'ArrowRight':
    case 'ArrowDown':
      return (at + 1) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The tabindex row for a group of `count` with `selected` checked.
 *
 * Exactly one 0 and the rest -1, always, including when `selected` is out of
 * range or nothing is checked yet -- in which case the first option takes the
 * stop, because a group that no key can enter is the failure mode this whole
 * file exists to prevent. Pure, and tested for that invariant directly.
 */
export function tabindexes(count, selected) {
  if (!Number.isInteger(count) || count <= 0) return [];
  const at = Number.isInteger(selected) && selected >= 0 && selected < count ? selected : 0;
  return Array.from({ length: count }, (_, i) => (i === at ? 0 : -1));
}

/** Index of the option carrying `aria-checked="true"`, or -1 if none does. */
export function checkedIndex(items) {
  return items.findIndex((el) => el.getAttribute('aria-checked') === 'true');
}

/**
 * Wire one `role="radiogroup"` element. Returns a `sync()` the caller can call
 * itself after repainting the group's contents from outside a click.
 *
 * `signal` is the screen's `AbortController` signal, so the listeners come off
 * when the screen does. Both listeners are on the group element rather than on
 * each option: three options today, and a delegated listener does not have to
 * be re-attached when a screen re-renders its own rows.
 */
export function wireRadioGroup(group, { signal, itemSelector = '[role="radio"]' } = {}) {
  if (!group) return () => {};

  const options = () => Array.from(group.querySelectorAll(itemSelector));

  function sync() {
    const items = options();
    const row = tabindexes(items.length, checkedIndex(items));
    items.forEach((el, i) => el.setAttribute('tabindex', String(row[i])));
  }

  sync();

  on(group, 'keydown', (e) => {
    if (!MOVE_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const items = options();
    const from = items.indexOf(e.target.closest(itemSelector));
    if (from === -1) return;
    const to = indexFor(e.key, from, items.length);
    if (to === null) return;
    // Arrow keys scroll the page and Home/End jump it. Inside a radio group
    // they belong to the group.
    e.preventDefault();
    items[to].focus();
    // Selection follows focus, through the screen's own click handler rather
    // than around it.
    items[to].click();
  }, signal);

  // Any selection -- keyboard, pointer, or a screen calling `.click()` itself
  // -- moves the tab stop. Deferred by a microtask because the screens' own
  // handlers are attached to an ancestor and so run later in this same
  // dispatch; reading `aria-checked` now would read the value they are about
  // to replace.
  on(group, 'click', () => queueMicrotask(sync), signal);

  return sync;
}
