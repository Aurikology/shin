/**
 * Has what we told this shopper about this product stopped being true.
 *
 * WHY THIS EXISTS. A health score does not go off. A price does. Once a shopper
 * learns their chicken is fairly priced they never scan that chicken again,
 * which is the retention problem the founder named from his own testing. The
 * reason it is solvable rather than just true is that Shin's answer has a shelf
 * life and the app has never once said so. This module is the first half of a
 * saved product being able to say "what you were told has changed", or "what
 * you were told has expired".
 *
 * WHAT THIS FILE DELIBERATELY IS NOT.
 *
 *   It is not wired. Nothing imports it, no route serves it, no screen reads
 *   it, no scheduler runs it. It takes a list of observations somebody else
 *   recorded and answers a question about them. Deleting this file changes no
 *   behaviour, which is the test of that claim.
 *
 *   It is not a price. Jamin's rule 3 named Shin's own price database, price
 *   engine and cheaper lookups specifically as not the answer source (a rule
 *   since narrowed for barcode price display: RULINGS.md, "A scanned barcode
 *   answers with Shin's own prices too"; this file's own comparison stays
 *   out of scope of that narrowing either way). What is allowed is reporting
 *   that two RECORDED
 *   observations differ, and handing each one back exactly as it was recorded.
 *   So this file never computes a difference, a percentage, a rate of change,
 *   an average, a projection or a usual price. It never subtracts one price
 *   from another. `direction` is the result of `<` and `>` on two numbers that
 *   both arrived from outside, and the two numbers go back out untouched.
 *
 *   It is not a savings claim. Hard rule 2: no savings claim until it is
 *   measured. Nothing here says or implies an amount anybody saved, and
 *   `test/price-change.test.ts` proves it from the outside: it computes the
 *   difference and the percentage itself and asserts that every number
 *   anywhere in the serialised answer is either a cents value that was handed
 *   in or the count of kept sightings.
 *
 *   It is not copy. This app localises (`public/js/voice.js`, `voice-fr.js`,
 *   `public/js/ui-strings.js`). A server module that returned an English
 *   sentence would be a French interface with an English sentence in it. So
 *   every answer is a `messageKey` plus a `messageVars` bag of numbers,
 *   snake_case codes and ISO timestamps, exactly as `src/price-match.ts` does
 *   it, and the copy for those keys is written in the string tables by whoever
 *   wires this up.
 *
 * HARD RULE 3, the aggression points at the price, the store or the brand and
 * never at the user. Nothing here is a reason code about a person. A dropped
 * sighting is Shin admitting a row it holds is unusable, not the shopper
 * getting something wrong.
 *
 * THE ONE PIECE OF ARITHMETIC IN THE FILE, named so a reviewer can find it.
 * `clearsNoiseFloor` adds a fixed constant to the lower of the two recorded
 * amounts to build a comparison bound. That bound is discarded the instant the
 * comparison is made: it is never stored, never returned, and no field of the
 * answer is derived from it. It is not a difference between two prices and it
 * is not a number about this product. If a future edit here produces a number
 * a shopper could read as a price or a saving, the edit is the bug.
 */

/** One recorded observation of a price. Recorded elsewhere, never made here. */
export interface PriceSighting {
  cents: number;
  at: string; // ISO 8601
  source: 'scan' | 'cache' | 'refresh';
}

/**
 * Which way the recorded amounts moved between the earliest and the latest
 * kept sighting.
 *
 * `unknown` is not a failure. It is the honest answer when there is nothing to
 * compare: no usable sightings at all, or exactly one. Collapsing that into
 * `unchanged` would tell a shopper their price held steady when Shin has in
 * fact only ever looked once.
 */
export type ChangeDirection = 'down' | 'up' | 'unchanged' | 'unknown';

/**
 * How much the latest recorded answer can still be relied on.
 *
 * THE NUMBERS ARE NOT INVENTED HERE. `docs/decisions.md`, "Nine rulings so the
 * competitor-survey build could start" (2026-09-19), ruling 1: "the price is
 * cached for six hours and always shown with when it was checked, and a hit
 * older than one hour triggers a background refresh". Those two boundaries are
 * this repo's clock and they are reused rather than re-chosen:
 *
 *   fresh  under one hour   nothing would even refresh it yet
 *   aging  one to six hours a refresh is due, the answer is still servable
 *   stale  six hours or more the cache life is over, the answer has expired
 *
 * If ruling 1 is reversed, the two constants below move with it and nothing
 * else in this file changes.
 */
export type Staleness = 'fresh' | 'aging' | 'stale';

export interface PriceChangeView {
  direction: ChangeDirection;
  first: PriceSighting | null;
  latest: PriceSighting | null;
  sightings: number;
  staleness: Staleness;
  worthTelling: boolean;
  messageKey: string;
  messageVars: Record<string, string | number | null>;
}

/** Ruling 1: a hit older than one hour triggers a background refresh. */
const REFRESH_DUE_AFTER_MS = 60 * 60 * 1000;

/** Ruling 1: the price is cached for six hours. */
const CACHE_LIFE_MS = 6 * 60 * 60 * 1000;

/**
 * How far two recorded amounts must sit apart before a change is worth putting
 * in front of somebody.
 *
 * THE DECISION, and it is a judgment call rather than anybody's instruction. A
 * one cent move is noise: it is below the granularity at which Canadian shelf
 * prices actually move, and the penny left circulation in 2013 so a cash total
 * cannot even express it. Interrupting a shopper for it teaches them that
 * Shin's notifications are not worth opening, and an ignored notification is
 * the same retention problem this module exists to fix, one step later. Ten
 * cents is the smallest move chosen here that a person standing at a shelf
 * would recognise as the price having changed.
 *
 * WHY A FLAT NUMBER AND NOT A PERCENTAGE. A percentage of a price is a rate of
 * change computed by Shin about a product, which is exactly what rule 3 keeps
 * out of this file. A flat floor is a property of money, not of the product.
 *
 * REVERSES IF: tester data shows real shelf moves clustering under a dime, in
 * which case lower it (setting it to 1 makes every recorded change tellable);
 * or the founder rules that a shopper should be told about every move whatever
 * its size, in which case delete the check and `price_change.steady` with it.
 * The floor is never exported, never returned and never shown, so changing it
 * is a one line edit with no caller to update.
 */
const NOISE_FLOOR_CENTS = 10;

const SOURCES: ReadonlySet<string> = new Set(['scan', 'cache', 'refresh']);

/** Cents are whole and not negative. Anything else is unusable, not rounded. */
function usableCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * The milliseconds an ISO 8601 timestamp names, or `null` if it names none.
 *
 * `Date.parse` alone is too forgiving across engines, so the shape is checked
 * first. A sighting whose time cannot be read cannot be ordered against the
 * others, and a history in the wrong order would produce a confident answer
 * about a direction that never happened.
 */
function timeOf(at: unknown): number | null {
  if (typeof at !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(at)) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Is this row something Shin can stand behind.
 *
 * A row failing any of these is dropped rather than repaired. Repairing it
 * would mean inventing the missing part, and the missing part is always either
 * a price or a time.
 */
function keep(s: PriceSighting): boolean {
  return (
    s !== null &&
    typeof s === 'object' &&
    usableCents(s.cents) &&
    SOURCES.has(s.source) &&
    timeOf(s.at) !== null
  );
}

/**
 * Do these two recorded amounts sit far enough apart to be worth telling.
 *
 * THE ONLY ARITHMETIC IN THIS FILE, and it is deliberately not a subtraction
 * between two prices. It takes the lower recorded amount, adds a fixed
 * constant to it, and compares. The bound exists for the length of one
 * expression and is never returned, stored or shown.
 */
function clearsNoiseFloor(a: number, b: number): boolean {
  const lower = a < b ? a : b;
  const higher = a < b ? b : a;
  return higher >= lower + NOISE_FLOOR_CENTS;
}

function stalenessOf(latestMs: number | null, nowMs: number): Staleness {
  // No usable sighting, or a clock we cannot read: nothing to rely on, so the
  // safe answer is the one that does not invite anybody to trust an old price.
  if (latestMs === null || !Number.isFinite(nowMs)) return 'stale';
  // A timestamp in the future is clock skew on a phone, not an error worth
  // punishing a shopper for. It reads as fresh; it is certainly not expired.
  if (latestMs > nowMs) return 'fresh';
  if (latestMs > nowMs - CACHE_LIFE_MS) {
    return latestMs > nowMs - REFRESH_DUE_AFTER_MS ? 'fresh' : 'aging';
  }
  return 'stale';
}

/**
 * What a saved product can say about its own price history.
 *
 * THE ORDER OF THE DECISIONS IS ITSELF A DECISION:
 *
 *   1. Drop what cannot be stood behind, so nothing downstream reasons about a
 *      price that is not a price or a time that is not a time.
 *   2. Put what is left in time order, because a direction read off an
 *      unordered list is a made up direction.
 *   3. Read the direction from the earliest kept sighting to the latest, not
 *      from the last hop. A price that fell and came back has not gone up, and
 *      telling somebody it went up because of the final step would be Shin
 *      narrating a round trip it did not observe the middle of.
 *   4. Decide whether to interrupt. A real move outranks an expiry in the
 *      message, because "it changed" is more use to a shopper than "we have
 *      not looked lately".
 *
 * `now` is a parameter so every test runs on an explicit clock and none of
 * this needs a phone, a server or a database.
 */
export function priceChangeOf(sightings: readonly PriceSighting[], now?: Date): PriceChangeView {
  const nowMs = now instanceof Date ? now.getTime() : Date.now();

  const kept = (Array.isArray(sightings) ? sightings : [])
    .filter((s) => keep(s))
    .map((s, index) => ({ s, index, ms: timeOf(s.at) as number }))
    // A tie on the timestamp falls back to the order the caller handed them
    // in, so the same history always produces the same answer.
    .sort((x, y) => (x.ms === y.ms ? x.index - y.index : x.ms - y.ms));

  const first = kept.length > 0 ? kept[0].s : null;
  const latest = kept.length > 0 ? kept[kept.length - 1].s : null;
  const latestMs = kept.length > 0 ? kept[kept.length - 1].ms : null;
  const staleness = stalenessOf(latestMs, nowMs);

  let direction: ChangeDirection = 'unknown';
  if (first !== null && latest !== null && kept.length > 1) {
    // A comparison, not a calculation. Neither amount is changed or combined.
    if (latest.cents < first.cents) direction = 'down';
    else if (latest.cents > first.cents) direction = 'up';
    else direction = 'unchanged';
  }

  const movedEnough =
    (direction === 'down' || direction === 'up') &&
    first !== null &&
    latest !== null &&
    clearsNoiseFloor(first.cents, latest.cents);

  const expired = staleness === 'stale' && kept.length > 0;
  const worthTelling = movedEnough || expired;

  let messageKey: string;
  if (kept.length === 0) messageKey = 'price_change.no_sightings';
  else if (movedEnough) messageKey = direction === 'down' ? 'price_change.down' : 'price_change.up';
  else if (expired) messageKey = 'price_change.expired';
  else if (direction === 'unknown') messageKey = 'price_change.only_one_sighting';
  else if (direction === 'unchanged') messageKey = 'price_change.unchanged';
  else messageKey = 'price_change.steady';

  return Object.freeze({
    direction,
    first,
    latest,
    sightings: kept.length,
    staleness,
    worthTelling,
    messageKey,
    // Codes, counts, the two amounts exactly as they were recorded, and the two
    // times they were recorded at. No field here is derived from another.
    messageVars: Object.freeze({
      direction,
      staleness,
      sightings: kept.length,
      firstCents: first ? first.cents : null,
      firstAt: first ? first.at : null,
      firstSource: first ? first.source : null,
      latestCents: latest ? latest.cents : null,
      latestAt: latest ? latest.at : null,
      latestSource: latest ? latest.source : null,
    }),
  });
}
