/**
 * THE SHELF SAMPLE: an outside yardstick for Pexi's US coverage.
 *
 * Pexi has no users yet, so coverage cannot be measured from scans, and scripts/us-coverage.mjs's top-200 list is
 * skewed to European imports. This takes a fixed random sample of products that are on US store shelves today, then
 * says what share Pexi can NAME and what share it can give a price RANGE for. Build the sample once, reuse it, and
 * rerun --measure after every data load to watch the number move.
 *
 *   node scripts/shelf-sample.mts --build --zips 90210,60601,77002 --out sample.json [--per-term 20] [--seed 7]
 *   node scripts/shelf-sample.mts --build-ca --prices <prices.db> --out sample-ca.json [--per-group 20] [--seed 7] [--sellers hammer]
 *   node scripts/shelf-sample.mts --measure --sample sample.json --catalogue <catalogue.db> --prices <prices.db> [--out <dir>]
 *
 * --build-ca is the Canadian twin of --build and touches NO network: it draws a seeded random sample of distinct barcodes from
 * Canadian store listings already in prices.db (country CA, a real barcode in `code`, default seller `hammer`: Project Hammer's
 * nine Toronto grocers), stratified by store (store_name). Project Hammer rows carry no store category, so the store is the only
 * stratum; a store_category, when a row has one, is copied onto the item as `category`. Rows Hammer stored under a twin's
 * barcode (flag hammer_matched) are left out: that barcode was not read off that store's shelf. Crawls that re-price barcodes
 * Pexi already holds (Canadian Tire, Walmart, Save-On-Foods, BCLDB) are not a frame: their barcode list is our own catalogue.
 * The sample file says market CA, so --measure then asks the scan path with country CA, currency CAD.
 *
 * --build is the only mode that touches the network (the Kroger developer API; credentials in KROGER_CLIENT_ID and
 * KROGER_CLIENT_SECRET). --measure is offline and read-only: both databases are opened read-only and their size and
 * mtime are checked unchanged at the end (the same guard as scripts/scenarios/scenario-check.mts).
 *
 * WHAT --measure ASKS. The scan path's own function, answerBarcodeFromCatalogue (app/src/catalogue-first.ts), called in
 * process the way app/server.ts calls it: the catalogue's byGtin, the prices file read-only, country US, currency USD.
 * Left out on purpose: the Claude range ask, Open Food Facts naming, the name sorter and the shoppers' picks. So
 * "named" and "range" here are what Pexi's OWN DATA gives, with no model call and no network; a real scan can do a
 * little better than this (Claude's capped range ask, Open Food Facts).
 *   named   the answer carries an identity (a catalogue row) or a store-named identity (a store prices the barcode).
 *   range   the answer carries a range whose source is not the fixed prior (the fixed prior is "no data at all").
 *
 * CIRCULARITY. The sample comes from Kroger shelves and Pexi loads Kroger prices, so a range built from Kroger's
 * own prices proves little. For a range stood on the product's own prices (basis this_product) the sellers of
 * its price rows are read and the range is flagged Kroger-only when every row is seller Kroger. A range from a
 * category pool is another product's prices: its seller mix is NOT checked here, and is counted apart.
 *
 * ASSUMPTIONS ABOUT THE KROGER TERM SEARCH (provisional, nothing here was checked against a live term search):
 *   1. GET /v1/products?filter.term=<t>&filter.locationId=<id>&filter.limit=<=50>&filter.start=<n> answers the
 *      same data[] shape parseProducts already reads (productId, upc, brand, description).
 *   2. filter.start is the number of results to skip, and a start past the end answers an empty data[] (not an
 *      error); the build then retries once from start 0.
 *   3. A product's `upc` is a 13-digit zero-padded UPC-A that passes the GS1 check; if not, the productId
 *      ("00" + the 11-digit UPC body) plus its computed check digit is used.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { canonicalCode } from '../catalogue/src/barcode.ts';
import { gs1CheckDigit } from '../price/src/plu.ts';
import { KrogerClient, SELLER as KROGER_SELLER, gs1Valid, parseLocations, parseProducts } from '../price/src/kroger-api.ts';
import type { KrogerProduct } from '../price/src/kroger-api.ts';

/* ------------------------------------------------------------------ shared */

/** About 25 everyday US grocery and household category terms. Fixed: changing it changes the yardstick. */
export const TERMS: readonly string[] = [
  'cereal', 'milk', 'yogurt', 'cheese', 'eggs', 'bread', 'coffee', 'soda', 'juice', 'water',
  'chips', 'cookies', 'crackers', 'candy', 'frozen pizza', 'ice cream', 'pasta', 'pasta sauce', 'soup', 'canned beans',
  'peanut butter', 'cereal bars', 'shampoo', 'toothpaste', 'laundry detergent', 'paper towels', 'dog food',
];

export interface SampleItem {
  code: string;
  term: string;
  /** US build only (the Kroger description); description holds the same text for every market. */
  krogerDescription?: string | null;
  description?: string | null;
  brand: string | null;
  /** Sellers whose listings this item was drawn from. Absent means Kroger (the US build). */
  sourceSellers?: string[];
  /** CA build: the row's store_category when it had one. */
  category?: string | null;
}
export interface SampleStore {
  zip: string;
  locationId: string;
  name: string | null;
  chain: string | null;
  city: string | null;
  state: string | null;
}
export interface Sample {
  /** Absent means US. */
  market?: 'US' | 'CA';
  /** What the sample was drawn from (CA build). */
  source?: string;
  /** CA build: distinct eligible barcodes per store before sampling. */
  groupSizes?: Record<string, number>;
  builtAt: string;
  seed: number;
  zips: string[];
  stores: SampleStore[];
  items: SampleItem[];
}

/** mulberry32, the same generator scripts/answer-key/run.mts uses. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/* ------------------------------------------------------------------- build */

/**
 * The canonical 13-digit barcode of a Kroger product, or null when it has no UPC. Kroger's `upc` is the code;
 * the productId ("00" + the 11-digit UPC body, no check digit) is the fallback, completed with its GS1 check digit.
 */
export function codeOfProduct(p: Pick<KrogerProduct, 'productId' | 'upc'>): string | null {
  if (p.upc === null) return null;
  const direct = canonicalCode(p.upc);
  if (gs1Valid(direct)) return direct;
  const m = /^00(\d{11})$/.exec(p.productId);
  if (!m) return null;
  const code = canonicalCode(m[1] + gs1CheckDigit(m[1]!));
  return gs1Valid(code) ? code : null;
}

/** Seeded Fisher-Yates over a copy; the input is sorted first by the caller so API order never matters. */
function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface BuildClient {
  locations(zip: string, limit: number): Promise<any>;
  searchProducts(term: string, locationId: string, limit: number, start: number): Promise<any>;
}

export interface BuildOptions {
  client: BuildClient;
  zips: readonly string[];
  terms?: readonly string[];
  perTerm?: number;
  seed?: number;
  /** Results per search call (the API allows at most 50). */
  pageSize?: number;
  /** A search starts at a seeded random offset in [0, maxStart). */
  maxStart?: number;
  now?: () => Date;
}

export async function buildSample(o: BuildOptions): Promise<Sample> {
  const terms = o.terms ?? TERMS;
  const perTerm = o.perTerm ?? 20;
  const seed = o.seed ?? 7;
  const pageSize = Math.min(50, o.pageSize ?? 50);
  const maxStart = o.maxStart ?? 200;
  const stores: SampleStore[] = [];
  for (const zip of o.zips) {
    const locs = parseLocations(await o.client.locations(zip, 1));
    const l = locs[0];
    if (l) stores.push({ zip, locationId: l.locationId, name: l.name, chain: l.chain, city: l.city, state: l.state });
  }
  if (stores.length === 0) throw new Error('no Kroger-family store found for any ZIP');

  const items: SampleItem[] = [];
  const taken = new Set<string>();
  for (const term of terms) {
    const pool = new Map<string, SampleItem>();
    for (const s of stores) {
      // One seeded start per (seed, term, store): the same sample on a rerun, whatever the other terms did.
      const start = Math.floor(rng(seed ^ hash(`${term}|${s.locationId}`))() * maxStart);
      let found = parseProducts(await o.client.searchProducts(term, s.locationId, pageSize, start));
      if (found.length === 0 && start > 0) found = parseProducts(await o.client.searchProducts(term, s.locationId, pageSize, 0));
      for (const p of found) {
        const code = codeOfProduct(p);
        if (code === null || taken.has(code) || pool.has(code)) continue;
        pool.set(code, { code, term, krogerDescription: p.description, description: p.description, brand: p.brand });
      }
    }
    const sorted = [...pool.values()].sort((a, b) => (a.code < b.code ? -1 : 1));
    for (const it of shuffled(sorted, rng(seed ^ hash(term))).slice(0, perTerm)) {
      taken.add(it.code);
      items.push(it);
    }
  }
  return { builtAt: (o.now ?? (() => new Date()))().toISOString(), seed, zips: [...o.zips], stores, items };
}

/* ---------------------------------------------------------------- build CA */

export const CA_DEFAULT_SELLERS: readonly string[] = ['hammer'];

export interface BuildCaOptions {
  pricesPath: string;
  perGroup?: number;
  seed?: number;
  /** Sellers whose Canadian listings are the frame. Default: Project Hammer only. */
  sellers?: readonly string[];
  now?: () => Date;
}

interface CaRow {
  code: string;
  seller: string;
  store_name: string | null;
  store_category: string | null;
  seller_name: string | null;
  seller_brand: string | null;
}

/** No network: reads prices.db read-only. Strata are stores (store_name, else the seller); a barcode sits in one stratum only. */
export function buildSampleCa(o: BuildCaOptions): Sample {
  const perGroup = o.perGroup ?? 20;
  const seed = o.seed ?? 7;
  const sellers = [...(o.sellers ?? CA_DEFAULT_SELLERS)].sort();
  if (!existsSync(o.pricesPath)) throw new Error(`not found: ${o.pricesPath}`);
  const db = new DatabaseSync(o.pricesPath, { readOnly: true });
  let rows: CaRow[];
  try {
    const marks = sellers.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT code, seller, store_name, store_category, seller_name, seller_brand FROM observation
          WHERE country = 'CA' AND code IS NOT NULL AND seller IN (${marks})
            AND (flags IS NULL OR flags NOT LIKE '%"hammer_matched"%')
          ORDER BY code, seller, seller_sku, seen_on`,
      )
      .all(...sellers) as unknown as CaRow[];
  } finally {
    db.close();
  }
  // stratum -> code -> first row (by the ORDER BY) plus every seller that listed it in that stratum
  const strata = new Map<string, Map<string, { row: CaRow; sellers: Set<string> }>>();
  for (const r of rows) {
    const code = canonicalCode(r.code);
    if (!gs1Valid(code)) continue; // a PLU, a short or damaged code: not a shelf barcode
    const stratum = (r.store_name ?? '').trim() || r.seller;
    const pool = strata.get(stratum) ?? new Map();
    strata.set(stratum, pool);
    const hit = pool.get(code);
    if (hit) hit.sellers.add(r.seller);
    else pool.set(code, { row: r, sellers: new Set([r.seller]) });
  }
  const groupSizes: Record<string, number> = {};
  for (const [k, pool] of [...strata].sort((a, b) => (a[0] < b[0] ? -1 : 1))) groupSizes[k] = pool.size;
  // Smallest store first, so a barcode two stores share goes to the one with fewer to give; then name.
  const order = [...strata.keys()].sort((a, b) => strata.get(a)!.size - strata.get(b)!.size || (a < b ? -1 : 1));
  const taken = new Set<string>();
  const items: SampleItem[] = [];
  for (const stratum of order) {
    const pool = [...strata.get(stratum)!].filter(([c]) => !taken.has(c)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (const [code, { row, sellers: from }] of shuffled(pool, rng(seed ^ hash(stratum))).slice(0, perGroup)) {
      taken.add(code);
      items.push({ code, term: stratum, description: row.seller_name, brand: row.seller_brand || null, sourceSellers: [...from].sort(), category: row.store_category });
    }
  }
  items.sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : a.code < b.code ? -1 : 1));
  return {
    market: 'CA',
    source: `prices.db listings, country CA, sellers ${sellers.join(',')} (Toronto-area grocers' online listings)`,
    groupSizes,
    builtAt: (o.now ?? (() => new Date()))().toISOString(),
    seed,
    zips: [],
    stores: [],
    items,
  };
}

/* ----------------------------------------------------------------- measure */

export interface MeasuredItem {
  code: string;
  term: string;
  named: boolean;
  range: boolean;
  /** The answer's range source (shin_prices, shin_estimate, ...), or null. */
  rangeSource: string | null;
  /** The range's basis (this_product, leaf_category, ...), or null. */
  rangeBasis: string | null;
  /** Sellers of this barcode's own price rows. */
  ownSellers: string[];
  /** true: a range on the product's own prices, all from the seller(s) the sample came from (Kroger for the US sample). false: own prices include another seller. null: no range, or a category-pool range (seller mix not checked). */
  sampleSourceOnly: boolean | null;
  error: string | null;
}

export interface TermStats {
  n: number;
  named: number;
  range: number;
  /** Range stood on the product's own prices and at least one price row is from a seller the sample did not come from. */
  rangeNotOnlySource: number;
  /** Range stood on the product's own prices, every row from the sample's own source seller(s): circular. */
  rangeSourceOnly: number;
  /** Range from a category pool: another product's prices, seller mix not checked. */
  rangePoolUnchecked: number;
  errors: number;
}

export interface MeasureSummary {
  measuredAt: string;
  /** Who the sample came from, for the report line ("Kroger", "hammer"). */
  sourceLabel: string;
  overall: TermStats;
  byTerm: Record<string, TermStats>;
  caveat: string;
}

export const CAVEAT =
  "Caveat: the sample is Kroger-family shelves, so it over-represents Kroger's assortment and its prices; " +
  "named/range count Pexi's own data only (no Claude ask, no Open Food Facts).";

export const CAVEAT_CA =
  "Caveat: the Canada sample is Toronto-area grocers' online listings (Project Hammer: Loblaws, No Frills, Metro, Walmart, Save-On-Foods, Sobeys, Voila, T&T, Galleria), " +
  "not a national shelf; those listings are also a Pexi price source, so read the 'not only <source>' column as the independent share; " +
  "named/range count Pexi's own data only (no Claude ask, no Open Food Facts).";

const blank = (): TermStats => ({ n: 0, named: 0, range: 0, rangeNotOnlySource: 0, rangeSourceOnly: 0, rangePoolUnchecked: 0, errors: 0 });

export function summarise(items: readonly MeasuredItem[], measuredAt: string, opts: { market?: 'US' | 'CA'; sourceLabel?: string } = {}): MeasureSummary {
  const overall = blank();
  const byTerm: Record<string, TermStats> = {};
  for (const it of items) {
    for (const t of [overall, (byTerm[it.term] ??= blank())]) {
      t.n += 1;
      if (it.named) t.named += 1;
      if (it.range) t.range += 1;
      if (it.sampleSourceOnly === false) t.rangeNotOnlySource += 1;
      if (it.sampleSourceOnly === true) t.rangeSourceOnly += 1;
      if (it.range && it.sampleSourceOnly === null) t.rangePoolUnchecked += 1;
      if (it.error) t.errors += 1;
    }
  }
  return { measuredAt, sourceLabel: opts.sourceLabel ?? 'Kroger', overall, byTerm, caveat: opts.market === 'CA' ? CAVEAT_CA : CAVEAT };
}

const pct = (a: number, n: number): string => (n === 0 ? '  -  ' : `${((100 * a) / n).toFixed(1).padStart(5)}%`);

export function formatSummary(s: MeasureSummary): string {
  const row = (label: string, t: TermStats): string =>
    `${label.padEnd(18)} ${String(t.n).padStart(4)}  named ${pct(t.named, t.n)}  range ${pct(t.range, t.n)}  range, own prices not only ${s.sourceLabel} ${pct(t.rangeNotOnlySource, t.n)}  (${s.sourceLabel}-only ${t.rangeSourceOnly}, category pool unchecked ${t.rangePoolUnchecked}${t.errors ? `, ERRORS ${t.errors}` : ''})`;
  return [row('ALL', s.overall), ...Object.keys(s.byTerm).map((k) => row(k, s.byTerm[k]!)), s.caveat].join('\n');
}

const stamp = (p: string): string => {
  try {
    const st = statSync(p);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return 'absent';
  }
};

export interface MeasureOptions {
  sample: Sample;
  cataloguePath: string;
  pricesPath: string;
  outDir?: string | null;
  now?: () => Date;
}

export interface MeasureResult {
  items: MeasuredItem[];
  summary: MeasureSummary;
  /** Non-empty means the run is not trustworthy (an input file changed). */
  failures: string[];
}

export async function measureSample(o: MeasureOptions): Promise<MeasureResult> {
  // Imported here so --build never loads the app.
  const { openCatalogueReadOnly } = await import('../catalogue/src/schema.ts');
  const { Catalogue } = await import('../catalogue/src/search.ts');
  const { defaultEmbedder } = await import('../catalogue/src/embed.ts');
  const { answerBarcodeFromCatalogue } = await import('../app/src/catalogue-first.ts');
  const { canonicalBarcode } = await import('../app/src/barcode.ts');

  for (const p of [o.cataloguePath, o.pricesPath]) if (!existsSync(p)) throw new Error(`not found: ${p}`);
  const before = new Map([o.cataloguePath, o.pricesPath].map((p) => [p, stamp(p)]));
  const cat = openCatalogueReadOnly(o.cataloguePath);
  const prices = new DatabaseSync(o.pricesPath, { readOnly: true });
  const items: MeasuredItem[] = [];
  const failures: string[] = [];
  try {
    // byGtin does no embedding; the embedder is never used (the same as app/server.ts).
    const lookup = new Catalogue(cat, defaultEmbedder()) as unknown as { byGtin(code: string): unknown };
    const sellersOf = prices.prepare('SELECT DISTINCT seller FROM observation WHERE code = ? ORDER BY seller');
    const market = o.sample.market ?? 'US';
    const asOf = (o.now ?? (() => new Date()))().toISOString().slice(0, 10);
    for (const s of o.sample.items) {
      const m: MeasuredItem = { code: s.code, term: s.term, named: false, range: false, rangeSource: null, rangeBasis: null, ownSellers: [], sampleSourceOnly: null, error: null };
      try {
        const canonical = canonicalBarcode(s.code);
        if (!canonical) throw new Error('not a barcode');
        const { answer } = await answerBarcodeFromCatalogue(canonical, { lookup, prices, catalogue: cat, country: market, currency: market === 'CA' ? 'CAD' : 'USD', asOf, region: null });
        m.named = answer.identity !== null || answer.storeIdentity !== null;
        m.rangeSource = answer.rangeSource;
        m.rangeBasis = answer.range?.basis ?? null;
        m.range = answer.range !== null && answer.rangeSource !== 'fixed_prior' && answer.range.basis !== 'fixed_prior';
        m.ownSellers = (sellersOf.all(canonical.gtin) as { seller: string }[]).map((r) => r.seller);
        const sourceSellers = s.sourceSellers ?? [KROGER_SELLER];
        if (m.range && m.rangeBasis === 'this_product') m.sampleSourceOnly = m.ownSellers.length > 0 && m.ownSellers.every((x) => sourceSellers.includes(x));
      } catch (err) {
        m.error = err instanceof Error ? err.message : String(err);
      }
      items.push(m);
    }
  } finally {
    cat.close();
    prices.close();
  }
  for (const [p, was] of before) if (stamp(p) !== was) failures.push(`an input file changed during the run: ${p}`);
  const sourceLabel = o.sample.market === 'CA' ? [...new Set(o.sample.items.flatMap((i) => i.sourceSellers ?? []))].sort().join('+') || 'sample source' : 'Kroger';
  const summary = summarise(items, (o.now ?? (() => new Date()))().toISOString(), { market: o.sample.market ?? 'US', sourceLabel });
  if (o.outDir) {
    mkdirSync(o.outDir, { recursive: true });
    writeFileSync(join(o.outDir, 'shelf-summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(o.outDir, 'shelf-items.json'), JSON.stringify(items, null, 2));
    writeFileSync(join(o.outDir, 'shelf-summary.txt'), formatSummary(summary) + '\n');
  }
  return { items, summary, failures };
}

/* --------------------------------------------------------------------- CLI */

const USAGE =
  'usage:\n' +
  '  node scripts/shelf-sample.mts --build --zips 90210,60601 --out sample.json [--per-term 20] [--seed 7]\n' +
  '  node scripts/shelf-sample.mts --build-ca --prices <db> --out sample-ca.json [--per-group 20] [--seed 7] [--sellers hammer]\n' +
  '  node scripts/shelf-sample.mts --measure --sample sample.json --catalogue <db> --prices <db> [--out <dir>]\n';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      build: { type: 'boolean', default: false }, 'build-ca': { type: 'boolean', default: false }, 'per-group': { type: 'string', default: '20' }, sellers: { type: 'string' }, measure: { type: 'boolean', default: false },
      zips: { type: 'string' }, out: { type: 'string' }, 'per-term': { type: 'string', default: '20' }, seed: { type: 'string', default: '7' },
      sample: { type: 'string' }, catalogue: { type: 'string' }, prices: { type: 'string' },
    },
  });
  if ([values.build, values['build-ca'], values.measure].filter(Boolean).length !== 1) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (values['build-ca']) {
    const perGroup = Number(values['per-group']);
    const seed = Number(values.seed);
    if (!values.out || !values.prices || !Number.isInteger(perGroup) || perGroup < 1 || !Number.isInteger(seed)) {
      process.stderr.write(USAGE);
      process.exit(2);
    }
    const sellers = values.sellers ? values.sellers.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const sample = buildSampleCa({ pricesPath: values.prices, perGroup, seed, sellers });
    writeFileSync(values.out, JSON.stringify(sample, null, 2));
    process.stdout.write(`wrote ${sample.items.length} items from ${Object.keys(sample.groupSizes ?? {}).length} stores to ${values.out}\n`);
    for (const [k, n] of Object.entries(sample.groupSizes ?? {})) process.stdout.write(`  ${k}: ${n} eligible barcodes, ${sample.items.filter((i) => i.term === k).length} sampled\n`);
    return;
  }
  if (values.build) {
    const perTerm = Number(values['per-term']);
    const seed = Number(values.seed);
    const zips = (values.zips ?? '').split(',').map((z) => z.trim()).filter(Boolean);
    if (!values.out || zips.length === 0 || !Number.isInteger(perTerm) || perTerm < 1 || !Number.isInteger(seed)) {
      process.stderr.write(USAGE);
      process.exit(2);
    }
    const clientId = process.env.KROGER_CLIENT_ID;
    const clientSecret = process.env.KROGER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      process.stderr.write('set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET\n');
      process.exit(2);
    }
    const client = new KrogerClient({ fetch: fetch as never, clientId, clientSecret, delayMs: 250 });
    const sample = await buildSample({ client, zips, perTerm, seed });
    writeFileSync(values.out, JSON.stringify(sample, null, 2));
    process.stdout.write(`wrote ${sample.items.length} items from ${sample.stores.length} stores to ${values.out}\n`);
    return;
  }
  if (!values.sample || !values.catalogue || !values.prices) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const sample = JSON.parse(readFileSync(values.sample, 'utf8')) as Sample;
  const r = await measureSample({ sample, cataloguePath: values.catalogue, pricesPath: values.prices, outDir: values.out ?? null });
  process.stdout.write(formatSummary(r.summary) + '\n');
  for (const f of r.failures) process.stderr.write(`RUN PROBLEM: ${f}\n`);
  process.exit(r.failures.length > 0 ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`shelf-sample broke: ${String(err?.stack ?? err)}\n`);
    process.exit(2);
  });
}
