/**
 * A LIVE Open Food Facts lookup by barcode, for identity only, never price.
 *
 * TWO CALLERS. On the catalogue-first scan path (on by default) it is the
 * first step after a catalogue miss: RULINGS.md "A scan never ends with no
 * result" (2026-10-10), "A barcode the catalogue does not hold goes, in
 * order, to (1) a live Open Food Facts lookup by barcode, identity only,
 * free". A hit names the item, labelled as Open Food Facts, and the named item
 * takes the ordinary price ladder (`answerBarcodeFromCatalogue`). On the
 * retired Gemini path (SHIN_CATALOGUE_FIRST=0) its answer only gives Gemini a
 * head start on identity (see `server.ts`'s use of `offHint`).
 *
 * Ruling 5 (docs/decisions.md, "Nine rulings so the competitor-survey build
 * could start", 2026-09-19): "Open Food Facts live is a third party; our
 * imported copy of it is us. ... A live call to Open Food Facts is not our
 * list, so it is allowed, and only for identity, never for price." So this
 * file deliberately does NOT open `catalogue/data/catalogue.db` or import
 * anything from `catalogue/src/schema.ts`; it makes a real HTTP call to OFF's
 * own product API and nothing else, and it is never read for a price.
 *
 * OWN TIMEOUT: `OFF_TIMEOUT_MS`, an `AbortController` per request, so a slow
 * or hanging OFF endpoint cannot slow down a scan by more than that.
 *
 * OWN CACHE: identity does not change, so a hit, and a definite "OFF has no
 * such product", is kept until the process restarts (or is evicted for
 * space), the same size-bounded FIFO eviction ha-wine-cellar uses for its own
 * barcode cache (docs/scanner-build-order-2026-09-19.md section 1, "Copy
 * from"). A failure (timeout, network, a 5xx) is NOT cached, so the next scan
 * tries again. Never persisted: a lookup costs nothing to redo.
 */

export interface OffProduct {
  readonly code: string;
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
}

const OFF_TIMEOUT_MS = 4_000;
const CACHE_MAX = 2_000;

/*
 * R35, corrected 2026-11-21. Open Food Facts asks every app to name itself in its User-Agent in the
 * form AppName/Version (ContactEmail), and publishes its read limit on
 * https://openfoodfacts.github.io/openfoodfacts-server/api/ (fetched 2026-11-21), verbatim:
 *
 *   "15 req/min/IP address for all read product queries"
 *   "If these limits are reached, we reserve the right to deny you access to the website and the
 *    API through IP address ban."
 *
 * Every server lookup leaves from the one Mac address, so the whole server shares that 15 a minute.
 * (This file used to space calls for 100 a minute, a figure the review found nowhere on that page.)
 * Kept: the name and a contact are sent on every call; requests leave at least OFF_MIN_GAP_MS apart,
 * which is 12 a minute, under the 15 with headroom; a burst that would wait longer than
 * OFF_MAX_WAIT_MS gives up as a miss rather than stacking; a 429 pauses every live lookup until its
 * Retry-After has passed. A miss from any of these is "off_failed" and never cached, so the next scan
 * asks again. It never fails the shopper's answer: this lookup only runs after the catalogue has
 * missed (identity only), and the scan path carries on to the saved reading, the frame read or the
 * typed name exactly as it does for any other miss. Names already learned are answered from the cache
 * below without a call, so a barcode asked twice costs one call.
 */
export const OFF_USER_AGENT = 'Pexi-server/1.0 (grocery price scanner, Canada; usepexiapp@gmail.com)';
const OFF_MIN_GAP_MS = 5_000;
const OFF_MAX_WAIT_MS = 5_000;
const OFF_DEFAULT_PAUSE_S = 60;
const OFF_MAX_PAUSE_S = 300;
let nextSlotAt = 0;
let pausedUntil = 0;

/** Reserve the next send time; false when waiting for it would be longer than OFF_MAX_WAIT_MS. */
async function takeSlot(): Promise<boolean> {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  if (at - now > OFF_MAX_WAIT_MS) return false;
  nextSlotAt = at + OFF_MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return true;
}

const cache = new Map<string, OffProduct | null>();

/** TEST ONLY. */
export function clearOffCacheForTests(): void {
  cache.clear();
  nextSlotAt = 0;
  pausedUntil = 0;
}

function cacheSet(gtin: string, product: OffProduct | null): void {
  cache.set(gtin, product);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * FIELD NORMALIZATION. OFF's own field names, read as they are and never
 * re-derived: `product_name`, the first of a comma-separated `brands`, and
 * `quantity` as OFF prints it (Shin does no unit conversion here; that stays
 * the model's job under the rule that Shin's own math never substitutes for
 * the model's, which this file reads broadly as "no math of ours touches
 * what is shown"). A
 * response with no product, or no name, is not an identity: null.
 */
export function normalizeOffResponse(raw: unknown): OffProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const product = body.product;
  if (!product || typeof product !== 'object') return null;
  const p = product as Record<string, unknown>;
  const name = typeof p.product_name === 'string' ? p.product_name.trim() : '';
  if (!name) return null;
  const brandsField = typeof p.brands === 'string' ? p.brands.trim() : '';
  const brand = brandsField ? (brandsField.split(',')[0]?.trim() ?? null) : null;
  const size = typeof p.quantity === 'string' && p.quantity.trim() ? p.quantity.trim() : null;
  const code = typeof p.code === 'string' && p.code.trim() ? p.code.trim() : String(body.code ?? '');
  return { code, name, brand: brand || null, size };
}

/** What `fetch` looks like, narrowed to what this file uses. TEST ONLY seam. */
export type OffFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

let fetchDouble: OffFetch | null = null;

/** TEST ONLY. There is no live network call in a test run. */
export function setOffFetchForTests(fn: OffFetch | null): void {
  fetchDouble = fn;
}

/**
 * Why a lookup named nothing, for the scan path's loud log: `off_not_found`
 * is OFF saying it has no such product (or none with a name), `off_failed` is
 * OFF not answering at all (a timeout, the network, a 5xx). The two are never
 * merged: "we asked and it has nothing" is not "we could not ask".
 */
export type OffMissReason = 'off_not_found' | 'off_failed';

export type OffLookup = { readonly product: OffProduct; readonly miss: null } | { readonly product: null; readonly miss: OffMissReason; readonly detail?: string };

/** The live lookup, with the reason a miss happened. Never throws. */
export async function lookupOpenFoodFactsWithReason(gtin: string): Promise<OffLookup> {
  if (cache.has(gtin)) {
    const hit = cache.get(gtin) ?? null;
    return hit ? { product: hit, miss: null } : { product: null, miss: 'off_not_found' };
  }

  if (Date.now() < pausedUntil) {
    return { product: null, miss: 'off_failed', detail: 'Open Food Facts asked us to slow down; cooling off' };
  }
  if (!(await takeSlot())) return { product: null, miss: 'off_failed', detail: 'too many lookups queued for Open Food Facts' };

  const doFetch: OffFetch = fetchDouble ?? ((url, init) => fetch(url, init) as unknown as ReturnType<OffFetch>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await doFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json`, {
      signal: controller.signal,
      headers: { 'user-agent': OFF_USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 429) {
        const ra = Number(res.headers?.get('retry-after'));
        const secs = Number.isFinite(ra) && ra > 0 ? Math.min(ra, OFF_MAX_PAUSE_S) : OFF_DEFAULT_PAUSE_S;
        pausedUntil = Date.now() + secs * 1000;
        return { product: null, miss: 'off_failed', detail: `status 429, cooling off for ${secs} s` };
      }
      // OFF answers an unknown barcode with a 404; that is a real "no such product". Anything else is OFF failing.
      if (res.status === 404) {
        cacheSet(gtin, null);
        return { product: null, miss: 'off_not_found' };
      }
      return { product: null, miss: 'off_failed', detail: `status ${res.status}` };
    }
    const body = await res.json();
    const product = normalizeOffResponse(body);
    cacheSet(gtin, product);
    return product ? { product, miss: null } : { product: null, miss: 'off_not_found' };
  } catch (err) {
    // Timeout, abort, or a network/parse failure. Not cached: a transient
    // failure should be tried again on the next scan of the same barcode
    // rather than remembered as a permanent miss.
    return { product: null, miss: 'off_failed', detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The live lookup, as the retired Gemini path reads it: a product or null.
 * Never throws: a timeout, a network failure, a non-2xx status, or a body that
 * will not parse as OFF's shape all come back as null -- always an answer
 * (rule 6) never depends on this file succeeding.
 */
export async function lookupOpenFoodFacts(gtin: string): Promise<OffProduct | null> {
  return (await lookupOpenFoodFactsWithReason(gtin)).product;
}
