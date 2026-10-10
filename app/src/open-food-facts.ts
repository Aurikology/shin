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

const cache = new Map<string, OffProduct | null>();

/** TEST ONLY. */
export function clearOffCacheForTests(): void {
  cache.clear();
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
export type OffFetch = (url: string, init: { signal: AbortSignal }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
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

  const doFetch: OffFetch = fetchDouble ?? ((url, init) => fetch(url, init) as unknown as ReturnType<OffFetch>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await doFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json`, {
      signal: controller.signal,
    });
    if (!res.ok) {
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
