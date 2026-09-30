/**
 * The catalogue-first answer's arithmetic and word choices, with no DOM.
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * (2026-09-27): a barcode is named by Shin's own catalogue and its price range
 * comes from Shin's own prices by math, else its category's range, else (capped)
 * a typical range Gemini was asked for. The server sends that range as
 * `{ lowCents, highCents, medianCents, n, basis, category, currency, unit }`
 * (app/src/catalogue-first.ts, header). This file decides three things about it
 * on the client, and nothing else:
 *
 *   1. WHERE A SHELF PRICE FALLS against the shopper's OWN lines.
 *      RULINGS.md "The price line speaks the shopper's own range, never Shin's
 *      opinion": the answer is one of the three neutral codes the price line
 *      already uses (under_your_line, middle, over_your_line), never a grading
 *      word. The rule is identify/src/gauge.ts's own, so the two cannot disagree
 *      on where a line sits: percent from the middle, `<= -good` is under, `> bad`
 *      is over, everything else is the middle. The lines are lib/ranges.js
 *      `rangesOf`, which fills the same defaults the server applies when the
 *      shopper set none (10 and 10), so an unset shopper is placed exactly where
 *      the server would place them. This is allowed on the client where the
 *      Gemini sheet's zone is not: a catalogue range is Shin's own data, not a
 *      Grounded Result, so there is no term against doing the math here.
 *
 *   2. WHICH PROVENANCE LINE the basis gets (a ui-strings.js key and its facts).
 *
 *   3. WHICH "no range yet" LINE a `noRangeReason` gets. The raw code is never
 *      shown: every code maps to one of two keys, and an unknown code takes the
 *      plain one.
 *
 * Pure: every input is an argument. test/catalogue-answer.test.mjs runs it in Node.
 */

import { rangesOf } from './ranges.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const BASES = Object.freeze(['this_product', 'leaf_category', 'parent_category', 'gemini_typical']);

/**
 * A usable range off the wire, or null. A range with a missing bound, a low
 * above its high, or a basis this build does not know is not drawn at all:
 * drawing half a range is inventing the other half.
 */
export function usableRange(range) {
  if (!range || typeof range !== 'object') return null;
  if (!isNum(range.lowCents) || !isNum(range.highCents)) return null;
  if (range.lowCents <= 0 || range.highCents < range.lowCents) return null;
  if (!BASES.includes(range.basis)) return null;
  return range;
}

/**
 * The middle a shelf price is measured from: the median the server computed
 * when it has one, else the midpoint of the range (gemini_typical carries no
 * median, only a low and a high).
 */
export function middleCents(range) {
  const r = usableRange(range);
  if (!r) return null;
  if (isNum(r.medianCents) && r.medianCents > 0) return r.medianCents;
  return Math.round((r.lowCents + r.highCents) / 2);
}

/**
 * Where `shelfCents` falls against the shopper's own lines, measured from the
 * range's middle. Returns `{ zone, pct }` or null when either number is
 * missing. `pct` is the signed percent from the middle, for a caller that wants
 * it; the zone is the only thing the sheet speaks.
 *
 * A range that says what one price buys (`unit`, gemini_typical only: "per
 * kg", "1 L bottle") is not placed: the shelf price is for whatever is on the
 * shelf, and comparing it to a per-unit figure would put the dot in the wrong
 * zone with nothing on screen to say why. The range still shows.
 *
 * @param {number} shelfCents
 * @param {object} range  the wire's `range`
 * @param {object} state  the store's state (lib/ranges.js reads its lines)
 */
export function placeShelf(shelfCents, range, state) {
  if (!isNum(shelfCents) || shelfCents <= 0) return null;
  const r = usableRange(range);
  if (!r) return null;
  if (typeof r.unit === 'string' && r.unit.trim() !== '') return null;
  const mid = middleCents(r);
  if (!isNum(mid) || mid <= 0) return null;
  const lines = rangesOf(state);
  const pct = ((shelfCents - mid) / mid) * 100;
  let zone;
  if (lines.unit === 'amount') {
    // Dollar mode: money per item, the shelf price against the middle price.
    const diff = (shelfCents - mid) / 100;
    zone = diff <= -lines.good ? 'under_your_line' : diff > lines.bad ? 'over_your_line' : 'middle';
  } else {
    zone = pct <= -lines.good ? 'under_your_line' : pct > lines.bad ? 'over_your_line' : 'middle';
  }
  return { zone, pct };
}

/**
 * The shelf price to place: the one the shopper typed on the pad wins (it is
 * the tag in front of them), else the one the server read off a weighed label.
 */
export function shelfCentsOf(typedCents, wireShelf) {
  if (isNum(typedCents) && typedCents > 0) return Math.round(typedCents);
  if (wireShelf && isNum(wireShelf.cents) && wireShelf.cents > 0) return Math.round(wireShelf.cents);
  return null;
}

/**
 * The provenance line for a range, as `{ key, facts }` for `t()`. Facts arrive
 * unformatted except where noted; the caller formats the date.
 *
 *   this_product      "From Shin's own prices at N stores" (n is shops)
 *   leaf_category,    "From similar products in <category>" (the range's own
 *   parent_category    category, else the product's)
 *   gemini_typical    "A typical range estimated by AI, asked <date>"
 */
export function provenanceOf(range, identity = null) {
  const r = usableRange(range);
  if (!r) return null;
  if (r.basis === 'this_product') {
    if (!isNum(r.n) || r.n < 1) return { key: 'cat_basis_shin_bare', facts: {} };
    return { key: r.n === 1 ? 'cat_basis_shin_one' : 'cat_basis_shin', facts: { n: String(r.n) } };
  }
  if (r.basis === 'leaf_category' || r.basis === 'parent_category') {
    const name = (r.category?.name ?? identity?.category?.name ?? '').trim();
    return name ? { key: 'cat_basis_category', facts: { category: name } } : { key: 'cat_basis_category_bare', facts: {} };
  }
  return { key: 'cat_basis_ai', facts: {} };
}

/**
 * The reason codes that mean "the ask was refused for now, not for good": a
 * later scan may well get a range. Everything else, including a code this
 * build has never heard of, takes the plain sentence.
 */
const LATER = new Set(['monthly_cap_reached', 'rate_limited', 'cap_store_error', 'model_error']);

/** The ui-strings.js key for a null range. Never the code itself. */
export function noRangeKey(reason) {
  return LATER.has(reason) ? 'cat_no_range_later' : 'cat_no_range';
}

/**
 * An ISO time as a date in the reader's language ("September 27, 2026",
 * "27 septembre 2026"), or '' when it does not parse. '' means the sentence is
 * said without a date rather than with a wrong one.
 */
export function askedDate(iso, tag) {
  if (typeof iso !== 'string' || iso.trim() === '') return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  try {
    return new Intl.DateTimeFormat(tag || 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(at));
  } catch {
    return '';
  }
}

/**
 * Is this range really one price? The shop count never suppresses a product's own
 * price (RULINGS.md "Judge and gauge mechanics", 2026-09-30): where low and high
 * are the same number the sheet says that price, not a zero-width "range".
 */
export function isSinglePrice(range) {
  const r = usableRange(range);
  return !!r && r.basis === 'this_product' && r.lowCents === r.highCents;
}

/** A seller code as a shopper would say the store. An unknown seller is shown as it came. */
const STORE_WORDS = { bcldb: 'BC Liquor Stores', anbl: 'NB Liquor (ANBL)', 'walmart.ca': 'Walmart' };

/**
 * The shop as a shopper would say it. Open Prices is a publisher, not a shop:
 * its rows name the actual shop (`shop`, with its city), else a plain stand-in.
 */
export function storeLabel(seller, shop = null) {
  if (typeof seller !== 'string' || seller.trim() === '') return '';
  const key = seller.trim().toLowerCase();
  if (key === 'openprices') return typeof shop === 'string' && shop.trim() !== '' ? shop.trim() : 'a shopper-reported store';
  return STORE_WORDS[key] ?? seller.trim();
}

/**
 * A shelf price against ONE store price, in plain money and never a verdict:
 * { kind: 'same' | 'under' | 'over', cents } (cents is the absolute gap), or null.
 */
export function singleCompare(shelfCents, range) {
  const r = usableRange(range);
  if (!isNum(shelfCents) || shelfCents <= 0 || !r || !isSinglePrice(r)) return null;
  const d = shelfCents - r.lowCents;
  return { kind: d === 0 ? 'same' : d < 0 ? 'under' : 'over', cents: Math.abs(d) };
}

/** A YYYY-MM-DD day as a date in the reader's language, read as the calendar day it is (UTC, so no timezone moves it). '' when it does not parse. */
export function seenDate(day, tag) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(day)) return '';
  const at = Date.parse(day.slice(0, 10));
  if (!Number.isFinite(at)) return '';
  try {
    return new Intl.DateTimeFormat(tag || 'en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(at));
  } catch {
    return '';
  }
}
