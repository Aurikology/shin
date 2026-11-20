/**
 * The app fits above the phone's keyboard (Aurik, 2026-11-20: "when they click the keyboard it
 * crowds the app make it so the screen adjusted to the screens keyboards").
 *
 * On an iPhone the keyboard does not shrink the page. It slides over it, and WebKit then pans the
 * whole app up to bring the field into view: the top of the screen (the sheet's heading, the back
 * button) goes off the top and the bottom stays under the keys. `dvh` does not move either.
 *
 * What does move is the visual viewport: its height is the space left above the keyboard. So:
 *   - its height goes into --app-h and <html> gets data-keyboard="open";
 *   - shell.css sizes `.device` to --app-h while open, and the sheets (sized in % of it) and
 *     the pages (absolute, inset 0) follow on their own;
 *   - the pan WebKit made is put back (scrollTo 0,0), since the app now fits;
 *   - the field being typed in is kept in view inside its own scroller.
 * The Android app resizes its web view for the keyboard on its own, so there the keyboard reads
 * as 0 here and nothing extra happens; Chrome in a browser shrinks the visual viewport the same
 * way iOS does and is handled the same way. (`interactive-widget` in the viewport tag was tried
 * and dropped: WebKit logs it as an error on every load.)
 *
 * A browser with no visualViewport does nothing and throws nothing.
 */

/** Below this, a shrink is a browser bar or the suggestion strip, not a keyboard. */
export const KEYBOARD_MIN_PX = 120;

/** How much of the layout the keyboard covers, in px; never below 0. Pure. */
export function keyboardHeight({ layoutHeight, viewportHeight }) {
  const lost = Number(layoutHeight) - Number(viewportHeight);
  return Number.isFinite(lost) && lost > 0 ? Math.round(lost) : 0;
}

/** Follows the keyboard from now on. Returns the function that re-measures (for tests). */
export function startKeyboardFit(win = globalThis.window) {
  const vv = win?.visualViewport;
  const root = win?.document?.documentElement;
  if (!vv || !root || typeof vv.addEventListener !== 'function') return () => {};

  // The layout height with the keyboard closed. clientHeight stays put while a keyboard is up on
  // iOS; it is re-read whenever the keyboard is closed, so a rotation is picked up.
  let layoutHeight = root.clientHeight || win.innerHeight;

  const fit = () => {
    const open = root.dataset.keyboard === 'open';
    if (!open) layoutHeight = root.clientHeight || win.innerHeight;
    const kb = keyboardHeight({ layoutHeight, viewportHeight: vv.height });
    if (kb >= KEYBOARD_MIN_PX) {
      root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
      root.dataset.keyboard = 'open';
      if (vv.offsetTop > 0 || !open) win.scrollTo?.(0, 0);
      if (!open) {
        const field = win.document.activeElement;
        if (field && /^(INPUT|TEXTAREA)$/.test(field.tagName ?? '') && typeof field.scrollIntoView === 'function') {
          // After the frame has taken its new size, so "nearest" is measured against it.
          (win.requestAnimationFrame ?? ((fn) => fn()))(() => field.scrollIntoView({ block: 'nearest' }));
        }
      }
    } else if (open) {
      delete root.dataset.keyboard;
      root.style.removeProperty('--app-h');
    }
  };

  vv.addEventListener('resize', fit);
  // WebKit pans while the shopper types or the caret moves; the app already fits, so pan back.
  vv.addEventListener('scroll', () => {
    if (root.dataset.keyboard === 'open' && vv.offsetTop > 0) win.scrollTo?.(0, 0);
  });
  fit();
  return fit;
}
