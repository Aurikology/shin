/**
 * A LIVE Open Food Facts lookup by barcode, for identity only, run before the
 * paid Gemini call.
 *
 * ITEM 6 (docs/scanner-build-order-2026-09-19.md, section 6). Ruling 5
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): "Open Food Facts live is a third party; our imported
 * copy of it is us. ... A live call to Open Food Facts is not our list, so
 * it is allowed, and only for identity, never for price. The imported Open
 * Food Facts table in catalogue/ stays unconsulted on the scan path, because
 * that one is ours."
 *
 * So this file deliberately does NOT open `catalogue/data/catalogue.db` or
 * import anything from `catalogue/src/schema.ts`; it makes a real HTTP call
 * to OFF's own product API and nothing else. Its answer is used only to give
 * Gemini a head start on identity (see `server.ts`'s use of `offHint`); it is
 * never read for a price, and it never substitutes for the one Gemini call.
 *
 * OWN TIMEOUT: `OFF_TIMEOUT_MS`, an `AbortController` per request, so a slow
 * or hanging OFF endpoint cannot slow down a scan by more than that.
 *
 * OWN CACHE: identity does not change, so a hit is kept until the process
 * restarts (or is evicted for space), the same "no expiry" shape ruling 1
 * gives the repeat-scan cache and the same size-bounded FIFO eviction
 * ha-wine-cellar uses for its own barcode cache (docs/scanner-build-order-
 * 2026-09-19.md section 1, "Copy from"). Never persisted: unlike the
 * repeat-scan cache (item 1), an OFF miss or hit costs nothing to redo after
 * a restart, so there is no reason to pay for a table.
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
 * the model's job under rule 3, "the price should not come from us," which
 * this file reads broadly as "no math of ours touches what is shown"). A
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
 * The live lookup. Never throws: a timeout, a network failure, a non-2xx
 * status, or a body that will not parse as OFF's shape all come back as
 * null, which a caller already has to treat the same as "OFF has never heard
 * of this barcode" -- always an answer (rule 6) never depends on this file
 * succeeding.
 */
export async function lookupOpenFoodFacts(gtin: string): Promise<OffProduct | null> {
  if (cache.has(gtin)) return cache.get(gtin) ?? null;

  const doFetch: OffFetch = fetchDouble ?? ((url, init) => fetch(url, init) as unknown as ReturnType<OffFetch>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await doFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      cacheSet(gtin, null);
      return null;
    }
    const body = await res.json();
    const product = normalizeOffResponse(body);
    cacheSet(gtin, product);
    return product;
  } catch {
    // Timeout, abort, or a network/parse failure. Not cached: a transient
    // failure should be tried again on the next scan of the same barcode
    // rather than remembered as a permanent miss.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
