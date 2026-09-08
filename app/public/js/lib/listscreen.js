/**
 * The two things all three list screens (Saved, Past scans, Recently removed)
 * were getting wrong in the same way, fixed once.
 *
 * Added 2026-09-06, alongside `dom.js`. Deliberately narrow: it knows about a
 * `.page` scroller, a `[data-fk]` focus key and a `.pmodal` overlay, all three
 * of which are conventions of the list screens and nothing else. It is not a
 * rendering framework and must not become one -- the screens still build their
 * own HTML string and still assign `innerHTML`.
 *
 * WHY A FOCUS KEY AND NOT A DIFF. `paint()` on all three screens is
 * `root.innerHTML = ...`, so every store write throws away every node on the
 * screen, including the one the user is standing on. Deleting the fourth row of
 * a nine-row list re-rendered the list, dropped focus to `<body>` and put the
 * scroller back at 0, so a keyboard user deleting three rows had to tab in from
 * the top three times. A diffing engine would fix that and cost a great deal
 * more than the bug does; capturing one string and one number around the
 * teardown fixes it for about forty lines.
 */

/** Everything that can hold focus inside a modal card. Order is DOM order. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A focus key going into `[data-fk="..."]`, which is a quoted CSS string and
 * not an identifier -- so the two characters that need escaping are the quote
 * and the backslash, and `CSS.escape` (which escapes for identifier position)
 * is the wrong tool. Keys are built from store ids, which are UUIDs today but
 * are not guaranteed to stay that way.
 */
function escapeAttr(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Wrap a screen's `paint()` so a repaint keeps the user where they were.
 *
 * Restores, in this order:
 *   1. `.page`'s `scrollTop` -- `.page` is the scroller (shell.css line 81),
 *      not `#screen`, which is `overflow: hidden`.
 *   2. focus, by `[data-fk]`, a key the screen stamps on every control it
 *      wants findable again. `open:<id>`, `del:<id>`: stable across a
 *      re-render because they are built from the row's own id, not its index.
 *   3. when that key is gone -- the row it belonged to was just deleted -- the
 *      control at the same position in the same action family, so deleting
 *      four rows in a row is four presses of the same key rather than four
 *      trips back through the tab order.
 *
 * @param {HTMLElement} root  the screen root
 * @param {() => void} paint  the screen's own full render
 * @param {(root: HTMLElement) => void} [after]  runs after the paint and
 *   before focus is restored: the modal sync below, which has to clear
 *   `inert` off `.page` before anything inside it can take focus.
 */
export function repainter(root, paint, after) {
  /**
   * @param {string} [preferredKey] the focus key to land on regardless of
   *   where focus is now. This is how a dialog returns focus to the row that
   *   opened it: at the moment it closes, focus is on the dialog's own Close
   *   button, which is about to stop existing and never had a key of its own.
   */
  return function repaint(preferredKey) {
    const scroller = root.querySelector('.page');
    const top = scroller ? scroller.scrollTop : 0;

    const active = document.activeElement;
    const held = active && root.contains(active) ? active.closest('[data-fk]') : null;
    const key = preferredKey ?? (held ? held.dataset.fk : null);
    const family = key ? key.slice(0, key.indexOf(':') + 1) : null;
    const siblings = family ? [...root.querySelectorAll(`[data-fk^="${escapeAttr(family)}"]`)] : [];
    const index = held ? siblings.indexOf(held) : -1;

    paint();

    const next = root.querySelector('.page');
    if (next) next.scrollTop = top;
    if (typeof after === 'function') after(root);
    if (!key) return;

    let target = root.querySelector(`[data-fk="${escapeAttr(key)}"]`);
    if (!target && index >= 0) {
      const now = [...root.querySelectorAll(`[data-fk^="${escapeAttr(family)}"]`)];
      target = now[Math.min(index, now.length - 1)] ?? null;
    }
    // `preventScroll` matters: focusing a row the browser thinks is off-screen
    // would scroll it back into view and undo the scrollTop just restored.
    if (target) target.focus({ preventScroll: true });
  };
}

/**
 * Make the reopened-verdict overlay an actual dialog.
 *
 * `.pmodal` was a `div` over the page with a Close button: no role, no
 * `aria-modal`, no escape, no trap, no focus return. To a screen reader it was
 * a second list of things below the first one, still reachable by tab, with the
 * page it covers still fully readable behind it.
 *
 * Called after every paint. `inert` on `.page` is what does the real work --
 * one attribute takes the whole page behind the dialog out of the tab order,
 * out of hit testing and out of the accessibility tree -- and the Tab wrap in
 * `modalKeys` below is the belt to its braces, for the wrap at the last
 * control.
 */
export function syncModal(root) {
  const page = root.querySelector('.page');
  const modal = root.querySelector('.pmodal');

  if (!modal) {
    if (page) page.inert = false;
    return;
  }
  if (page) page.inert = true;

  const card = modal.querySelector('.pmodal-card');
  if (!card) return;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const heading = card.querySelector('h2');
  if (heading) {
    if (!heading.id) heading.id = 'pmodal-title';
    card.setAttribute('aria-labelledby', heading.id);
  }

  // Focus lands inside the dialog on open, and stays where it is on a repaint
  // that happened for some other reason (a store write while it is open).
  if (!card.contains(document.activeElement)) {
    const first = card.querySelector(FOCUSABLE);
    (first ?? card).focus({ preventScroll: true });
  }
}

/**
 * Escape and the Tab wrap, for a screen with a `.pmodal` open.
 *
 * Bound to `document`, not to `root`: after `inert` lands on `.page`, focus can
 * legitimately sit on `<body>` for a frame, and a keydown there never reaches
 * the screen root.
 *
 * @param {HTMLElement} root
 * @param {() => boolean} isOpen  whether the screen believes a modal is open
 * @param {() => void} close      the screen's own close, which repaints
 */
export function modalKeys(root, isOpen, close) {
  return function onKeydown(e) {
    if (!isOpen()) return;
    const card = root.querySelector('.pmodal-card');
    if (!card) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;

    const items = [...card.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      card.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (!card.contains(at)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus({ preventScroll: true });
      return;
    }
    if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    } else if (e.shiftKey && at === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    }
  };
}

/**
 * Did this click land on the backdrop rather than on the dialog?
 *
 * The three screens tested `e.target.dataset.act === 'modal'`, which is true
 * only when the pointer is over the overlay element itself and nothing else --
 * so a click on the padding of a child, or on any future element that spans the
 * backdrop, missed and did nothing. This asks the question that was meant:
 * inside the overlay, outside the card.
 */
export function onBackdrop(e) {
  const modal = e.target.closest?.('.pmodal');
  return Boolean(modal) && !e.target.closest('.pmodal-card');
}
