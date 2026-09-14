/**
 * Which shop is this person standing in. Plan item 11, server side.
 *
 * The product needs it for one reason: a price is only comparable to another
 * price in the same place. Until this exists, every correction a tester types
 * is a Canadian price with no shop on it, and the spine has to treat six
 * testers in three cities as one market.
 *
 * WHAT ARRIVES HERE IS A CELL, NEVER A COORDINATE, and that is the privacy
 * design rather than a detail of the encoding. The phone computes the cell
 * (client lane, item 11a) and coordinates never leave it. A cell is the
 * south-west-ish corner of a square about a kilometre across, written
 * "lat,lon" with two decimal places: "43.26,-79.92". Two decimal places of
 * latitude is 1.11 km, which is the "about one kilometre" the plan asks for,
 * and it is arithmetic a phone can do in one line with no library and no
 * geohash table that both sides have to agree on.
 *
 * THE SERVER SNAPS ANYWAY. `parseCell` rounds whatever it is handed onto the
 * 0.01 grid before anything else happens, so a client that sends six decimal
 * places has five of them thrown away here rather than stored. That is the
 * difference between a privacy promise and a privacy hope: the coarsening does
 * not depend on the client getting it right, and a client bug cannot turn the
 * scan table into a location history.
 *
 * A CELL IS NOT ANONYMOUS AND NOTHING HERE PRETENDS IT IS. A kilometre square
 * plus a repeated visit is a home or a workplace. That is exactly why the
 * consent flag gates the STORING of it (see `consent.ts`): this file can be
 * asked which shops are near a square by anyone, because the answer is a fact
 * about the world and holds nothing, and the square only ever reaches a scan
 * row when the person has said it may.
 *
 * OPENSTREETMAP THROUGH OVERPASS, and the two things that follow from that:
 * it is a live network call, and it is somebody else's free server. So the
 * fetcher is injectable (the tests hand it a fixture and this package makes no
 * network call in a test), the result is cached per cell for a day, and a
 * failure is an empty list rather than an exception. Nobody is blocked from
 * typing a price because a volunteer-run API was busy.
 *
 * ODbL. OpenStreetMap data is licensed ODbL and requires attribution wherever
 * it is shown. `app/src/attribution.ts` already carries the OSM credit, which
 * is why there is nothing to add here.
 */

/** The grid. 0.01 degrees of latitude is 1.11 km, which is the "about one kilometre". */
const CELL_DEGREES = 0.01;

/** How far around the cell centre to look for shops, in metres. */
const SEARCH_RADIUS_M = 1200;

/** At most three, because the screen offers three. Plan item 11b. */
export const STORES_OFFERED = 3;

/**
 * The shop kinds a price can be filed against.
 *
 * WHY A LIST AND NOT `["shop"]`. The bare tag was asking OpenStreetMap for
 * every retail premises within a kilometre, which in downtown Hamilton came
 * back as five car repair shops, four hairdressers, three beauty salons and a
 * shoe shop, and in downtown Montreal as nineteen clothes shops before the
 * second supermarket. Sixty is the ceiling the answer is cut at, so the noise
 * was not merely untidy: it was pushing real grocers off the end of the list
 * the shopper gets shown.
 *
 * The question this list answers is "which STORE are you standing in with a
 * grocery or a gadget in your hand". Everything here sells something Shin
 * prices. A hair salon does not, so a hair salon is not a wrong answer to
 * offer, it is a wasted row.
 *
 * `mall` is deliberately absent: a mall is the building around the shop, and
 * naming it files a price against "CF Fairview" instead of against the
 * supermarket inside it.
 */
export const SHOP_KINDS: readonly string[] = [
  // Food.
  'supermarket', 'convenience', 'greengrocer', 'butcher', 'bakery', 'deli',
  // In real use (one live Montreal row, 2026-09-14) even though the wiki steers
  // taggers to supermarket or convenience; a corner grocery is a store.
  'grocery',
  'frozen_food', 'health_food', 'dairy', 'seafood', 'confectionery', 'farm',
  'alcohol', 'beverages',
  // Everything under one roof, which is where a lot of groceries are bought.
  'department_store', 'general', 'variety_store', 'wholesale', 'kiosk',
  // Pharmacy without a dispensary. Shoppers and Jean Coutu sell groceries, and
  // OSM splits them: `shop=chemist` when there is no pharmacist,
  // `amenity=pharmacy` when there is. Shin needs both and they are tagged in
  // two different keys, which is the other half of why the old query missed.
  'chemist',
  // Tech, because the other thing that gets scanned is a gadget.
  'electronics', 'computer', 'mobile_phone', 'hifi', 'appliance',
  // Hardware, pet food.
  'hardware', 'doityourself', 'pet',
];

/**
 * The two kinds that are not tagged `shop` at all.
 *
 * `amenity=pharmacy` is the big one: every Jean Coutu, Uniprix and Pharmaprix
 * in the Montreal cell is tagged this way and none of them were reachable by a
 * query on `shop`. `amenity=marketplace` is the public market, where produce
 * has a price and a place.
 */
export const AMENITY_KINDS: readonly string[] = ['pharmacy', 'marketplace'];

/**
 * What OSM calls this place, if it is a place Shin should offer, else null.
 *
 * One function so that the query, the filter and the hint cannot drift apart:
 * a value added to the list above is asked for, kept, and namable in the same
 * edit.
 */
function kindOf(tags: Record<string, string> | undefined): string | null {
  const shop = tags?.shop;
  if (shop && SHOP_KINDS.includes(shop)) return shop;
  const amenity = tags?.amenity;
  if (amenity && AMENITY_KINDS.includes(amenity)) return amenity;
  return null;
}

export interface CoarseCell {
  /** The canonical text, always two decimal places: what gets stored. */
  readonly text: string;
  readonly lat: number;
  readonly lon: number;
}

export interface NearbyStore {
  /** OpenStreetMap type and id, e.g. "node/1234". Stable enough to store. */
  readonly id: string;
  readonly name: string;
  /** One short line to tell two branches of the same chain apart. */
  readonly hint: string;
}

/**
 * Reads a cell string, rounding it onto the grid and refusing anything that is
 * not a pair of numbers on Earth.
 *
 * Returns null rather than throwing: the input came off a query string.
 *
 * THE ROUNDING IS THE POINT, not the validation. A client sending
 * "43.2609,-79.9192" gets "43.26,-79.92" back, and that is what any caller
 * stores. `toFixed(2)` rather than arithmetic-then-stringify because a
 * float that prints as 43.260000000000005 in a database column is a cell that
 * never matches itself again.
 */
export function parseCell(raw: string | null | undefined): CoarseCell | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const snappedLat = Math.round(lat / CELL_DEGREES) * CELL_DEGREES;
  const snappedLon = Math.round(lon / CELL_DEGREES) * CELL_DEGREES;
  // Normalised through the string, not the float, so the value stored and the
  // value compared are the same characters every time.
  const text = `${snappedLat.toFixed(2)},${snappedLon.toFixed(2)}`;
  const [latText, lonText] = text.split(',');
  return { text, lat: Number(latText), lon: Number(lonText) };
}

/**
 * How far apart two points are, in metres.
 *
 * The equirectangular approximation rather than haversine, and the reason is
 * that the whole question here is "which of these three shops is nearest
 * within about a kilometre". Over that distance the two agree to well under a
 * metre, and the error a shopper would notice comes from the cell being a
 * kilometre wide, not from the trigonometry.
 */
function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const EARTH_M = 6_371_000;
  const toRad = Math.PI / 180;
  const x = (bLon - aLon) * toRad * Math.cos(((aLat + bLat) / 2) * toRad);
  const y = (bLat - aLat) * toRad;
  return Math.sqrt(x * x + y * y) * EARTH_M;
}

/**
 * The one line that tells two branches of the same chain apart.
 *
 * A list of three shops all called "No Frills" is not a choice. In order of
 * how much it helps somebody standing outside one: a street address, then the
 * neighbourhood, then what OSM calls the shop. Never the coordinates, because
 * this string goes on a screen and into a scan row.
 *
 * The last rung reads `kindOf` rather than `tags.shop`, because a pharmacy
 * carries no `shop` tag at all and "Guardian" with a blank line under it is
 * the row this whole change exists to stop being blank.
 */
export function hintFor(tags: Record<string, string>): string {
  const number = tags['addr:housenumber'];
  const street = tags['addr:street'];
  if (street) return number ? `${number} ${street}` : street;
  const place = tags['addr:suburb'] ?? tags['addr:neighbourhood'] ?? tags['addr:city'];
  if (place) return place;
  const kind = kindOf(tags);
  // "convenience" reads better as "convenience store" and "supermarket" does
  // not; OSM's values are single words and only some of them are nouns.
  if (kind) return kind === 'convenience' ? 'convenience store' : kind.replace(/_/g, ' ');
  return '';
}

/** The Overpass element shape this file reads. Everything else is ignored. */
interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/**
 * Turns an Overpass answer into at most three named shops, nearest first.
 *
 * Exported and pure, because it is the half of this file worth testing hard
 * and the half a fixture can test completely. A response that is not JSON, or
 * is JSON of the wrong shape, is an empty list: this is a third party's server
 * and "it answered something unexpected" is a normal Tuesday, not an
 * exception to raise on a request from a phone.
 *
 * UNNAMED SHOPS ARE DROPPED. OSM has plenty of them, and "which shop are you
 * in" answered with a blank line is worse than answered with a shorter list.
 *
 * SO IS ANYTHING THAT IS NOT A KIND SHIN PRICES, even though the query already
 * asks for the list. The filter is repeated here because this function is the
 * one a fixture, a cached body or a future change of query all flow through,
 * and a brewery reaching the screen because the query was edited and this was
 * not is the cheapest bug in the world to prevent.
 */
export function parseOverpass(body: string, cell: CoarseCell): NearbyStore[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const elements = (parsed as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const found: { store: NearbyStore; metres: number }[] = [];
  for (const raw of elements as OverpassElement[]) {
    const tags = raw?.tags;
    const name = tags?.name?.trim();
    if (!name) continue;
    if (!kindOf(tags)) continue;
    const lat = raw.lat ?? raw.center?.lat;
    const lon = raw.lon ?? raw.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const id = `${raw.type ?? 'node'}/${raw.id ?? 0}`;
    found.push({
      store: { id, name, hint: hintFor(tags ?? {}) },
      metres: metresBetween(cell.lat, cell.lon, lat as number, lon as number),
    });
  }
  found.sort((a, b) => a.metres - b.metres);
  return found.slice(0, STORES_OFFERED).map((f) => f.store);
}

/**
 * The Overpass query for shops around a cell centre.
 *
 * `nwr` covers nodes, ways and relations, because a supermarket is usually a
 * building (a way) and sometimes a node and occasionally a relation, and
 * asking only for nodes finds the corner shops and misses the Loblaws.
 * `out center` gives one coordinate per element whatever its geometry, which
 * is the only thing the distance sort needs.
 *
 * TWO STATEMENTS IN A UNION, because the kinds Shin needs live under two
 * different keys: most are `shop=...` and a pharmacy is `amenity=pharmacy`.
 * One regex per key is far shorter on the wire than one statement per value,
 * and it is anchored with `^` and `$` so that `shop=car_parts` cannot answer a
 * request for `farm`.
 *
 * The radius, the ten second ceiling and the sixty element cap are unchanged.
 * The cap is why the filtering matters: the old query filled all sixty slots
 * in a city centre and the noise was crowding out the grocers.
 */
export function overpassQuery(cell: CoarseCell): string {
  const where = `around:${SEARCH_RADIUS_M},${cell.lat},${cell.lon}`;
  const shops = `nwr["shop"~"^(${SHOP_KINDS.join('|')})$"](${where});`;
  const amenities = `nwr["amenity"~"^(${AMENITY_KINDS.join('|')})$"](${where});`;
  return `[out:json][timeout:10];(${shops}${amenities});out center 60;`;
}

/**
 * Fetches a body of text for a query. The seam every test uses.
 *
 * A function rather than an interface with a method, because the only thing
 * this file needs from the network is "send this query, give me the text", and
 * an injectable of exactly that shape cannot accidentally be handed a real
 * fetch by a test that forgot.
 */
export type StoreFetcher = (query: string) => Promise<string>;

const OVERPASS_URL = process.env.SHIN_OVERPASS ?? 'https://overpass-api.de/api/interpreter';

/**
 * The default fetcher, which is the only thing in this file that touches the
 * network.
 *
 * A TEN SECOND CEILING and a named User-Agent, both because Overpass is run by
 * volunteers and asks for both. The timeout is the same number the query's own
 * `[timeout:10]` carries, so the server and the client give up together rather
 * than one of them holding a socket open for a query the other abandoned.
 */
async function overpassFetch(query: string): Promise<string> {
  const stop = AbortSignal.timeout(10_000);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'user-agent': 'shin-beta (price scanner, six testers)' },
    body: query,
    signal: stop,
  });
  if (!res.ok) throw new Error(`overpass answered ${res.status}`);
  return res.text();
}

/**
 * The per-cell cache.
 *
 * A DAY, because shops do not move and the alternative is one call to a
 * volunteer-run API per scan. A cell is at most a kilometre across and six
 * testers will hit the same handful of cells all week, so this is the
 * difference between a few hundred calls a day and a few.
 *
 * NEGATIVE ANSWERS ARE CACHED TOO, for a much shorter time. A cell with no
 * shops in it is a real answer worth keeping for a few minutes; caching it for
 * a day would mean an Overpass outage at the wrong moment leaves a tester with
 * no store list until tomorrow.
 */
const CACHE_MS = 24 * 60 * 60 * 1000;
const EMPTY_CACHE_MS = 5 * 60 * 1000;
const CACHE_CEILING = 500;
const cache = new Map<string, { at: number; stores: NearbyStore[] }>();

/** TEST ONLY, and the server never calls it. Empties the per-cell cache. */
export function resetStoreCache(): void {
  cache.clear();
}

export interface StoresOptions {
  readonly fetch?: StoreFetcher;
  readonly now?: number;
}

/**
 * The nearest three named shops to a cell.
 *
 * Never throws. An Overpass failure, a timeout, an unparseable body and a cell
 * with genuinely nothing in it all come back as an empty list, because the
 * screen's answer to all four is the same: the store list is not available,
 * type the price without one. A store is a nicety on a correction; refusing
 * the correction over it would be the tail wagging the product.
 */
export async function storesNear(cell: CoarseCell, options: StoresOptions = {}): Promise<NearbyStore[]> {
  const now = options.now ?? Date.now();
  const hit = cache.get(cell.text);
  if (hit) {
    const ttl = hit.stores.length === 0 ? EMPTY_CACHE_MS : CACHE_MS;
    if (now - hit.at < ttl) return hit.stores;
  }

  let stores: NearbyStore[] = [];
  try {
    const body = await (options.fetch ?? overpassFetch)(overpassQuery(cell));
    stores = parseOverpass(body, cell);
  } catch (err) {
    // Logged, not returned. An internal string on the screen of somebody who
    // cannot act on it is not an answer (this repo's D-011), and the caller's
    // honest surface is a short list.
    console.error('the shop lookup did not answer:', err instanceof Error ? err.message : err);
    stores = [];
  }

  // Bounded, because one cache entry per cell any tester has ever stood in is
  // a leak with a nice name. Oldest out first; Map iterates in insertion order.
  if (cache.size >= CACHE_CEILING) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(cell.text, { at: now, stores });
  return stores;
}
