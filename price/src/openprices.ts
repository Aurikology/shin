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
 * ADDED 2026-11-22, US dollars. The import now makes one pass per currency,
 * CAD then USD (`CURRENCIES`). The CAD measurements above are the 2026-09
 * snapshot and are left as measured. USD has 48,403 rows, counted 2026-11-22
 * via https://prices.openfoodfacts.org/api/v1/prices?currency=USD&size=1
 * (field `total`). Each row keeps the currency the API reports for it. The
 * ONLINE-row country default above now follows the currency the pass fetched
 * under (USD -> US, CAD -> CA, `defaultCountry`); the CAD measurements above
 * describe a CAD-only pull, where that default was always CA. A USD barcode
 * the catalogue does not hold is stored unjoined, as any other unknown one is.
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
import { openPrices, recordObservation, recordAttempt, PRICES_DB_PATH } from './store.ts';
import { requireSourceUse } from './registry.ts';
import * as settings from '../../settings/src/index.ts';
import type { JoinMethod } from './store.ts';

const CATALOGUE =
  settings.SHIN_CATALOGUE() ??
  new URL('../../catalogue/data/catalogue.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
/* PRICES_DB_PATH lives in store.ts, behind SHIN_PRICES, so every package that
 * opens this database resolves the same path the same way. */
const PRICES = PRICES_DB_PATH;

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
  readonly osm_id?: number | null;
  /** "NODE" | "WAY" | "RELATION" in practice; kept as string, not an enum, because a new OSM type is a value the API can add, not a bug in this file. */
  readonly osm_type?: string | null;
  readonly osm_name?: string | null;
  readonly osm_address_city?: string | null;
  /** e.g. "shop", "amenity", "tourism". THE FILTER below reads this. */
  readonly osm_tag_key?: string | null;
  /** e.g. "supermarket", "convenience", "house". THE FILTER below reads this. */
  readonly osm_tag_value?: string | null;
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

export interface ApiPage {
  readonly items: readonly ApiItem[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** The currencies this file imports, one pass each. A row keeps the currency the API reports for it. */
export const CURRENCIES = ['CAD', 'USD'] as const;

/**
 * The country an ONLINE row (no osm address) is given: the market of the
 * currency the pass asked for. Inferred, not read from the row, and used only
 * when the location carries no country of its own.
 */
export function defaultCountry(currency: string): string {
  return currency === 'USD' ? 'US' : 'CA';
}

export function pageUrl(currency: string, page: number): string {
  return `${API}?currency=${currency}&size=${PAGE_SIZE}&page=${page}`;
}

/** One retry: this is a plain public API, not something behind bot detection like walmart.ca. */
export async function fetchPage(currency: string, page: number): Promise<ApiPage> {
  const url = pageUrl(currency, page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      /* R35: Open Food Facts asks every client to name itself. The 400 ms gap between pages is the rate limit. */
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'Pexi-server/1.0 (grocery price scanner, Canada)', accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ApiPage;
    } catch (e) {
      if (attempt === 1) throw new Error(`openprices ${currency} page ${page} failed: ${String(e)}`);
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
 *
 * This keeps returning the bare id: the `region` column's meaning is
 * unchanged by this file's other additions. `storeOsmOf` below is the new,
 * unambiguous form, and it is what the new `store_osm` column stores.
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

/**
 * The composite OpenStreetMap id for the `store_osm` column: "<OSM_TYPE>/<id>",
 * e.g. "WAY/120689533". Node, way and relation ids are separate number spaces
 * in OpenStreetMap, so the bare id `regionOf` stores in `region` can name
 * three different places depending on which space it came from; this is the
 * form that does not have that ambiguity. Online listings have no OSM
 * location at all, so they keep the same `online:<location_id>` form as
 * `region`, for the same reason: it is a specific listing, not an average.
 */
function storeOsmOf(item: ApiItem): string | null {
  const osmType = item.location?.osm_type;
  if (item.location_osm_id !== null && item.location_osm_id !== undefined && osmType) {
    return `${osmType}/${item.location_osm_id}`;
  }
  if (item.location_id !== null && item.location_id !== undefined) {
    return `online:${item.location_id}`;
  }
  return null;
}

/**
 * Is this location somewhere a person buys the thing, as opposed to somewhere
 * they happened to be standing?
 *
 * CORRECTED 2026-09-05, same day it was written. The first version allowed
 * `osm_tag_key === 'shop'` and nothing else, chosen from a 100-LOCATION sample.
 * That sample answered the wrong question: prices are not spread evenly across
 * locations, so counting locations tells you nothing about how many prices a
 * rule withholds. Counting ROWS over the whole Canadian feed (664 rows, 7
 * pages) instead:
 *
 *   shop=supermarket        212 rows,  33 locations  Dominion, Real Canadian Superstore
 *   shop=department_store   181 rows,   9 locations  Walmart, Winners, Hudson's Bay
 *   amenity=pharmacy         95 rows,   6 locations  London Drugs, Shoppers Drug Mart
 *   highway=bus_stop         56 rows,   2 locations  8 Ave (WB) at McBride Blvd
 *   shop=greengrocer         39 rows,   1 location   Choices Market
 *   shop=wholesale           34 rows,  13 locations  Costco, Costco Business Center
 *   ... then a long tail of single-location shop=* kinds ...
 *   railway=station           4 rows,   1 location   Runnymede
 *   amenity=charging_station  1 row,    1 location   New Westminster City Hall
 *   leisure=park              1 row,    1 location   Tipperary Park
 *
 * The shop-only rule withheld 161 of those rows, and 95 of the 161 were a
 * pharmacy chain: London Drugs alone carries 146 rows in our stored table.
 * OpenStreetMap tags a pharmacy under `amenity`, not `shop`, so a real
 * retailer was being anonymised on a tagging convention. Hence the pharmacy
 * exception, which is added because the data showed it and not on principle.
 *
 * Everything still withheld is withheld correctly: somebody has geotagged 56
 * prices to a BUS STOP, four to a railway station, one to a city hall charging
 * point and one to a park. Those are places a person stood, not places that
 * sold anything, and naming one as the store would be a straightforward lie.
 *
 * Nothing is added to this list on the grounds that it sounds retail. A kind
 * earns a place by appearing in the feed with a real retailer's name against
 * it, counted in rows.
 */
function isRetail(loc: ApiLocation): boolean {
  if (loc.osm_tag_key === 'shop') return true;
  return loc.osm_tag_key === 'amenity' && loc.osm_tag_value === 'pharmacy';
}

/**
 * THE FILTER. A 100-location sample of this API on 2026-09-05 found prices
 * attached to more than shops: supermarket 69, convenience 12, furniture 3,
 * fuel 2, town 2, administrative 2, house 1, chemist 1, greengrocer 1,
 * books 1, pedestrian 1, charging_station 1, frozen_food 1, retail 1,
 * garden_centre 1. `osm_tag_key === 'shop'` is what tells those apart: a
 * price attached to a `house` (tag key "building", not "shop") is somebody's
 * home, and naming it would publish a stranger's address as a store. A price
 * attached to a `town` (tag key "place") would render as "Seen at Mount
 * Pearl, Mount Pearl" - a place, not a store, wearing its own city's name
 * twice. Non-shop rows still keep `storeOsm` (see above), so the location is
 * not lost, only the human-readable name and city are withheld.
 */
function storeNameAndCity(item: ApiItem): { storeName: string | null; storeCity: string | null } {
  const loc = item.location;
  if (!loc || !isRetail(loc)) {
    return { storeName: null, storeCity: null };
  }
  /* osm_name was present on 100 of 100 sampled locations, so a null here is a
   * guard against a hole in the data, not the expected case. */
  return {
    storeName: loc.osm_name ?? null,
    storeCity: loc.osm_address_city ?? null,
  };
}

/** Counters for one import run, shared by every currency pass. */
export interface RunTally {
  pulled: number;
  skippedNoBarcode: number;
  joined: number;
  unjoined: number;
  discounted: number;
  regularAlso: number;
  products: Set<string>;
  locations: Set<string>;
  minDate: string | null;
  maxDate: string | null;
  /* One crawl_attempt row per barcode per run, not per price row: the table's
   * grain is "did we ask about this code today", and this feed can hand back
   * the same barcode many times in one pull. */
  attempts: Map<string, { candidates: number; matched: boolean }>;
}

export function newTally(): RunTally {
  return {
    pulled: 0,
    skippedNoBarcode: 0,
    joined: 0,
    unjoined: 0,
    discounted: 0,
    regularAlso: 0,
    products: new Set(),
    locations: new Set(),
    minDate: null,
    maxDate: null,
    attempts: new Map(),
  };
}

/**
 * Store one API row. `fetchedUnder` is the currency this pass asked the API
 * for; it decides only the country of an ONLINE row (see `defaultCountry`).
 * The row's own `currency` is what gets stored, so a USD row is never relabelled.
 * A barcode the catalogue does not hold is stored unjoined (`code` null,
 * joinMethod 'none'), exactly as before.
 */
export function importItem(
  db: DatabaseSync,
  cat: DatabaseSync,
  item: ApiItem,
  fetchedUnder: string,
  t: RunTally,
): void {
  t.pulled += 1;

  if (item.product_code === null) {
    t.skippedNoBarcode += 1;
    return;
  }

  const want = pad13(item.product_code);
  const has = isCatalogued(cat, want);
  const code = has ? want : null;
  const joinMethod: JoinMethod = has ? 'gtin' : 'none';
  /* US-dollar rows that miss the catalogue keep their barcode (rejoin.ts joins them once a name arrives, and the
   * coverage script counts by it). Canadian rows are left exactly as they were: estimate.ts reads page_gtin. */
  const pageGtin = !has && fetchedUnder !== 'CAD' ? want : null;

  t.products.add(want);
  if (has) t.joined += 1;
  else t.unjoined += 1;

  const region = regionOf(item);
  if (region !== null) t.locations.add(region);
  const storeOsm = storeOsmOf(item);
  const { storeName, storeCity } = storeNameAndCity(item);

  if (t.minDate === null || item.date < t.minDate) t.minDate = item.date;
  if (t.maxDate === null || item.date > t.maxDate) t.maxDate = item.date;

  const country =
    item.location?.osm_address_country_code ??
    /* ONLINE listings carry no osm address at all. Defaulted from the currency
     * the pass fetched under (USD -> US, CAD -> CA), not because any location
     * said so - see the header. */
    defaultCountry(fetchedUnder);

  const name = item.product_name ?? item.product?.product_name ?? '(unnamed)';
  const brand = item.product?.brands ?? null;
  const imageUrl = item.product?.image_url ?? null;
  const kind = item.price_is_discounted ? 'promotional' : 'regular';
  if (item.price_is_discounted) t.discounted += 1;

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
    pageGtin,
    seenOn: item.date,
    url: null,
    imageUrl,
    /* This source photographs a price tag, not a shelf: the API carries
     * no stock field at all, so every row here is "not observed", never
     * a guessed yes. See the header and ObservationRow.inStock. */
    inStock: null,
    storeName,
    storeCity,
    storeOsm,
  });

  /* Mirror crawl.ts's wasPrice handling: a discounted row that also names
   * its pre-discount price is two facts, and storing only the sale price
   * would make "how much cheaper" unrecoverable from this table later. */
  if (item.price_is_discounted && item.price_without_discount !== null) {
    t.regularAlso += 1;
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
      pageGtin,
      seenOn: item.date,
      url: null,
      imageUrl,
      inStock: null,
      storeName,
      storeCity,
      storeOsm,
    });
  }

  const a = t.attempts.get(want) ?? { candidates: 0, matched: has };
  a.candidates += 1;
  t.attempts.set(want, a);
}

/** Write one crawl_attempt per barcode seen in the run. */
export function recordAttempts(db: DatabaseSync, t: RunTally, today: string): void {
  for (const [code, a] of t.attempts) {
    recordAttempt(db, code, SELLER, today, a.matched ? 'matched' : 'no_barcode_match', a.candidates, null);
  }
}

/**
 * WEEKLY REFRESH MARK, same idea as hammer.ts's: mac/openprices-refresh.sh writes it as its LAST step,
 * so it moves only when both currency passes finished. A stale or missing mark means a refresh failed.
 */
export const OPENPRICES_REFRESHED_KEY = 'openprices_refreshed_at';

export function markRefreshed(db: DatabaseSync, at: Date = new Date()): string {
  const iso = at.toISOString();
  db.prepare('INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)').run(OPENPRICES_REFRESHED_KEY, iso);
  return iso;
}

async function main(): Promise<void> {
  if (process.argv[2] === '--mark-refreshed') {
    const mdb = openPrices(PRICES);
    console.log(`openprices: refresh marked at ${markRefreshed(mdb)}`);
    mdb.close();
    return;
  }
  const cat =new DatabaseSync(CATALOGUE, { readOnly: true });
  const db = openPrices(PRICES, { enforceSources: true });
  // Requirement 4.8: the database refuses unregistered sellers, and no automated
  // reader runs without a recorded basis or on a source whose basis forbids one.
  requireSourceUse(db, SELLER, 'automated');
  const today = new Date().toISOString().slice(0, 10);
  const t = newTally();

  /* One pass per currency (`--currency USD` runs just that one). A failed page throws and stops the run, loudly. */
  const onlyAt = process.argv.indexOf('--currency');
  const only = onlyAt === -1 ? null : (process.argv[onlyAt + 1] ?? '').toUpperCase();
  if (only !== null && !(CURRENCIES as readonly string[]).includes(only)) {
    throw new Error(`--currency must be one of ${CURRENCIES.join(', ')}`);
  }
  for (const currency of CURRENCIES.filter((c) => only === null || c === only)) {
    const before = t.pulled;
    const first = await fetchPage(currency, 1);
    const pages = Math.max(1, first.pages);
    let page = 1;
    let batch: ApiPage = first;
    for (;;) {
      for (const item of batch.items) importItem(db, cat, item, currency, t);
      if (page >= pages) break;
      page += 1;
      await sleep(DELAY_MS);
      batch = await fetchPage(currency, page);
    }
    console.log(`  ${currency}: ${t.pulled - before} rows over ${pages} pages (API total ${first.total})`);
  }

  recordAttempts(db, t, today);
  cat.close();

  console.log('');
  console.log(`  rows pulled              ${t.pulled}`);
  console.log(`  skipped, no barcode      ${t.skippedNoBarcode}  (CATEGORY rows, not products)`);
  console.log(`  joined to catalogue      ${t.joined}`);
  console.log(`  stored unjoined          ${t.unjoined}`);
  console.log(`  discounted rows          ${t.discounted}`);
  console.log(`  also recorded a regular  ${t.regularAlso}  (had price_without_discount)`);
  console.log(`  distinct products        ${t.products.size}`);
  console.log(`  distinct locations       ${t.locations.size}`);
  console.log(`  date spread              ${t.minDate} to ${t.maxDate}`);
  console.log('');
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(`openprices: FAILED: ${String(e)}`);
    process.exit(1);
  });
}
