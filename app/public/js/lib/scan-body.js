/**
 * Two facts every scan request carries to the server, made testable.
 *
 * `thresholds`  the user's own good/bad lines, exactly as store.js holds them
 *               (`lineUnderPct`, `lineOverPct`). Jamin, 2026-09-17: "These
 *               thresholds are crucial and non negotiable as not having them
 *               breaks gemini's rule of not being able to interpret geminis
 *               results." The server reads both field names. A user with none
 *               set sends NOTHING, and the server applies its default; the
 *               client never invents a number of its own.
 * `shelfPriceCents`  the price on the shelf tag, asked at scan time so it can
 *               ride in the one call ("This way, the price can get sent to
 *               gemini along with the rest of the prompt."). Absent when the
 *               shopper skipped the price: skipping still gets an answer.
 *
 * Pure: takes the store's state and a value, touches nothing.
 */

/** The thresholds object for a request, or undefined when the user has none set. */
export function thresholdsFrom(state) {
  const under = state?.lineUnderPct;
  const over = state?.lineOverPct;
  const out = {};
  if (typeof under === 'number' && Number.isFinite(under)) out.lineUnderPct = under;
  if (typeof over === 'number' && Number.isFinite(over)) out.lineOverPct = over;
  return Object.keys(out).length ? out : undefined;
}

/** A whole positive number of cents, or undefined. Zero, negatives and junk are "no price". */
export function shelfPriceOf(cents) {
  return typeof cents === 'number' && Number.isInteger(cents) && cents > 0 ? cents : undefined;
}
