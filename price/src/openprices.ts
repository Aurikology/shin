/**
 * Open Prices (prices.openfoodfacts.org), pulled whole rather than crawled.
 *
 * This is not a seller. It is the Open Food Facts price project: people
 * photograph receipts and price tags and submit them, barcode attached. That
 * changes two things relative to walmart.ts. First, there is nothing to
 * search: the API hands back every row it has, so this file paginates a feed
 * instead of running a query per catalogue product. Second, "seller" in the
 * observation table means "who published this number", and here that is the
 * project itself, not one store, so every row is stored under the seller
 * string `openprices` with the actual shop (or "online") kept in `region`.
 *
 * MEASURED 2026-09-04/05, filtering `?currency=CAD`:
 *
 *   - 664 rows, 487 distinct barcodes, dated 2020-02-01 to 2026-08-26.
 *   - 663 of the 664 carry `type: "PRODUCT"` and a `product_code`. The other
 *     one is `type: "CATEGORY"` with `product_code: null` - a bulk price for
 *     something like "vegetables", not a priced product. It has no barcode to
 *     pad and no barcode to fail to join; it is skipped outright, not stored
 *     as an unjoined row, because `code: null` here is reserved for barcodes
 *     we could not resolve, not for rows that never had one.
 *   - Checking `pad13(product_code)` against the catalogue's own `code` column
 *     (its primary key, so this is a cheap point lookup) joins 417 of the 487
 *     distinct barcodes, 86%.
 *   - 659 of 664 rows carry `location.osm_address_country_code = "CA"`, 1 is
 *     "US", and 4 are `location.type: "ONLINE"` with no address at all (so no
 *     country and no `location_osm_id`). The 4 online rows are defaulted to
 *     country CA below because the query itself filtered on CAD, not because
 *     any location said so - that default is the one inferred field in this
 *     file and is called out here so it can be argued with.
 *   - 89 distinct `location_osm_id` values among the physical locations.
 *   - 212 of 664 rows carry `price_without_discount`, and in every one of them
 *     it is strictly greater than `price`. `price_is_discounted` and
 *     `price_without_discount` always agreed with each other in this pull;
 *     nothing here fabricates a comparison the API does not already assert.
 *
 * `joinMethod` is always `'gtin'` or `'none'`, never `'name'`: this source
 * never offers a brand-and-size fallback the way walmart.ca's search does, it
 * either carries a barcode that lands in the catalogue or it does not. `code`
 * is null exactly when it does not, per store.ts's own header; `'none'` is the
 * JoinMethod value store.ts defines and no other source has needed yet, so
 * this is a plain reading of a type that was already there, not a new
 * convention invented here.
 *
 * `crawl_attempt` is grained per catalogue product per crawl, which this feed
 * does not natively have (a barcode can appear on many rows, many days). It is
 * still recorded, once per distinct barcode seen in a run, because the whole
 * reason that table exists is so a zero can be told apart from a row nobody
 * asked about, and that applies here too: a barcode this run saw and could not
 * join is recorded `no_barcode_match`, not silently dropped from the count.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, recordAttempt } from './store.ts';
import type { JoinMethod } from './store.ts';

const CATALOGUE = new URL('../../catalogue/data/catalogue.db', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
const PRICES = new URL('../data/prices.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SELLER = 'openprices';
const API = 'https://prices.openfoodfacts.org/api/v1/prices';
const PAGE_SIZE = 100;

/** Politeness gap between page fetches. Not measured against a limit; just asked for. */
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Catalogue codes are 13 digits, zero padded. Same rule crawl.ts's pad13 uses. */
export function pad13(code: string): string {
  const digits = code.replace(/\D/g, '');
  return digits.length >= 13 ? digits.slice(-13) : digits.padStart(13, '0');
}

interface ApiLocation {
  readonly osm_address_country_code?: string | null;
  readonly type?: string;
}

interface ApiProduct {
  readonly product_name?: string | null;
  readonly brands?: string | null;
  readonly image_url?: string | null;
}

interface ApiItem {
  readonly id: number;
  readonly product_code: string | null;
  readonly product_name: string | null;
  readonly product: ApiProduct | null;
  readonly price: number;
  readonly price_is_discounted: boolean;
  readonly price_without_discount: number | null;
  readonly price_per: string | null;
  readonly currency: string;
  readonly date: string;
  readonly location_id: number | null;
  readonly location_osm_id: number | null;
  readonly location: ApiLocation | null;
}

interface ApiPage {
  readonly items: readonly ApiItem[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** One retry: this is a plain public API, not something behind bot detection like walmart.ca. */
async function fetchPage(page: number): Promise<ApiPage> {
  const url = `${API}?currency=CAD&size=${PAGE_SIZE}&page=${page}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ApiPage;
    } catch (e) {
      if (attempt === 1) throw new Error(`openprices page ${page} failed: ${String(e)}`);
      await sleep(2000);
    }
  }
  throw new Error('unreachable');
}

function cents(n: number): number {
  return Math.round(n * 100);
}

function isCatalogued(cat: DatabaseSync, code: string): boolean {
  return cat.prepare('SELECT 1 FROM product WHERE code = ?').get(code) !== undefined;
}

/**
 * The seller's own location id, kept so a price can be traced back to a shop.
 * `location_osm_id` is null exactly for the ONLINE locations that have no
 * address to look up on OpenStreetMap; those fall back to the project's own
 * internal location id instead of being recorded as national (null), because
 * they are a specific listing, not an average across the country.
 */
function regionOf(item: ApiItem): string | null {
  if (item.location_osm_id !== null && item.location_osm_id !== undefined) {
    return String(item.location_osm_id);
  }
  if (item.location_id !== null && item.location_id !== undefined) {
    return `online:${item.location_id}`;
  }
  return null;
}

async function main(): Promise<void> {
  const cat = new DatabaseSync(CATALOGUE, { readOnly: true });
  const db = openPrices(PRICES);
  const today = new Date().toISOString().slice(0, 10);

  let pulled = 0;
  let skippedNoBarcode = 0;
  let joined = 0;
  let unjoined = 0;
  let discounted = 0;
  let regularAlso = 0;
  const products = new Set<string>();
  const locations = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  /* One crawl_attempt row per barcode per run, not per price row: the table's
   * grain is "did we ask about this code today", and this feed can hand back
   * the same barcode many times in one pull. */
  const attempts = new Map<string, { candidates: number; matched: boolean }>();

  const first = await fetchPage(1);
  const pages = Math.max(1, first.pages);
  let page = 1;
  let batch: ApiPage = first;

  for (;;) {
    for (const item of batch.items) {
      pulled += 1;

      if (item.product_code === null) {
        skippedNoBarcode += 1;
        continue;
      }

      const want = pad13(item.product_code);
      const has = isCatalogued(cat, want);
      const code = has ? want : null;
      const joinMethod: JoinMethod = has ? 'gtin' : 'none';

      products.add(want);
      if (has) joined += 1;
      else unjoined += 1;

      const region = regionOf(item);
      if (region !== null) locations.add(region);

      if (minDate === null || item.date < minDate) minDate = item.date;
      if (maxDate === null || item.date > maxDate) maxDate = item.date;

      const country =
        item.location?.osm_address_country_code ??
        /* ONLINE listings carry no osm address at all. Defaulted to CA because
         * the query itself asked for currency=CAD, not because any location
         * said so - see the header. */
        'CA';

      const name = item.product_name ?? item.product?.product_name ?? '(unnamed)';
      const brand = item.product?.brands ?? null;
      const imageUrl = item.product?.image_url ?? null;
      const kind = item.price_is_discounted ? 'promotional' : 'regular';
      if (item.price_is_discounted) discounted += 1;

      recordObservation(db, {
        code,
        seller: SELLER,
        sellerSku: String(item.id),
        sellerName: name,
        sellerBrand: brand,
        priceCents: cents(item.price),
        kind,
        unitPriceCents: null,
        unitLabel: item.price_per ?? null,
        currency: item.currency,
        country,
        region,
        joinMethod,
        seenOn: item.date,
        url: null,
        imageUrl,
        inStock: 1,
      });

      /* Mirror crawl.ts's wasPrice handling: a discounted row that also names
       * its pre-discount price is two facts, and storing only the sale price
       * would make "how much cheaper" unrecoverable from this table later. */
      if (item.price_is_discounted && item.price_without_discount !== null) {
        regularAlso += 1;
        recordObservation(db, {
          code,
          seller: SELLER,
          sellerSku: `${item.id}#was`,
          sellerName: name,
          sellerBrand: brand,
          priceCents: cents(item.price_without_discount),
          kind: 'regular',
          unitPriceCents: null,
          unitLabel: item.price_per ?? null,
          currency: item.currency,
          country,
          region,
          joinMethod,
          seenOn: item.date,
          url: null,
          imageUrl,
          inStock: 1,
        });
      }

      const a = attempts.get(want) ?? { candidates: 0, matched: has };
      a.candidates += 1;
      attempts.set(want, a);
    }

    if (page >= pages) break;
    page += 1;
    await sleep(DELAY_MS);
    batch = await fetchPage(page);
  }

  for (const [code, a] of attempts) {
    recordAttempt(db, code, SELLER, today, a.matched ? 'matched' : 'no_barcode_match', a.candidates, null);
  }

  cat.close();

  console.log('');
  console.log(`  rows pulled              ${pulled}`);
  console.log(`  skipped, no barcode      ${skippedNoBarcode}  (CATEGORY rows, not products)`);
  console.log(`  joined to catalogue      ${joined}`);
  console.log(`  stored unjoined          ${unjoined}`);
  console.log(`  discounted rows          ${discounted}`);
  console.log(`  also recorded a regular  ${regularAlso}  (had price_without_discount)`);
  console.log(`  distinct products        ${products.size}`);
  console.log(`  distinct locations       ${locations.size}`);
  console.log(`  date spread              ${minDate} to ${maxDate}`);
  console.log('');
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
