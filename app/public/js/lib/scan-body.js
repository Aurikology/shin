/**
 * Two facts every scan request carries to the server, made testable.
 *
 * `thresholds`  the user's own great, good and bad ranges and their unit, as
 *               store.js holds them (`lineGreatPct`, `lineUnderPct`,
 *               `lineOverPct`, or `lineAmounts` in dollar mode). Jamin, 2026-09-17: "These
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

import { findCountry } from './countries.js';

/**
 * The thresholds object for a request, or undefined when the user has none set.
 * Shape: { unit: 'percent' | 'amount', great, good, bad }, all three in that
 * unit (see lib/ranges.js for what each one means). `unit` always rides with the
 * numbers, so the server never guesses whether "10" is a percent or ten dollars.
 * Only a range the user's store actually holds is sent; the server fills the rest
 * from its default range and says so in the prompt.
 */
export function thresholdsFrom(state) {
  const unit = state?.lineUnit === 'amount' ? 'amount' : 'percent';
  const held = unit === 'amount'
    ? { great: state?.lineAmounts?.great, good: state?.lineAmounts?.good, bad: state?.lineAmounts?.bad }
    : { great: state?.lineGreatPct, good: state?.lineUnderPct, bad: state?.lineOverPct };
  const out = { unit };
  for (const [k, v] of Object.entries(held)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 1 ? out : undefined;
}

/**
 * What every scan request says about WHERE and HOW the user is shopping, so the
 * one Gemini call can apply the market rules and the alternatives modes
 * (`docs/beta-gaps-2026-09-19.md` items 18 and 19):
 *
 *   `market`     the country the user chose, in English ("Canada"), the value
 *                `store.market()` holds. Only what the user chose is sent: with
 *                nothing chosen nothing goes, and the server calls it unknown.
 *   `countryCode` its ISO 3166-1 alpha-2 code ("CA"), so any country in the world
 *                resolves on the server without a name table.
 *   `region`     the province, state or similar the user chose inside it, in
 *                English ("Ontario"). Optional; absent means unknown, and the
 *                prompt then says the region is unknown.
 *   `currency`   that market's currency code.
 *   `language`   the reader's language tag (fr-CA), so Gemini answers in it.
 *   `storeName`, `storeHint`  the shop the user tapped, and OpenStreetMap's own
 *                kind word for it ("supermarket"). The server turns them into a
 *                store type; only the type reaches the prompt.
 *
 * `mode`       validation or switching (beta gaps row 25), what the user chose on
 *              the price pad. Absent when nobody chose one, and the server then
 *              reads it from whether a shelf price rode along
 *              (`alternativesModeFor` in identify/src/providers/gemini-scan.ts).
 * `hint`       what the picture shows: `price_tag` in Price Tag mode (W30), so
 *              Gemini reads the tag's name and price.
 * Pure: every input is an argument. Absent facts are absent keys, never blanks.
 */
export function scanContextFrom({ market, language, shop, intent } = {}) {
  const out = {};
  if (intent?.mode === 'validation' || intent?.mode === 'switching') out.mode = intent.mode;
  if (intent?.hint === 'price_tag') out.hint = intent.hint;
  const country = typeof market?.country === 'string' ? market.country.trim() : '';
  const currency = typeof market?.currency === 'string' ? market.currency.trim() : '';
  const region = typeof market?.region === 'string' ? market.region.trim() : '';
  const stored = typeof market?.code === 'string' ? market.code.trim() : '';
  if (country) out.market = country;
  if (currency) out.currency = currency;
  // The ISO code rides beside the name so the server never has to guess one from
  // an English name it may not know. A market saved before codes were stored
  // has none, so it is looked up from the name; no match sends nothing.
  const code = stored ? stored.toUpperCase() : country ? (findCountry(country)?.code ?? '') : '';
  if (code) out.countryCode = code;
  // A region only means something inside a country. It is sent as chosen (the
  // English name); with no country, or none chosen, nothing is sent and the
  // server calls it unknown.
  if (region && (country || code)) out.region = region;
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
