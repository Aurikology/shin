/**
 * The sheet's dismiss (build 7, R-86). A sheet that is removed from the page with no exit just vanishes;
 * this gives it 200 ms (css/screens/camera.css `.sheet[data-leaving]`, ease-out) and only then removes it.
 *
 * The timer, not `animationend`, decides when it is gone: a browser that never plays the animation (a
 * hidden tab, a stylesheet that failed to load) would otherwise leave the sheet on screen with
 * `pointer-events: none` and nothing able to close it.
 *
 * Fails loudly, per RULINGS.md "Errors never go unnoticed": no element, or no callback, throws and names
 * which, rather than returning as if the sheet had been dismissed.
 */
export const SHEET_DISMISS_MS = 200;

export function dismissSheet(el, done) {
  if (!el || typeof el.setAttribute !== 'function') throw new TypeError('dismissSheet: there is no sheet element to dismiss');
  if (typeof done !== 'function') throw new TypeError('dismissSheet: the callback that removes the sheet is missing, so it would never leave');
  if (el.hasAttribute?.('data-leaving')) throw new Error('dismissSheet: this sheet is already leaving');
  el.setAttribute('data-leaving', '');
  setTimeout(done, SHEET_DISMISS_MS);
}
