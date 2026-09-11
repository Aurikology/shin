/**
 * The bottom bar, for the pages behind the camera.
 *
 * docs/design/DESIGN.md section 4: "The bottom bar carries three things.
 * Shutter dead centre [...] Watchlist to its left, You to its right." That was
 * true of the camera and of nothing else. Every page behind it carried a lone
 * `.mini-shutter` floating in `.page-foot` with no bar under it and no way to
 * cross from Saved to You without going through the camera first, so navigation
 * changed shape the moment a user left the viewfinder.
 *
 * The markup is here and not in six screens, because six copies of a navigation
 * bar is six places for the active state to be wrong. Each screen calls
 * `pageBar(activeId)` and wires the three `data-act` values it does not already
 * handle; the camera keeps its own bar, which slides away on a verdict and is
 * drawn over a live feed rather than on a surface.
 *
 * The icons are the camera's own, at 22px instead of 19px, because here they
 * carry a label under them rather than sitting alone over a photograph.
 */

/** The bookmark, `data-act="watchlist"`. Same path as camera.js's nav button. */
const SAVED_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

/** The person, `data-act="you"`. Same path as camera.js's nav button. */
const YOU_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`;

/** The chevron on the back control and on a row that navigates. */
const CHEVRON_LEFT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;

const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`;

const CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
     stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 7"/></svg>`;

/*
 * The two controls a list row carries at its right edge. They live here with
 * the chevron and the tick because this file is where the app's shared row and
 * bar glyphs are drawn once, at one weight, rather than as a character in one
 * screen and an SVG in another. `&times;` was the old remove control: a text
 * glyph whose size and weight came from whatever font happened to load, next to
 * stroke icons that did not.
 *
 * `aria-hidden` on both. The accessible name of the button is the `.sr-only`
 * span beside the glyph, which names the item it acts on, and a screen that
 * built that name by interpolating a user-typed label into an `aria-label` is
 * the bug that put it in a span in the first place.
 */
const REMOVE_GLYPH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

/* Counter-clockwise, and back to where it started: the shape for undoing,
   never a forward-pointing arrow, which reads as "go to". */
const RESTORE_GLYPH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5V10h5.5"/></svg>`;

/** The remove control's glyph, on a saved row and a past-scan row. */
export const removeGlyph = () => REMOVE_GLYPH;

/** The restore control's glyph, on a recently-removed row. */
export const restoreGlyph = () => RESTORE_GLYPH;

/** The chevron a navigating row carries on its right. */
export const rowChevron = () => `<span class="ilist-c">${CHEVRON_RIGHT}</span>`;

/** The tick that marks the chosen option in a grouped card. */
export const rowCheck = () => `<span class="ilist-k">${CHECK}</span>`;

/**
 * One navigation item. The active one is marked twice on purpose: `aria-current`
 * for the reader, `.on` for the pill behind its icon. It is still a button, so
 * the tab order does not change between pages; the screen it is already on
 * simply has no handler for its own id, so pressing it does nothing rather than
 * pushing a second history entry for the page you are standing on.
 */
function item(act, label, icon, active) {
  return `<button type="button" class="pbar-i${active ? ' on' : ''}" data-act="${act}"
            aria-label="${label}"${active ? ' aria-current="page"' : ''}>
      <span class="pbar-ic">${icon}</span>
      <span class="pbar-l">${label}</span>
    </button>`;
}

/**
 * The bar, as the last child of `.page`.
 *
 * @param activeId  'watchlist' or 'you'. A sub-page passes the parent it sits
 *                  under (past scans and recently removed are Saved; the market
 *                  picker and the licences screen are You), because that is what
 *                  the user navigated through to get here.
 */
export function pageBar(activeId) {
  return `<nav class="page-bar" aria-label="Shin">
      ${item('watchlist', 'Saved', SAVED_ICON, activeId === 'watchlist')}
      <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something" data-fk="nav:camera"></button>
      ${item('you', 'You', YOU_ICON, activeId === 'you')}
    </nav>`;
}

/**
 * The back control, top left of `.page-head` on a sub-page.
 *
 * Sub-pages only. Saved and You are the two things the bar itself reaches, so a
 * back control on either of them would point at whatever the user happened to
 * be looking at before, which is not a parent.
 */
export function backButton() {
  return `<button type="button" class="pbk" data-act="back" aria-label="Back" data-fk="nav:back">${CHEVRON_LEFT}</button>`;
}

/**
 * What the back control does.
 *
 * `history.back()` rather than `ctx.go(parent)`, because router.js pushes a
 * history entry on every `go` and the browser's own back button already lands
 * on the parent. A second, forward navigation dressed up as a back one leaves a
 * trail where pressing the system back button walks you through the same two
 * screens repeatedly.
 *
 * The fallback is for the deep link: opening `?s=licences` cold gives a history
 * of one, and `history.back()` there leaves the app entirely.
 */
export function goBack(ctx, fallbackId) {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  ctx.go(fallbackId);
}
