/**
 * THE SHELF SAMPLE: an outside yardstick for Pexi's US coverage.
 *
 * Pexi has no users yet, so coverage cannot be measured from scans, and scripts/us-coverage.mjs's top-200 list is
 * skewed to European imports. This takes a fixed random sample of products that are on US store shelves today, then
 * says what share Pexi can NAME and what share it can give a price RANGE for. Build the sample once, reuse it, and
 * rerun --measure after every data load to watch the number move.
 *
 *   node scripts/shelf-sample.mts --build --zips 90210,60601,77002 --out sample.json [--per-term 20] [--seed 7]
 *   node scripts/shelf-sample.mts --measure --sample sample.json --catalogue <catalogue.db> --prices <prices.db> [--out <dir>]
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
  krogerDescription: string | null;
  brand: string | null;
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
        pool.set(code, { code, term, krogerDescription: p.description, brand: p.brand });
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
  /** true: a range on the product's own prices, all from Kroger. false: own prices include another seller. null: no range, or a category-pool range (seller mix not checked). */
  krogerOnly: boolean | null;
  error: string | null;
}

export interface TermStats {
  n: number;
  named: number;
  range: number;
  /** Range stood on the product's own prices and at least one price row is from a seller other than Kroger. */
  rangeNotOnlyKroger: number;
  rangeKrogerOnly: number;
  /** Range from a category pool: another product's prices, seller mix not checked. */
  rangePoolUnchecked: number;
  errors: number;
}

export interface MeasureSummary {
  measuredAt: string;
  overall: TermStats;
  byTerm: Record<string, TermStats>;
  caveat: string;
}

export const CAVEAT =
  "Caveat: the sample is Kroger-family shelves, so it over-represents Kroger's assortment and its prices; " +
  "named/range count Pexi's own data only (no Claude ask, no Open Food Facts).";

const blank = (): TermStats => ({ n: 0, named: 0, range: 0, rangeNotOnlyKroger: 0, rangeKrogerOnly: 0, rangePoolUnchecked: 0, errors: 0 });

export function summarise(items: readonly MeasuredItem[], measuredAt: string): MeasureSummary {
  const overall = blank();
  const byTerm: Record<string, TermStats> = {};
  for (const it of items) {
    for (const t of [overall, (byTerm[it.term] ??= blank())]) {
      t.n += 1;
      if (it.named) t.named += 1;
      if (it.range) t.range += 1;
      if (it.krogerOnly === false) t.rangeNotOnlyKroger += 1;
      if (it.krogerOnly === true) t.rangeKrogerOnly += 1;
      if (it.range && it.krogerOnly === null) t.rangePoolUnchecked += 1;
      if (it.error) t.errors += 1;
    }
  }
  return { measuredAt, overall, byTerm, caveat: CAVEAT };
}

const pct = (a: number, n: number): string => (n === 0 ? '  -  ' : `${((100 * a) / n).toFixed(1).padStart(5)}%`);

export function formatSummary(s: MeasureSummary): string {
  const row = (label: string, t: TermStats): string =>
    `${label.padEnd(18)} ${String(t.n).padStart(4)}  named ${pct(t.named, t.n)}  range ${pct(t.range, t.n)}  range, own prices not only Kroger ${pct(t.rangeNotOnlyKroger, t.n)}  (Kroger-only ${t.rangeKrogerOnly}, category pool unchecked ${t.rangePoolUnchecked}${t.errors ? `, ERRORS ${t.errors}` : ''})`;
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
    const asOf = (o.now ?? (() => new Date()))().toISOString().slice(0, 10);
    for (const s of o.sample.items) {
      const m: MeasuredItem = { code: s.code, term: s.term, named: false, range: false, rangeSource: null, rangeBasis: null, ownSellers: [], krogerOnly: null, error: null };
      try {
        const canonical = canonicalBarcode(s.code);
        if (!canonical) throw new Error('not a barcode');
        const { answer } = await answerBarcodeFromCatalogue(canonical, { lookup, prices, catalogue: cat, country: 'US', currency: 'USD', asOf, region: null });
        m.named = answer.identity !== null || answer.storeIdentity !== null;
        m.rangeSource = answer.rangeSource;
        m.rangeBasis = answer.range?.basis ?? null;
        m.range = answer.range !== null && answer.rangeSource !== 'fixed_prior' && answer.range.basis !== 'fixed_prior';
        m.ownSellers = (sellersOf.all(canonical.gtin) as { seller: string }[]).map((r) => r.seller);
        if (m.range && m.rangeBasis === 'this_product') m.krogerOnly = m.ownSellers.length > 0 && m.ownSellers.every((x) => x === KROGER_SELLER);
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
  const summary = summarise(items, (o.now ?? (() => new Date()))().toISOString());
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
  '  node scripts/shelf-sample.mts --measure --sample sample.json --catalogue <db> --prices <db> [--out <dir>]\n';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      build: { type: 'boolean', default: false }, measure: { type: 'boolean', default: false },
      zips: { type: 'string' }, out: { type: 'string' }, 'per-term': { type: 'string', default: '20' }, seed: { type: 'string', default: '7' },
      sample: { type: 'string' }, catalogue: { type: 'string' }, prices: { type: 'string' },
    },
  });
  if (values.build === values.measure) {
    process.stderr.write(USAGE);
    process.exit(2);
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
