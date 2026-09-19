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

/**
 * What every scan request says about WHERE and HOW the user is shopping, so the
 * one Gemini call can apply the market rules and the alternatives modes
 * (`docs/beta-gaps-2026-09-19.md` items 18 and 19):
 *
 *   `market`     the country the user chose, in English ("Canada"), the value
 *                `store.market()` holds. Only what the user chose is sent: with
 *                nothing chosen nothing goes, and the server calls it unknown.
 *   `currency`   that market's currency code.
 *   `language`   the reader's language tag (fr-CA), so Gemini answers in it.
 *   `storeName`, `storeHint`  the shop the user tapped, and OpenStreetMap's own
 *                kind word for it ("supermarket"). The server turns them into a
 *                store type; only the type reaches the prompt.
 *
 * The alternatives MODE is not sent: the server reads it from whether a shelf
 * price rode along (`alternativesModeFor` in identify/src/providers/gemini-scan.ts).
 * Pure: every input is an argument. Absent facts are absent keys, never blanks.
 */
export function scanContextFrom({ market, language, shop } = {}) {
  const out = {};
  const country = typeof market?.country === 'string' ? market.country.trim() : '';
  const currency = typeof market?.currency === 'string' ? market.currency.trim() : '';
  if (country) out.market = country;
  if (currency) out.currency = currency;
  if (typeof language === 'string' && language.trim() !== '') out.language = language.trim();
  const name = typeof shop?.name === 'string' ? shop.name.trim() : '';
  const hint = typeof shop?.hint === 'string' ? shop.hint.trim() : '';
  if (name) out.storeName = name;
  if (hint) out.storeHint = hint;
  return out;
}

/** A whole positive number of cents, or undefined. Zero, negatives and junk are "no price". */
export function shelfPriceOf(cents) {
  return typeof cents === 'number' && Number.isInteger(cents) && cents > 0 ? cents : undefined;
}
