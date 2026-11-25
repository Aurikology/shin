/**
 * Aurik, 2026-11-25, on build 12: "the price verdict screen having a slight scroll". Every answer
 * sheet is its own scroll container (`overflow-y: auto`, css/screens/camera.css `.sheet`) so a long
 * one never pushes its action off the screen. On a phone the content can come out a few pixels taller
 * than the sheet (sub-pixel rounding at 3x, the home-bar safe area in the bottom padding), and iOS
 * then lets the whole sheet drag by that much. When all that sticks out is the sheet's own bottom
 * padding, nothing is hidden by not scrolling, so the sheet is marked `.sheet-fits` and does not.
 */
export function sheetFits({ scrollHeight, clientHeight, paddingBottom }) {
  const over = scrollHeight - clientHeight;
  return over <= Math.max(1, paddingBottom || 0);
}

/** Measures `sheet` and sets `.sheet-fits`. Runs again when a detent's height transition ends. */
export function fitSheet(sheet) {
  if (!sheet || typeof sheet.getBoundingClientRect !== 'function' || typeof getComputedStyle !== 'function') return;
  const measure = () => {
    if (!sheet.isConnected) return;
    sheet.classList.remove('sheet-fits');
    const fits = sheetFits({
      scrollHeight: sheet.scrollHeight,
      clientHeight: sheet.clientHeight,
      paddingBottom: parseFloat(getComputedStyle(sheet).paddingBottom),
    });
    sheet.classList.toggle('sheet-fits', fits);
    if (fits) sheet.scrollTop = 0;
  };
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 0);
  raf(measure);
  if (!sheet.dataset.fitWired) {
    sheet.dataset.fitWired = '1';
    sheet.addEventListener('transitionend', (e) => { if (e.target === sheet && e.propertyName === 'max-height') measure(); });
  }
}
