/**
 * The sheets for a scan the server could not answer: busy (with its retry timing), no
 * connection, and a server fault, plus the two tests that tell them apart. Moved out of
 * screens/camera.js on 2026-11-21 (the camera.js split, slice 3), verbatim. camera.js imports
 * and re-exports them, so every existing import keeps working.
 */
import { shinSay } from '../../shin.js';
import { escapeHtml } from '../../lib/dom.js';
import { t } from '../../ui-strings.js';
import { backButton, grabber } from './chrome.js';

/**
 * Whether a failed call got an answer from the server that was not a success
 * (any non-2xx: a 5xx fault, or a 400/403/404 refusal) rather than the request
 * never arriving. api.js throws `/api/... returned 503` for a bad status and
 * lets fetch's own TypeError through for a dead network. Only the latter is
 * "I need a connection" (2026-11-14: a refused request was shown as bad signal).
 */
function isServerFault(err) {
  if (isBusy(err)) return false;
  const m = /returned (\d{3})\b/.exec(String(err?.message ?? ''));
  return !!m && Number(m[1]) >= 300;
}

/**
 * R17: api.js threw `PexiBusy` because a web page (a Cloudflare challenge, a "site is down" page, a
 * hotel login) came back where the server's JSON should have. Neither "I need a connection" (the phone
 * is online) nor "Pexi hit a problem" (nothing in Pexi failed): the answer is "Pexi is busy, try again",
 * and one automatic retry follows a few seconds later.
 */
function isBusy(err) {
  return err?.busy === true;
}

/** How long the camera waits before it retries a busy answer by itself, and how many times it does. */
const BUSY_RETRY_MS = 12000;

const BUSY_RETRIES = 1;

function busySheet() {
  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1" data-busy>
      ${grabber()}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', 'cam_server_fault_busy', {}, { size: 'face-verdict' })}
        </div>
        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="lookup-retry">${escapeHtml(t('try_again'))}</button>
        </div>
      </div>
    </section>`;
}

/**
 * D37: the offline sheet carries Retry, the same barcode sent again. The bubble
 * and Try again are the whole sheet (2026-10-10 audit row 18): a second sentence
 * under the bubble only said the same fact again.
 */
function needsConnectionSheet() {
  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1" data-needs-connection>
      ${grabber()}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', 'cam_needs_connection', {}, { size: 'face-verdict' })}
        </div>
        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="lookup-retry">${escapeHtml(t('try_again'))}</button>
        </div>
      </div>
    </section>`;
}

/**
 * D17: a fault on Pexi's side says so, and offers Retry. Never "I need a
 * connection". The bubble and Try again only (2026-10-10 audit row 17): the
 * sentence that followed repeated the bubble and claimed the connection was fine,
 * which nothing here checks.
 */
function serverFaultSheet() {
  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1" data-server-fault>
      ${grabber()}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', 'cam_server_fault', {}, { size: 'face-verdict' })}
        </div>
        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="lookup-retry">${escapeHtml(t('try_again'))}</button>
        </div>
      </div>
    </section>`;
}

/**
 * CATALOGUE FIRST: the answer to a barcode when `/api/identify` answers
 * `kind: 'catalogue'` (server setting SHIN_CATALOGUE_FIRST on; the shape is in
 * the header of app/src/catalogue-first.ts). With the setting off this is
 * never called and nothing below runs.
 *
 * Two outcomes, one template, so the surface has one tag (a98):
 *
 *   catalogue_hit      the product Pexi's own catalogue named (name, brand,
 *                      size) and its price range, low to high in the range's
 *                      own currency through lib/money.js (so French reads
 *                      `4,99 $`), with one provenance line that says where the
 *                      range came from and never what the price is. A shelf
 *                      price (typed on the pad, else read off a weighed label)
 *                      is placed against the SHOPPER'S OWN lines with the price
 *                      line's three zone words, exactly as the answer sheet
 *                      does with Gemini's zone. No range: the product still
 *                      shows, with a short line keyed on `noRangeReason`
 *                      (lib/catalogue-range.js), never the code.
 *   not_in_catalogue   one primary action, type the product name, which opens
 *                      the camera's existing type-it field (`typeit`); the
 *                      shelf price already typed rides on (`data-carry-price`).
 *
 * Peek only: there is nothing a half detent would hold yet, and a grabber that
 * cannot move is the defect `grabber()` records.
 */
/* ==================================================== the verdict bell ==
 *
 * THE PRICE VERDICT AS A DISTRIBUTION (RULINGS.md "V1 verdict screen
 * mechanics", 2026-09-30: "an animated normal distribution chart and where
 * their product price falls on it. It will ALWAYS provide the answer(unless
 * the user runs out of scans)"). Built to the response contract in
 * docs/verdict-distribution-design-2026-09-30.md: any answer that carries a
 * drawable `verdict` (`kind: 'distribution'`) is shown here, whichever route
 * it came by, and no refusal sheet is drawn over it.
 *
 * Detents, per the same ruling: the peek holds the face, his zone word, the
 * bell and the one primary action (Save, tier-keyed); the half holds the
 * evidence (notes, the bigger-pack note, every dot with its store and
 * quantity, where the estimate came from) and Correct; the full holds the
 * thumbs and Done.
 */

/* `distFace` (the zone word's face) lives in lib/history-answer.js: the Saved list wears the same face (D20). */

export { isServerFault, isBusy, BUSY_RETRY_MS, BUSY_RETRIES, busySheet, needsConnectionSheet, serverFaultSheet };
