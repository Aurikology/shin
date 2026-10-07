/**
 * The user's three price ranges, great, good and bad, and the unit they are in.
 *
 * Founder, 2026-09-16/17: the user's good, bad and GREAT ranges are "crucial and
 * non negotiable", and his welcome screens let the user choose Percentage (%) or
 * Dollar Amount ($). His Conservative option is "30%+", so a range can be 30.
 *
 * WHAT EACH ONE MEANS. Measured from the middle of the prices found for the item:
 *   great  at least this far BELOW the middle (deeper than good)
 *   good   at least this far below the middle
 *   bad    at least this far ABOVE the middle
 * Nothing between good and bad is graded. In dollar mode the amount is money per
 * item at the shelf's size, the shelf price against the middle price for that size.
 *
 * WHERE THEY LIVE. Percent mode keeps the store's two existing keys, so nothing
 * that already read them broke: `lineUnderPct` is good, `lineOverPct` is bad. The
 * new ones are `lineGreatPct`, `lineUnit` ('percent' or 'amount') and `lineAmounts`
 * ({ great, good, bad }), kept apart so switching unit never rewrites the other
 * unit's numbers. The defaults are unmeasured starting points, like the ten and ten
 * before them; they are here so a user who sets nothing still has a range.
 *
 * NO DOM AND NO STORE HERE, so test/price-ranges.test.mjs runs it in Node.
 */

export const RANGE_KINDS = Object.freeze(['great', 'good', 'bad']);

/** Up to 30, so his "Conservative 30%+" can be expressed. */
export const PERCENT_CHOICES = Object.freeze([5, 10, 15, 20, 25, 30]);
export const AMOUNT_CHOICES = Object.freeze([1, 2, 3, 5, 10, 20]);

/**
 * THE ONE DEFAULT SET (D10, 2026-10-06). His 2026-09-17 setup numbers, RULINGS.md
 * "The verdict speaks his words against the shopper's own thresholds": great 30%
 * or more under the typical price, good 20% or more under, bad 20% or more over.
 * lib/verdict-chart.js imports this, store.js holds NO copy of it (an unset range
 * is null there and reads as this), and price/src/estimate.ts carries the server's
 * twin, which test/default-thresholds.test.mjs pins equal. Until that fix the
 * client read 20/10/10 here and in the store while the bell drew 30/20/20.
 */
export const DEFAULT_PERCENTS = Object.freeze({ great: 30, good: 20, bad: 20 });
export const DEFAULT_AMOUNTS = Object.freeze({ great: 2, good: 1, bad: 1 });

const PERCENT_KEY = { great: 'lineGreatPct', good: 'lineUnderPct', bad: 'lineOverPct' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function unitOf(state) {
  return state?.lineUnit === 'amount' ? 'amount' : 'percent';
}

export function choicesFor(unit) {
  return unit === 'amount' ? AMOUNT_CHOICES : PERCENT_CHOICES;
}

/** The three values in the state's own unit, defaults filled in. */
export function rangesOf(state) {
  const unit = unitOf(state);
  const out = { unit };
  for (const k of RANGE_KINDS) {
    const v = unit === 'amount' ? state?.lineAmounts?.[k] : state?.[PERCENT_KEY[k]];
    out[k] = isNum(v) ? v : (unit === 'amount' ? DEFAULT_AMOUNTS : DEFAULT_PERCENTS)[k];
  }
  return out;
}

/**
 * The store patch for the user setting one range. The one just touched wins:
 * great is never below good, so raising good past great lifts great with it, and
 * lowering great under good lowers good with it.
 */
export function rangePatch(state, kind, value) {
  if (!RANGE_KINDS.includes(kind) || !isNum(value) || value < 0) return {};
  const r = rangesOf(state);
  const next = { great: r.great, good: r.good, bad: r.bad, [kind]: value };
  if (kind === 'good' && next.great < next.good) next.great = next.good;
  if (kind === 'great' && next.good > next.great) next.good = next.great;
  if (r.unit === 'amount') {
    return { lineAmounts: { ...(state?.lineAmounts ?? {}), great: next.great, good: next.good, bad: next.bad } };
  }
  // `linesSet` records that these numbers are the shopper's own, so a later
  // default change (store.js `migrate`) never overwrites a choice.
  return { lineGreatPct: next.great, lineUnderPct: next.good, lineOverPct: next.bad, linesSet: true };
}

/**
 * A state saved before the 30/20/20 defaults still holds the old stored defaults,
 * 20/10/10, in the three percent keys. When the shopper never set them (no
 * `linesSet` marker, and the three are exactly the old defaults) they were never
 * a choice: they become unset (null), which reads as the current defaults and
 * sends nothing to the server. Any other triple was the shopper's, and is kept
 * and marked. Pure, so it runs under node.
 */
export function migrateLines(s) {
  if (s?.linesSet === true) return s;
  const g = s?.lineGreatPct;
  const u = s?.lineUnderPct;
  const o = s?.lineOverPct;
  if (g === undefined && u === undefined && o === undefined) return { ...s, lineGreatPct: null, lineUnderPct: null, lineOverPct: null, linesSet: false };
  if (g === 20 && u === 10 && o === 10) return { ...s, lineGreatPct: null, lineUnderPct: null, lineOverPct: null, linesSet: false };
  const held = [g, u, o].some((v) => isNum(v));
  return { ...s, linesSet: held };
}

/** The store patch for the Percentage or Dollar Amount toggle. */
export function unitPatch(unit) {
  return { lineUnit: unit === 'amount' ? 'amount' : 'percent' };
}
