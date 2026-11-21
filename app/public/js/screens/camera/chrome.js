/**
 * The pieces every camera sheet is framed with: the frozen-frame thumbnail, the back button and
 * the grabber. Moved out of screens/camera.js on 2026-11-21 (the camera.js split, slice 3),
 * verbatim; camera.js and the sheet modules beside this one import them from here.
 */
import { escapeHtml } from '../../lib/dom.js';
import { t } from '../../ui-strings.js';

/** Row 40: the thumbnail beside an identity, when one was captured. */
function thumbImg(thumb) {
  return thumb ? `<img class="scan-thumb" src="${thumb}" width="40" height="40" alt="" loading="lazy">` : '';
}

/**
 * Rows the candidate list, the price pad and the type-it route all lacked: a
 * labelled way back, not only the swipe-to-dismiss that nothing on screen
 * teaches. Same icon and handler as the working sheet's own close,
 * `cancel-scan`, which already resets straight to the live viewfinder.
 *
 * `act` exists because that is the right answer on a SCAN sheet and the wrong
 * one on a sheet opened from another sheet. D-152: the shop picker is reached
 * from the price pad, and its X ran `cancel-scan` like everywhere else, so
 * dismissing the shop question threw away the price already typed and the
 * whole scan with it. A sub-sheet passes its own act and goes back one step.
 */
function backButton(label = t('back_to_camera'), act = 'cancel-scan') {
  return `<button type="button" class="sheet-close" data-act="${escapeHtml(act)}" aria-label="${escapeHtml(label)}">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>`;
}

/**
 * The grabber on a sheet that has somewhere to go, as a real control.
 *
 * It used to be `<span class="grabber" aria-hidden="true" role="button"
 * tabindex="0" aria-label="Show more">` with no key handler anywhere in the
 * repo -- `grep -rn "keydown" public/js` returned zero hits -- which is the
 * worst of the three available states at once: in the tab order, announced as a
 * button, hidden from the accessibility tree by `aria-hidden`, and inert on
 * every key. A keyboard user reached it, was told it was a button, and nothing
 * happened.
 *
 * Made a real `<button>` rather than promoting `.sheet-head` to the control,
 * because the head is not a control: it holds Pexi's face, his spoken bubble
 * (which changes text while the sheet is open) and the frozen-frame thumbnail,
 * and a button's accessible name is its whole subtree -- so promoting the head
 * would name this control with a paragraph of speech and would re-announce it
 * every time the bubble changed. The head keeps its drag, which is a gesture
 * and not a control, and the grabber keeps its own short, stable name.
 *
 * Only the two sheets with a half or full detent get one. The candidate list,
 * the pad, the going-rate card, the working wait and the type-it route all top
 * out at peek, so their grabber stays a decorative `<span aria-hidden="true">`:
 * a focusable control that cannot do anything is the defect this is fixing.
 */
function grabber() {
  return `<button type="button" class="grabber" data-act="detent-step" aria-label="${escapeHtml(t('cam_show_more'))}"></button>`;
}

/**
 * Row 43: a tag can say "20% off" or "3 for $5" instead of one flat number.
 * Both recompute the unit price Pexi actually judges; the typed number stops
 * being the asking price once a modifier is active, and the confirm key sends
 * the effective price, never the sticker number alone.
 */
/* D-268 E23 (2026-11-11 walk): the same limits as the inputs' own min/max.
   A lit modifier outside them used to fall back to the sticker price, so
   "96% off" priced and "150% off" sent the sticker number with "% off" lit. */

export { thumbImg, backButton, grabber };
