/**
 * US shelf prices from the official Kroger developer API (api.kroger.com), written 2026-11-22.
 *
 * WHAT THIS IS. An importer shaped like openprices.ts: it writes `observation` rows into prices.db through
 * store.ts's recordObservation, keyed by a 13-digit barcode, then one crawl_attempt per barcode. Unlike Open
 * Prices it is queried, not paged: for each ZIP it finds the nearest Kroger-family stores, then asks each
 * store for the prices of a list of barcodes. One observation per (barcode, store) per day.
 *
 * EVERYTHING ABOUT THE API'S SHAPE IS PROVISIONAL. Written from the public documentation, with no credentials
 * and no network call made; nothing here has been checked against a real response. The parsing sits behind small
 * pure functions (`parseLocations`, `parseProducts`, `productIdsFor`, `barcodeOf`) with fixture tests, so a shape
 * the real API turns out to have differently is a one-function fix. The assumptions, all unverified:
 *
 *   1. Token: POST /v1/connect/oauth2/token, Basic auth (clientId:clientSecret), form body
 *      grant_type=client_credentials&scope=product.compact, answer {access_token, expires_in, token_type}.
 *   2. Locations: GET /v1/locations?filter.zipCode.near=<zip>&filter.limit=<n> answers data[] of
 *      {locationId, chain, name, address{addressLine1, city, state, zipCode}}, nearest first.
 *   3. Products: GET /v1/products?filter.productId=<id,id,...>&filter.locationId=<id> answers data[] of
 *      {productId, upc, brand, description, items[{itemId, price{regular, promo}, size, soldBy, inventory?}]}.
 *      A price appears only when a locationId is sent. Prices are dollars as JSON numbers; a promo of 0 or
 *      null means no promotion. At most 50 ids per call (BATCH_IDS).
 *   4. productId is a 13-digit zero-padded code, but WHICH code is not known. Two candidates (`IdForm`):
 *      'gtin' = the 13-digit GTIN itself; 'body' = "00" + the 11-digit UPC-A body WITHOUT its check digit.
 *      Evidence for 'body' is in this repo: kroger-names.ts read a 2022 Kroger product file where 98,257 of
 *      102,603 product_ids were "00" + 11 digits, and appending the UPC check digit gave codes Open Food Facts
 *      knows. Whether the API's productId is the same id is NOT checked. The default 'both' sends both candidates
 *      in one request (half as many barcodes per call) and matches the answer back through the exact id that
 *      was asked for, so it works whichever is right. Pass --id-form gtin|body once the real shape is known.
 *   5. Stock: an item's `inventory.stockLevel` is used when present (HIGH/LOW -> 1, TEMPORARILY_OUT_OF_STOCK ->
 *      0); otherwise in_stock stays NULL. The product.compact scope may not return it at all.
 *   6. Order of locations is nearest first, so "the nearest N" is the first N returned.
 *
 * CONVENTIONS COPIED FROM openprices.ts. A sale is two rows: the sale price as kind 'promotional' (with
 * was_cents and is_sale set) and the pre-sale price as kind 'regular' under sku `<sku>#was`. With no sale there
 * is one 'regular' row. Seller string `Kroger`; the actual banner (Ralphs, Fred Meyer, ...) is in store_name,
 * the state in region. Currency USD, country US. in_stock NULL unless the API says. A barcode the catalogue does
 * not hold is stored unjoined with its barcode kept in page_gtin (as openprices does for USD), so rejoin.ts can
 * join it later. IDEMPOTENT: recordObservation upserts on (seller, seller_sku, seen_on) and the sku is
 * `<locationId>:<productId>`, so a second run the same day rewrites the same rows.
 *
 * NEVER WRITTEN, each counted in the tally: a barcode failing the GS1 check digit, a product with no price, a
 * non-positive or non-finite price, a missing currency, a product the request did not ask for.
 *
 * SECRETS. Read from environment variables (names configurable, defaults KROGER_CLIENT_ID and
 * KROGER_CLIENT_SECRET), kept in memory only, never printed. Error messages carry a status and a path, never a
 * header or a token. Missing credentials stop the run before any request.
 *
 * LIMITS. About 10,000 product calls a day: a polite delay, --max-calls (product calls), and a stop on HTTP 429
 * or on repeated 5xx. A stop keeps the rows already written, records no "nothing found" attempt for unfinished
 * barcodes, and exits non-zero.
 *
 * REGISTRY. The seller is registered at run time (as hammer.ts does) with basis 'unknown': Kroger's developer
 * terms have NOT been read in this repo, and no automated-use permission is recorded. Read them and append a
 * dated 'terms' entry before relying on this source.
 *
 *   node price/src/kroger-api.ts --zips 90210,60601,77002 [--codes <file> | --top200] [--db <prices.db>]
 *        [--catalogue <catalogue.db>] [--stores-per-zip 2] [--max-calls 500] [--id-form both|gtin|body]
 *        [--delay-ms 250] [--client-id-env NAME] [--client-secret-env NAME] [--dry-run]
 */

import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { canonicalCode } from '../../catalogue/src/barcode.ts';
import { openPrices, recordObservation, recordAttempt, PRICES_DB_PATH } from './store.ts';
import type { ObservationRow } from './store.ts';
import { registerSource, requireSourceUse, currentRegistry } from './registry.ts';
import * as settings from '../../settings/src/index.ts';

export const SELLER = 'Kroger';
export const API_BASE = 'https://api.kroger.com/v1';
export const TOKEN_PATH = '/connect/oauth2/token';
export const SCOPE = 'product.compact';
/** The documented ceiling for filter.productId. */
export const BATCH_IDS = 50;
export const DEFAULT_ID_ENV = 'KROGER_CLIENT_ID';
export const DEFAULT_SECRET_ENV = 'KROGER_CLIENT_SECRET';

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ barcodes */

/** True when `code` is 13 digits and its GS1 check digit is right. Pass a canonicalCode() result. */
export function gs1Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/** The canonical 13-digit barcode, or null when the text is not a barcode or fails the check digit. */
export function validBarcode(raw: string): string | null {
  const c = canonicalCode(raw.trim());
  return gs1Valid(c) ? c : null;
}

export type IdForm = 'both' | 'gtin' | 'body';

/**
 * The productId spellings to ask Kroger for one canonical barcode (assumption 4). 'gtin' is the 13 digits as
 * they stand; 'body' is "00" + the 11-digit UPC-A body without its check digit, and exists only for a
 * zero-led (UPC-A) barcode. Duplicates collapse.
 */
export function productIdsFor(code13: string, form: IdForm): string[] {
  const out: string[] = [];
  if (form === 'gtin' || form === 'both') out.push(code13);
  if ((form === 'body' || form === 'both') && code13.startsWith('0')) out.push(`00${code13.slice(1, 12)}`);
  return [...new Set(out)];
}

/**
 * The barcode a returned product is for. The exact productId that was asked for wins (`asked` maps each
 * requested productId to its barcode); failing that, the product's own `upc` when it is a valid barcode.
 * Null when neither says.
 */
export function barcodeOf(p: { productId: string; upc: string | null }, asked: ReadonlyMap<string, string>): string | null {
  const direct = asked.get(p.productId);
  if (direct !== undefined) return direct;
  if (p.upc !== null) return validBarcode(p.upc);
  return null;
}

/** Barcodes from a text file: one per line, # comments allowed (the format of scripts/data/us-top-200.txt). */
export function parseCodeList(text: string): { codes: string[]; invalid: string[] } {
  const codes: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const c = validBarcode(line);
    if (c === null) invalid.push(line);
    else if (!seen.has(c)) {
      seen.add(c);
      codes.push(c);
    }
  }
  return { codes, invalid };
}

/* ------------------------------------------------------------ parsing (pure; assumptions 2, 3, 5) */

export interface KrogerLocation {
  readonly locationId: string;
  readonly chain: string | null;
  readonly name: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function parseLocations(body: unknown): KrogerLocation[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: KrogerLocation[] = [];
  for (const d of data) {
    const o = d as Record<string, any>;
    const id = str(o?.locationId) ?? (typeof o?.locationId === 'number' ? String(o.locationId) : null);
    if (id === null) continue;
    out.push({
      locationId: id,
      chain: str(o.chain),
      name: str(o.name),
      city: str(o.address?.city),
      state: str(o.address?.state),
      zip: str(o.address?.zipCode),
    });
  }
  return out;
}

export interface KrogerProduct {
  readonly productId: string;
  readonly upc: string | null;
  readonly brand: string | null;
  readonly description: string | null;
  /** Dollars as the API states them; null when absent or not a finite number. */
  readonly regular: number | null;
  readonly promo: number | null;
  /** 1 / 0 only when the API states a stock level, else null. */
  readonly inStock: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function stockOf(item: any): number | null {
  const level = str(item?.inventory?.stockLevel)?.toUpperCase();
  if (level === undefined || level === null) return null;
  if (level === 'HIGH' || level === 'LOW') return 1;
  if (level === 'TEMPORARILY_OUT_OF_STOCK') return 0;
  return null;
}

/** One entry per product; the first item that carries a numeric regular price supplies the prices. */
export function parseProducts(body: unknown): KrogerProduct[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: KrogerProduct[] = [];
  for (const d of data) {
    const o = d as Record<string, any>;
    const productId = str(o?.productId);
    if (productId === null) continue;
    const items: any[] = Array.isArray(o.items) ? o.items : [];
    const priced = items.find((i) => num(i?.price?.regular) !== null) ?? items[0];
    out.push({
      productId,
      upc: str(o.upc),
      brand: str(o.brand),
      description: str(o.description),
      regular: num(priced?.price?.regular),
      promo: num(priced?.price?.promo),
      inStock: stockOf(priced),
    });
  }
  return out;
}

/* ------------------------------------------------------------ rows */

export interface RunTally {
  zips: number;
  locations: number;
  inputBarcodes: number;
  skippedBadBarcode: number;
  productCalls: number;
  productsReturned: number;
  skippedUnrequested: number;
  skippedNoPrice: number;
  skippedBadPrice: number;
  skippedNoCurrency: number;
  rows: number;
  observations: number;
  joined: number;
  unjoined: number;
  onSale: number;
  /** barcode -> priced at any location this run. */
  priced: Set<string>;
  stopped: string | null;
}

export function newTally(): RunTally {
  return {
    zips: 0, locations: 0, inputBarcodes: 0, skippedBadBarcode: 0, productCalls: 0, productsReturned: 0,
    skippedUnrequested: 0, skippedNoPrice: 0, skippedBadPrice: 0, skippedNoCurrency: 0, rows: 0,
    observations: 0, joined: 0, unjoined: 0, onSale: 0, priced: new Set(), stopped: null,
  };
}

const cents = (dollars: number): number => Math.round(dollars * 100);

/**
 * The row(s) for one product at one store, or null with the reason counted in `t`. Pure apart from the tally.
 * `has` says whether the catalogue holds a barcode.
 */
export function rowsFor(
  p: KrogerProduct,
  barcode: string,
  loc: KrogerLocation,
  today: string,
  has: (code: string) => boolean,
  t: RunTally,
  currency: string = 'USD',
): ObservationRow[] | null {
  if (!currency) {
    t.skippedNoCurrency += 1;
    return null;
  }
  if (p.regular === null) {
    t.skippedNoPrice += 1;
    return null;
  }
  const regularCents = cents(p.regular);
  if (!(regularCents > 0)) {
    t.skippedBadPrice += 1;
    return null;
  }
  const promoCents = p.promo !== null && p.promo > 0 ? cents(p.promo) : null;
  const sale = promoCents !== null && promoCents > 0 && promoCents < regularCents;

  const catalogued = has(barcode);
  const sku = `${loc.locationId}:${p.productId}`;
  const base = {
    code: catalogued ? barcode : null,
    seller: SELLER,
    sellerName: p.description ?? '(unnamed)',
    sellerBrand: p.brand,
    unitPriceCents: null,
    unitLabel: null,
    currency,
    country: 'US',
    region: loc.state,
    joinMethod: catalogued ? ('gtin' as const) : ('none' as const),
    pageGtin: catalogued ? null : barcode,
    seenOn: today,
    url: null,
    imageUrl: null,
    inStock: p.inStock,
    storeName: loc.name ?? loc.chain,
    storeCity: loc.city,
    storeOsm: null,
  };
  if (!sale) return [{ ...base, sellerSku: sku, priceCents: regularCents, kind: 'regular' }];
  return [
    { ...base, sellerSku: sku, priceCents: promoCents!, kind: 'promotional', wasCents: regularCents, isSale: 1 },
    { ...base, sellerSku: `${sku}#was`, priceCents: regularCents, kind: 'regular' },
  ];
}

/* ------------------------------------------------------------ HTTP client */

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;

/** `kind` says why the run must stop. */
export class KrogerError extends Error {
  readonly kind: 'config' | 'auth' | 'rate_limit' | 'server' | 'http' | 'shape';
  constructor(kind: 'config' | 'auth' | 'rate_limit' | 'server' | 'http' | 'shape', message: string) {
    super(message);
    this.name = 'KrogerError';
    this.kind = kind;
  }
}

export interface ClientOptions {
  readonly fetch: FetchLike;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly delayMs?: number;
  readonly retries?: number;
  readonly now?: () => number;
}

/** The token request, split out so a test can see its exact shape. */
export function tokenRequest(clientId: string, clientSecret: string): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  return {
    url: `${API_BASE}${TOKEN_PATH}`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }).toString(),
    },
  };
}

export class KrogerClient {
  private token: string | null = null;
  private expiresAt = 0;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly o: ClientOptions;
  constructor(o: ClientOptions) {
    this.o = o;
    this.sleep = o.sleep ?? sleepReal;
    this.now = o.now ?? Date.now;
  }

  private async fetchToken(): Promise<void> {
    const req = tokenRequest(this.o.clientId, this.o.clientSecret);
    const res = await this.o.fetch(req.url, req.init);
    if (res.status === 429) throw new KrogerError('rate_limit', 'Kroger token endpoint answered HTTP 429');
    if (!res.ok) throw new KrogerError('auth', `Kroger token request failed: HTTP ${res.status} (check the client id and secret)`);
    const j = await res.json();
    if (typeof j?.access_token !== 'string' || j.access_token === '') throw new KrogerError('shape', 'Kroger token answer had no access_token');
    this.token = j.access_token;
    const secs = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 1800;
    this.expiresAt = this.now() + Math.max(0, secs - 60) * 1000;
  }

  /** GET a path under /v1 with a bearer token; refreshes once on 401, retries 5xx, stops on 429. */
  async get(pathAndQuery: string): Promise<any> {
    const maxTries = this.o.retries ?? 3;
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      if (this.token === null || this.now() >= this.expiresAt) await this.fetchToken();
      if (this.o.delayMs) await this.sleep(this.o.delayMs);
      const res = await this.o.fetch(`${API_BASE}${pathAndQuery}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      });
      const where = pathAndQuery.split('?')[0];
      if (res.status === 429) throw new KrogerError('rate_limit', `Kroger answered HTTP 429 (rate limit) on ${where}`);
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        this.token = null;
        attempt--;
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= maxTries) throw new KrogerError('server', `Kroger answered HTTP ${res.status} ${maxTries} times in a row on ${where}`);
        await this.sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (!res.ok) throw new KrogerError('http', `Kroger answered HTTP ${res.status} on ${where}`);
      return res.json();
    }
  }

  locations(zip: string, limit: number): Promise<any> {
    return this.get(`/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=${limit}`);
  }

  products(productIds: readonly string[], locationId: string): Promise<any> {
    return this.get(`/products?filter.productId=${productIds.map(encodeURIComponent).join(',')}&filter.locationId=${encodeURIComponent(locationId)}`);
  }
}

/* ------------------------------------------------------------ the run */

export interface RunOptions {
  readonly client: Pick<KrogerClient, 'locations' | 'products'>;
  readonly codes: readonly string[];
  readonly zips: readonly string[];
  readonly storesPerZip: number;
  readonly idForm: IdForm;
  readonly maxCalls: number;
  readonly today: string;
  readonly has: (code: string) => boolean;
  /** Where a row goes: recordObservation for a real run, a printer for --dry-run. */
  readonly sink: (row: ObservationRow, loc: KrogerLocation, barcode: string) => void;
  /** Real runs only: crawl_attempt per barcode at the end. */
  readonly attempt?: (code: string, outcome: 'matched' | 'no_barcode_match' | 'no_candidates', note: string | null) => void;
}

/** Runs to the end, the call cap, or a stop. Never throws for an API stop: the reason is in `tally.stopped`. */
export async function runKroger(o: RunOptions): Promise<RunTally> {
  const t = newTally();
  t.inputBarcodes = o.codes.length;
  const perBatch = o.idForm === 'both' ? Math.floor(BATCH_IDS / 2) : BATCH_IDS;
  const seenLoc = new Set<string>();
  let completed = true;
  try {
    for (const zip of o.zips) {
      t.zips += 1;
      const found = parseLocations(await o.client.locations(zip, Math.max(o.storesPerZip, 1)));
      for (const loc of found.slice(0, o.storesPerZip)) {
        if (seenLoc.has(loc.locationId)) continue;
        seenLoc.add(loc.locationId);
        t.locations += 1;
        for (let i = 0; i < o.codes.length; i += perBatch) {
          if (t.productCalls >= o.maxCalls) {
            t.stopped = `--max-calls ${o.maxCalls} reached`;
            completed = false;
            throw new StopRun();
          }
          const batch = o.codes.slice(i, i + perBatch);
          const asked = new Map<string, string>();
          for (const c of batch) for (const id of productIdsFor(c, o.idForm)) asked.set(id, c);
          t.productCalls += 1;
          const products = parseProducts(await o.client.products([...asked.keys()], loc.locationId));
          for (const p of products) {
            t.productsReturned += 1;
            const barcode = barcodeOf(p, asked);
            if (barcode === null || !batch.includes(barcode)) {
              t.skippedUnrequested += 1;
              continue;
            }
            const rows = rowsFor(p, barcode, loc, o.today, o.has, t);
            if (rows === null) continue;
            t.priced.add(barcode);
            t.observations += 1;
            if (o.has(barcode)) t.joined += 1;
            else t.unjoined += 1;
            if (rows.length > 1) t.onSale += 1;
            for (const r of rows) {
              o.sink(r, loc, barcode);
              t.rows += 1;
            }
          }
        }
      }
    }
  } catch (e) {
    completed = false;
    if (e instanceof StopRun) {
      /* the cap; t.stopped is set */
    } else if (e instanceof KrogerError) {
      t.stopped = e.message;
    } else throw e;
  }
  if (o.attempt) {
    for (const c of o.codes) {
      if (t.priced.has(c)) o.attempt(c, o.has(c) ? 'matched' : 'no_barcode_match', null);
      else if (completed) o.attempt(c, 'no_candidates', `no price at ${t.locations} Kroger store(s)`);
    }
  }
  return t;
}

class StopRun extends Error {}

/** Exit code: 0 finished, 0 on the requested cap (loudly marked incomplete), 1 on any other stop. */
export function exitCodeFor(t: RunTally): number {
  if (t.stopped === null) return 0;
  return t.stopped.startsWith('--max-calls') ? 0 : 1;
}

export function ensureRegistered(db: DatabaseSync): void {
  if (currentRegistry(db).some((e) => e.seller === SELLER && e.access === 'automated')) return;
  registerSource(db, {
    seller: SELLER,
    access: 'automated',
    basis: 'unknown',
    evidence:
      'Kroger developer API (api.kroger.com), used with the owner\'s own developer credentials. Its developer terms have not been read in this ' +
      'repo and nothing recorded says whether automated use at this volume is permitted; read them and append a dated terms entry.',
    evidenceUrl: 'https://developer.kroger.com',
    readOn: null,
    automated: 'not_recorded',
    cite: 'price/src/kroger-api.ts header (REGISTRY)',
  });
}

export function printTally(t: RunTally, dryRun: boolean): string[] {
  const l = [
    '',
    `  zips asked               ${t.zips}`,
    `  stores used              ${t.locations}`,
    `  barcodes given           ${t.inputBarcodes}`,
    `  skipped, bad barcode     ${t.skippedBadBarcode}  (not 13 digits after canonicalising, or GS1 check digit wrong)`,
    `  product calls            ${t.productCalls}`,
    `  products returned        ${t.productsReturned}`,
    `  skipped, not requested   ${t.skippedUnrequested}`,
    `  skipped, no price        ${t.skippedNoPrice}`,
    `  skipped, bad price       ${t.skippedBadPrice}  (zero, negative or not a number)`,
    `  skipped, no currency     ${t.skippedNoCurrency}`,
    `  priced (barcode, store)  ${t.observations}  (joined ${t.joined}, unjoined ${t.unjoined}, on sale ${t.onSale})`,
    `  rows ${dryRun ? 'that would be written' : 'written'}    ${t.rows}`,
    `  distinct barcodes priced ${t.priced.size}`,
  ];
  if (t.stopped !== null) l.push(`  STOPPED EARLY: ${t.stopped}`);
  return l;
}

/* ------------------------------------------------------------ CLI */

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

const USAGE =
  'usage: node price/src/kroger-api.ts --zips <zip,zip,...> [--codes <file> | --top200] [--db <prices.db>] [--catalogue <catalogue.db>] ' +
  '[--stores-per-zip 2] [--max-calls 500] [--id-form both|gtin|body] [--delay-ms 250] [--client-id-env NAME] [--client-secret-env NAME] [--dry-run]';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const zips = (arg(argv, '--zips') ?? '').split(',').map((z) => z.trim()).filter(Boolean);
  if (zips.length === 0) throw new Error(`--zips is required. ${USAGE}`);
  for (const z of zips) if (!/^\d{5}$/.test(z)) throw new Error(`--zips: "${z}" is not a 5-digit US ZIP`);
  const form = (arg(argv, '--id-form') ?? 'both') as IdForm;
  if (!['both', 'gtin', 'body'].includes(form)) throw new Error('--id-form must be both, gtin or body');
  const intArg = (name: string, dflt: number): number => {
    const v = arg(argv, name);
    if (v === undefined) return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative whole number`);
    return n;
  };

  const idEnv = arg(argv, '--client-id-env') ?? DEFAULT_ID_ENV;
  const secretEnv = arg(argv, '--client-secret-env') ?? DEFAULT_SECRET_ENV;
  const clientId = process.env[idEnv];
  const clientSecret = process.env[secretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`Kroger credentials missing: set the environment variables ${idEnv} and ${secretEnv} (nothing was requested)`);
  }

  /* --top200 (also the default with no --codes) reads the list scripts/us-coverage.mjs saved. */
  const codesPath = argv.includes('--top200') || arg(argv, '--codes') === undefined
    ? new URL('../../scripts/data/us-top-200.txt', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    : arg(argv, '--codes');
  if (!codesPath || !existsSync(codesPath)) throw new Error(`barcode list not found: ${codesPath}`);
  const { codes, invalid } = parseCodeList(readFileSync(codesPath, 'utf8'));

  const catPath =
    arg(argv, '--catalogue') ??
    settings.SHIN_CATALOGUE() ??
    new URL('../../catalogue/data/catalogue.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  let cat: DatabaseSync | null = null;
  if (existsSync(catPath)) cat = new DatabaseSync(catPath, { readOnly: true });
  else if (!dry) throw new Error(`catalogue not found: ${catPath} (pass --catalogue)`);
  else console.log(`kroger-api: no catalogue at ${catPath}; every barcode is shown as unjoined`);
  const lookup = cat?.prepare('SELECT 1 FROM product WHERE code = ?');
  const has = (code: string): boolean => lookup?.get(code) !== undefined;

  const db = dry ? null : openPrices(arg(argv, '--db') ?? PRICES_DB_PATH, { enforceSources: true });
  if (db) {
    ensureRegistered(db);
    requireSourceUse(db, SELLER, 'automated');
  }
  const today = new Date().toISOString().slice(0, 10);

  const client = new KrogerClient({
    fetch: fetch as unknown as FetchLike,
    clientId,
    clientSecret,
    delayMs: intArg('--delay-ms', 250),
  });
  const t = await runKroger({
    client,
    codes,
    zips,
    storesPerZip: intArg('--stores-per-zip', 2),
    idForm: form,
    maxCalls: intArg('--max-calls', 500),
    today,
    has,
    sink: (row, loc, barcode) => {
      if (db) recordObservation(db, row);
      else console.log(`  would write ${loc.locationId} ${barcode} ${row.kind.padEnd(11)} $${(row.priceCents / 100).toFixed(2)} ${row.storeName ?? ''} ${row.storeCity ?? ''} ${row.region ?? ''}`);
    },
    attempt: db ? (code, outcome, note) => recordAttempt(db, code, SELLER, today, outcome, 1, note) : undefined,
  });
  t.skippedBadBarcode += invalid.length;
  for (const line of printTally(t, dry)) console.log(line);
  cat?.close();
  db?.close();
  const code = exitCodeFor(t);
  if (t.stopped !== null) console.error(`kroger-api: ${code === 0 ? 'INCOMPLETE' : 'FAILED'}: ${t.stopped}`);
  process.exit(code);
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(`kroger-api: FAILED: ${String(e instanceof Error ? e.message : e)}`);
    process.exit(1);
  });
}
