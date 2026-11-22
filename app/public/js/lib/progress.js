/**
 * Progress: the shopper's own record, read back as numbers that grow. Aurik, 2026-11-22: "a feature
 * where the user can see how much they saved. like a track progress sector ... This is where it will
 * show the users they are saving more than the average person. documenting every purchase."
 *
 * THE NUMBER, AND WHY IT IS THIS ONE (RULINGS "No savings claim ships until it is measured",
 * Competition Act s.74.01(1)(b)): a "Pexi saved you $X" tally is not shipped. Its one honest form is the
 * spread between the price the shopper paid and the typical price Pexi held, counted only on scans
 * Pexi was sure about (confidence high or medium), and never called "saved". So:
 *
 *   under the typical price = the sum, over scans the shopper marked Bought, of
 *                             (typical price - the price they paid), where that is above zero.
 *
 * "The typical price" is the centre of the price range the verdict showed: what an average shopper
 * pays for that item. That is the honest version of "saving more than the average person".
 *
 * Bought is the shopper's own mark (a scan is not a purchase: RULINGS, the primary user is a window
 * shopper). Nothing is projected, estimated forward or invented: an empty record is an empty chart.
 *
 * No streaks (RULINGS "Reward mechanics": killed, they pay for re-scanning a cupboard).
 *
 * PURE: no DOM, no store. The screen (screens/progress.js) passes the history in.
 */

import { answerOf } from './history-answer.js';

const DAY = 24 * 60 * 60 * 1000;

/** The ranges the chart offers, in days (null is everything on record). */
export const RANGES = Object.freeze({ '30d': 30, '6m': 182, all: null });

/** A history row's answer when it can be counted: sure enough, with a price the shopper gave. */
export function countable(entry) {
  const a = answerOf(entry);
  if (!a) return null;
  if (a.confidence !== 'high' && a.confidence !== 'medium') return null;
  if (!Number.isFinite(a.askingCents) || !Number.isFinite(a.centreCents) || a.centreCents <= 0 || a.askingCents <= 0) return null;
  return a;
}

/** The most common currency among counted buys (a phone's record is one market; never add CAD to USD). */
function mainCurrency(rows) {
  const n = new Map();
  for (const { a } of rows) n.set(a.currency, (n.get(a.currency) ?? 0) + 1);
  let best = null;
  for (const [c, k] of n) if (best === null || k > n.get(best)) best = c;
  return best;
}

/**
 * Everything the Progress screen shows, from `history` (store.js rows, newest first), the all-time
 * `scanCount`, and `now`. Returns:
 *   scansWeek, scansTotal       counts from the record
 *   buys                        bought rows that can be counted, in the main currency
 *   currency                    that currency, or null with no buys
 *   underCents                  the sum of the positive gaps (typical minus paid)
 *   beat                        how many of those buys were under the typical price
 *   vsTypicalPct                (paid - typical) / typical over all counted buys, rounded; negative = paid less
 *   series(range)               cumulative underCents by day, [{ t, cents }], oldest first
 */
export function progressStats(history, { scanCount = null, now = Date.now() } = {}) {
  const rows = Array.isArray(history) ? history : [];
  const weekAgo = now - 7 * DAY;
  const scansWeek = rows.filter((h) => Date.parse(h?.at) >= weekAgo).length;
  const scansTotal = Math.max(Number.isInteger(scanCount) ? scanCount : 0, rows.length);

  const bought = rows
    .filter((h) => h && h.bought === true)
    .map((h) => ({ h, a: countable(h), at: Date.parse(h.boughtAt ?? h.at) }))
    .filter((r) => r.a && Number.isFinite(r.at));
  const currency = bought.length ? mainCurrency(bought) : null;
  const buys = bought.filter((r) => r.a.currency === currency).sort((x, y) => x.at - y.at);

  let underCents = 0;
  let beat = 0;
  let paid = 0;
  let typical = 0;
  for (const { a } of buys) {
    const gap = a.centreCents - a.askingCents;
    if (gap > 0) { underCents += gap; beat += 1; }
    paid += a.askingCents;
    typical += a.centreCents;
  }
  const vsTypicalPct = typical > 0 ? Math.round(((paid - typical) / typical) * 100) : null;

  function series(range = 'all') {
    if (!Object.hasOwn(RANGES, range)) throw new Error(`progressStats.series: ${JSON.stringify(range)} is not a range; expected ${Object.keys(RANGES).join(', ')}`);
    const days = RANGES[range];
    const from = days === null ? -Infinity : now - days * DAY;
    let running = 0;
    const out = [];
    for (const { a, at } of buys) {
      running += Math.max(0, a.centreCents - a.askingCents);
      if (at >= from) out.push({ t: at, cents: running });
    }
    return out;
  }

  return { scansWeek, scansTotal, buys: buys.length, currency, underCents, beat, vsTypicalPct, series };
}
