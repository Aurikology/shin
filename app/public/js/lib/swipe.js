/**
 * Swipe left on a row to reveal its one action (UX evidence R-93).
 *
 * The swipe is the shortcut, never the only way: every row this is attached to also draws the action
 * as a visible labelled button (the row's own Remove, and the same Remove in the item's detail view),
 * so nobody has to find a gesture nothing on the screen announces.
 *
 * How it works. A horizontal drag of at least SWIPE_MIN_PX to the left puts `.swiped` on the row's
 * wrapper (css/screens/ux-sweep.css slides the row aside and shows the button behind it); a drag to
 * the right, or a swipe on another row, puts it away. A mostly vertical drag is the page scrolling and
 * is left alone. The click that ends a swipe is swallowed once, so finishing a swipe never also opens
 * the row.
 *
 * Fails loudly (RULINGS.md "Errors never go unnoticed"): attaching to nothing, or with no selector
 * naming the rows, throws and says which, instead of installing a handler that can never fire.
 */
export const SWIPE_MIN_PX = 40;
export const SWIPE_ROW_SELECTOR_ERROR = 'attachSwipe: rowSelector is required, naming the wrapper of one row';

/**
 * @param {Element} root where the rows live (listeners are delegated to it)
 * @param {{ rowSelector: string, signal?: AbortSignal }} opts
 */
export function attachSwipe(root, { rowSelector, signal } = {}) {
  if (!root || typeof root.addEventListener !== 'function') throw new TypeError('attachSwipe: there is no element to attach the swipe to');
  if (typeof rowSelector !== 'string' || rowSelector === '') throw new TypeError(SWIPE_ROW_SELECTOR_ERROR);

  let start = null;
  let swallowClick = false;

  const closeOthers = (except) => {
    for (const el of root.querySelectorAll?.(`${rowSelector}.swiped`) ?? []) if (el !== except) el.classList.remove('swiped');
  };

  root.addEventListener('pointerdown', (e) => {
    const row = e.target?.closest?.(rowSelector);
    // A press on the revealed button itself is a tap on Remove, not the start of a swipe.
    if (!row || e.target.closest('[data-unwatch]')) { start = null; return; }
    start = { row, x: e.clientX, y: e.clientY };
  }, { signal });

  root.addEventListener('pointerup', (e) => {
    if (!start) return;
    const { row, x, y } = start;
    start = null;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return; // a tap, or the page scrolling
    /* The click that may follow the drag is swallowed once. Many browsers send none after a long drag,
       so the flag also lapses on its own, or it would eat the next real tap. */
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 400);
    if (dx < 0) { closeOthers(row); row.classList.add('swiped'); } else row.classList.remove('swiped');
  }, { signal });

  root.addEventListener('pointercancel', () => { start = null; }, { signal });

  root.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, signal });
}
