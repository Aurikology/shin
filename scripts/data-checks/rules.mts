/**
 * THE DATA CHECKS: rules run straight on the price data (the `observation` table), no screens and no
 * server. Each rule counts one class of row that would make a Pexi price verdict wrong, and keeps a few
 * example rows. The counts ARE the result: a rule never fails the run by being non-zero, except D5
 * (impossible values), which run.mts turns into exit 1.
 *
 * READ-ONLY. Nothing here writes: `runChecks` is handed an open handle, and run.mts opens it read-only.
 *
 * WHAT "USED BY VERDICTS" MEANS HERE. It is read from the code, per rule, and cited by file:line (as of the
 * lane commit this was written on; lines move, the names beside them do not):
 *   price/src/estimate.ts  readRows (445-502), the own-price rung (1041-1048, 1129-1166), pools (601-651, 677-681)
 *   price/src/range.ts     readObservations (356-400), WINDOW_DAYS = 90 (72)
 * `readByEstimate` below replays estimate.ts readRows' own filters so "used" is the estimate's, not a guess.
 * Not replayed: the example.com/.test link filter (range.ts reservedHost) and base_price_cents (the estimate
 * compares the pre-tax figure where a row has one; these rules read price_cents).
 */
import { DatabaseSync } from 'node:sqlite';
import { WINDOW_DAYS } from '../../price/src/range.ts';
import { HORIZON_DAYS, WRONG_ROW_FACTOR } from '../../price/src/estimate.ts';
import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';
import { licensedOnlySql } from '../../catalogue/src/source-rights.ts';

/* ------------------------------------------------------------------ thresholds */

/** A grocery row above this is not a grocery price: $2,000.00. */
export const MAX_GROCERY_CENTS = 200_000;
/** D4: a price this many times above, or this fraction of, its product's median. The estimate's own factor (estimate.ts:104). */
export const OUTLIER_FACTOR = WRONG_ROW_FACTOR;
/** D4: a product needs this many rows before its median means anything. */
export const OUTLIER_MIN_ROWS = 3;
/** D7: stored unit price against price / size, either way round. */
export const UNIT_PRICE_FACTOR = 2;
/** D3, D8: two sizes agree when within 5 percent, the estimate's own tolerance (estimate.ts:1093). */
export const SIZE_TOLERANCE = 1.05;
const DAY_MS = 86_400_000;

/* ----------------------------------------------------------------------- types */

export interface Row {
  readonly id: number;
  readonly code: string | null;
  readonly seller: string;
  readonly sku: string;
  readonly name: string;
  /** NaN when the stored value is not a number. */
  readonly price: number;
  readonly kind: string;
  readonly unitCents: number | null;
  readonly unitLabel: string | null;
  readonly unitPer: string | null;
  readonly currency: string;
  readonly country: string;
  /** null when the file has no join_method column. */
  readonly join: string | null;
  readonly seenOn: string;
  readonly inStock: number | null;
  readonly parsedSize: string | null;
  readonly isSale: number | null;
  readonly tile: number | null;
  readonly verified: number | null;
}

export interface Example {
  readonly code: string | null;
  readonly seller: string;
  readonly sku: string;
  readonly priceCents: number;
  readonly seenOn: string;
  readonly why: string;
}

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Bucket {
  readonly id: string;
  readonly label: string;
  /** true: its rows make up the rule's count. false: shown for context only. */
  readonly headline: boolean;
  readonly severity: Severity;
  count: number;
  readonly examples: Example[];
}

export type Used = 'yes' | 'no' | 'partly';

export interface RuleResult {
  readonly id: string;
  readonly title: string;
  readonly usedByVerdicts: Used;
  /** file:line citations that say why. */
  readonly usedWhy: readonly string[];
  /** Distinct rows in the headline buckets. */
  count: number;
  readonly total: number;
  readonly share: number;
  readonly buckets: Bucket[];
  /** Up to 10, the worst buckets first. */
  readonly examples: Example[];
  readonly notes: string[];
}

export interface CheckOptions {
  /** YYYY-MM-DD, the day the verdicts are priced at. */
  readonly asOf: string;
  /** Examples kept per bucket. Default 10. */
  readonly maxExamples?: number;
  /** Open handle on a catalogue, read-only. Without it D8 does not run and D3 cannot split by size. */
  readonly catalogue?: DatabaseSync | null;
}

export interface CheckRun {
  readonly asOf: string;
  readonly totalRows: number;
  readonly hasCatalogue: boolean;
  readonly rules: RuleResult[];
  /** A rule that threw. Any entry here is an exit 1. */
  readonly errors: { rule: string; error: string }[];
}

/* ------------------------------------------------------------------ small tools */

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The estimate's own code key (estimate.ts:363): digits without leading zeros, anything else as is. */
export function codeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

/** Every spelling a code may be stored under (estimate.ts:369, range.ts:279). */
function spellings(code: string): string[] {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return [d];
  const bare = codeKey(d);
  const out = [d, bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  return [...new Set(out)];
}

function dollars(cents: number): string {
  return Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : String(cents);
}

/** Age in whole days at `asOfMs`, or null when the date does not parse. Never below 0 (spine/src/money.ts ageDays). */
function ageOf(r: Row, asOfMs: number): number | null {
  const t = Date.parse(r.seenOn);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((asOfMs - t) / DAY_MS));
}

function isSale(r: Row): boolean {
  return r.kind === 'promotional' || r.isSale === 1;
}

function priceOk(r: Row): boolean {
  return Number.isInteger(r.price) && r.price > 0;
}

/**
 * Whether estimate.ts readRows (445-502) would read this row at all for a CAD item, and it is not a sale
 * (a sale never enters a centre, estimate.ts:53, 1130). Replays 459-462 (whole positive price, a date, a
 * seller), 454 (currency), 466 (future by more than a day), 471 (older than HORIZON_DAYS), 472-473
 * (an unverified printout).
 */
export function readByEstimate(r: Row, asOfMs: number, currency = 'CAD'): boolean {
  if (!priceOk(r) || r.seller.trim() === '') return false;
  if (r.currency !== currency) return false;
  const t = Date.parse(r.seenOn);
  if (Number.isNaN(t)) return false;
  if (t - asOfMs > DAY_MS) return false;
  const age = ageOf(r, asOfMs);
  if (age === null || age > HORIZON_DAYS) return false;
  if (r.tile !== null && r.verified !== 1) return false;
  return !isSale(r);
}

/* ------------------------------------------------------------------------ sizes */

function sizeFromText(text: string | null): ComparisonQuantity | null {
  const p = parseQuantity(text);
  return p ? toComparison(p.value, p.unit) : null;
}

const SIZE_CANDIDATE = /(?:\d+\s*[x*]\s*)?(?:\d+(?:[.,]\d+)?|\.\d+)\s*(?:fl\.?\s*oz|[a-z]+)\b/g;

/**
 * A size from a product name: the LAST "number unit" in it that the size system knows. parseQuantity alone
 * stops at the first number-and-word, so "Kraft Dinner 3 cheese 225g" would read "3 cheese", find no unit
 * and give up; the size is nearly always the tail.
 */
export function sizeFromName(name: string): ComparisonQuantity | null {
  let found: ComparisonQuantity | null = null;
  for (const m of name.toLowerCase().matchAll(SIZE_CANDIDATE)) {
    const q = sizeFromText(m[0]);
    if (q) found = q;
  }
  return found;
}

/** The seller's own size for a row: its parsed size, else the name's tail. */
export function sellerSize(r: Row): ComparisonQuantity | null {
  return sizeFromText(r.parsedSize) ?? sizeFromName(r.name);
}

/** Two sizes disagree when the families differ or they are further apart than SIZE_TOLERANCE (estimate.ts:1090-1093). */
export function sizesDisagree(a: ComparisonQuantity, b: ComparisonQuantity): boolean {
  if (a.family !== b.family) return true;
  const ratio = b.baseValue / a.baseValue;
  return ratio < 1 / SIZE_TOLERANCE || ratio > SIZE_TOLERANCE;
}

function sizeText(q: ComparisonQuantity): string {
  return `${q.original.value} ${q.original.unit}`;
}

/* ---------------------------------------------------------------------- catalogue */

interface CatInfo {
  readonly size: ComparisonQuantity | null;
}

/**
 * The catalogue rows for these codes, by code key. Reads the way estimate.ts readCatalogue does (528-560):
 * every spelling of the code, the licensed-source filter when the table has a source column, and the size from
 * the quantity text first, then size_value and size_unit.
 */
function loadCatalogue(db: DatabaseSync, codes: readonly string[]): Map<string, CatInfo> {
  const out = new Map<string, CatInfo>();
  if (codes.length === 0) return out;
  const have = new Set((db.prepare('PRAGMA table_info(product)').all() as unknown as { name: string }[]).map((c) => c.name));
  if (!have.has('code')) throw new Error('the catalogue has no product.code column');
  const col = (name: string) => (have.has(name) ? name : `NULL AS ${name}`);
  const all = [...new Set(codes.flatMap(spellings))];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const rows = db
      .prepare(
        `SELECT code, ${col('quantity')}, ${col('size_value')}, ${col('size_unit')}
           FROM product WHERE code IN (${chunk.map(() => '?').join(',')})${have.has('source') ? ` AND ${licensedOnlySql()}` : ''}`,
      )
      .all(...chunk) as unknown as Record<string, unknown>[];
    for (const r of rows) {
      const key = codeKey(String(r.code));
      if (out.has(key)) continue;
      const fromText = sizeFromText(str(r.quantity));
      const fromCols = toComparison(numOrNull(r.size_value), str(r.size_unit));
      out.set(key, { size: fromText ?? fromCols ?? null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- rows */

/** Every observation row, compactly. A column an older file lacks reads as absent, as estimate.ts readRows does. */
export function loadRows(db: DatabaseSync): Row[] {
  const have = new Set((db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[]).map((c) => c.name));
  if (have.size === 0) throw new Error('the prices file has no observation table');
  const col = (name: string) => (have.has(name) ? name : `NULL AS ${name}`);
  const stmt = db.prepare(
    `SELECT rowid AS id, code, seller, seller_sku, seller_name, price_cents, kind, ${col('unit_price_cents')}, ${col('unit_label')},
            ${col('unit_price_per')}, currency, country, ${col('join_method')}, seen_on, ${col('in_stock')}, ${col('parsed_size')},
            ${col('is_sale')}, ${col('capture_tile_id')}, ${col('price_verified')}
       FROM observation`,
  );
  const out: Row[] = [];
  for (const r of stmt.iterate() as Iterable<Record<string, unknown>>) {
    out.push({
      id: Number(r.id),
      code: str(r.code),
      seller: typeof r.seller === 'string' ? r.seller : '',
      sku: typeof r.seller_sku === 'string' ? r.seller_sku : '',
      name: typeof r.seller_name === 'string' ? r.seller_name : '',
      price: typeof r.price_cents === 'number' ? r.price_cents : Number.NaN,
      kind: typeof r.kind === 'string' ? r.kind : '',
      unitCents: numOrNull(r.unit_price_cents),
      unitLabel: str(r.unit_label),
      unitPer: str(r.unit_price_per),
      currency: typeof r.currency === 'string' ? r.currency : '',
      country: typeof r.country === 'string' ? r.country : '',
      join: str(r.join_method),
      seenOn: typeof r.seen_on === 'string' ? r.seen_on : '',
      inStock: numOrNull(r.in_stock),
      parsedSize: str(r.parsed_size),
      isSale: numOrNull(r.is_sale),
      tile: numOrNull(r.capture_tile_id),
      verified: numOrNull(r.price_verified),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- rule scaffolding */

interface RuleSpec {
  readonly id: string;
  readonly title: string;
  readonly used: Used;
  readonly usedWhy: readonly string[];
}

interface BucketSpec {
  readonly id: string;
  readonly label: string;
  readonly headline: boolean;
  readonly severity: Severity;
}

/** Collects a rule's buckets and its distinct headline rows. */
class Builder {
  readonly spec: RuleSpec;
  readonly total: number;
  readonly max: number;
  readonly buckets: Bucket[] = [];
  readonly notes: string[] = [];
  private readonly headlineIds = new Set<number>();
  private readonly byId = new Map<string, Bucket>();

  constructor(spec: RuleSpec, total: number, max: number, buckets: readonly BucketSpec[]) {
    this.spec = spec;
    this.total = total;
    this.max = max;
    for (const b of buckets) {
      const bucket: Bucket = { ...b, count: 0, examples: [] };
      this.buckets.push(bucket);
      this.byId.set(b.id, bucket);
    }
  }

  add(bucketId: string, r: Row, why: string): void {
    const b = this.byId.get(bucketId);
    if (!b) throw new Error(`rule ${this.spec.id}: no bucket ${bucketId}`);
    b.count++;
    if (b.headline) this.headlineIds.add(r.id);
    if (b.examples.length < this.max) {
      b.examples.push({ code: r.code, seller: r.seller, sku: r.sku, priceCents: r.price, seenOn: r.seenOn, why });
    }
  }

  result(): RuleResult {
    const count = this.headlineIds.size;
    const order: Severity[] = ['high', 'medium', 'low', 'info'];
    const examples = [...this.buckets]
      .filter((b) => b.headline)
      .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
      .flatMap((b) => b.examples)
      .slice(0, 10);
    return {
      id: this.spec.id,
      title: this.spec.title,
      usedByVerdicts: this.spec.used,
      usedWhy: this.spec.usedWhy,
      count,
      total: this.total,
      share: this.total === 0 ? 0 : count / this.total,
      buckets: this.buckets,
      examples,
      notes: this.notes,
    };
  }
}

/* --------------------------------------------------------------------- the rules */

/** D1: prices older than the 90-day window that the estimate still uses. */
function ruleD1(rows: readonly Row[], asOfMs: number, max: number): RuleResult {
  const b = new Builder(
    {
      id: 'D1',
      title: `Stale: seen more than ${WINDOW_DAYS} days ago and still read by the estimate`,
      used: 'partly',
      usedWhy: [
        `The cut-off the code uses is ${WINDOW_DAYS} days: price/src/range.ts:72 WINDOW_DAYS, applied at range.ts:394 (range.ts reads nothing older, so it is NOT affected), and the same constant at price/src/estimate.ts:1145 where the own-price rung prefers shops seen within ${WINDOW_DAYS} days.`,
        `estimate.ts:1146-1147, 1158-1159: with no fresh shop for the item, older shops ARE used, age-weighted (half-life 365 days), up to ${HORIZON_DAYS} days (estimate.ts:100, 471). This is the "yes" part.`,
        'estimate.ts:601-651 buildProducts and 711-728 poolPoints: category pools take each product\'s latest price per shop at any age up to the horizon; no 90-day cut is applied there.',
        `Rows older than ${HORIZON_DAYS} days are never read (estimate.ts:471): shown for context, not counted.`,
      ],
    },
    rows.length,
    max,
    [
      { id: 'stale_read', label: `older than ${WINDOW_DAYS} days, up to ${HORIZON_DAYS}, read by the estimate (the count)`, headline: true, severity: 'medium' },
      { id: 'older_than_window_all', label: `all rows older than ${WINDOW_DAYS} days, whether or not the estimate reads them`, headline: false, severity: 'info' },
      { id: 'beyond_horizon', label: `older than ${HORIZON_DAYS} days: never read`, headline: false, severity: 'info' },
    ],
  );
  for (const r of rows) {
    const age = ageOf(r, asOfMs);
    if (age === null) continue;
    if (age > WINDOW_DAYS) b.add('older_than_window_all', r, `${age} days old`);
    if (age > HORIZON_DAYS) b.add('beyond_horizon', r, `${age} days old`);
    if (age > WINDOW_DAYS && readByEstimate(r, asOfMs)) b.add('stale_read', r, `${age} days old (seen ${r.seenOn.slice(0, 10)}), over the ${WINDOW_DAYS}-day window`);
  }
  return b.result();
}

/** D2: out-of-stock rows that carry a price the estimate uses. */
function ruleD2(rows: readonly Row[], asOfMs: number, max: number, hasInStock: boolean): RuleResult {
  const b = new Builder(
    {
      id: 'D2',
      title: 'Out of stock (in_stock = 0) but priced and read by the estimate',
      used: 'yes',
      usedWhy: [
        'No reader looks at in_stock: grep of in_stock finds no match in price/src/estimate.ts, price/src/range.ts or app/src. readRows (estimate.ts:445-502) and readObservations (range.ts:356-400) do not select it, so an out-of-stock row counts exactly like an in-stock one.',
        'price/src/lookup.ts:11-14 says the same of that path: it never reads stock.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'out_of_stock_used', label: 'in_stock = 0 and read by the estimate (the count)', headline: true, severity: 'medium' },
      { id: 'out_of_stock_any', label: 'in_stock = 0, any row', headline: false, severity: 'info' },
    ],
  );
  if (!hasInStock) b.notes.push('this prices file has no in_stock column: the rule could not look');
  for (const r of rows) {
    if (r.inStock !== 0) continue;
    b.add('out_of_stock_any', r, 'in_stock = 0');
    if (readByEstimate(r, asOfMs)) b.add('out_of_stock_used', r, `in_stock = 0 yet priced ${dollars(r.price)} and read`);
  }
  return b.result();
}

/** D3: prices joined to a product by name only, split by whether the sizes agree. */
function ruleD3(rows: readonly Row[], asOfMs: number, max: number, cat: Map<string, CatInfo> | null, hasJoin: boolean): RuleResult {
  const b = new Builder(
    {
      id: 'D3',
      title: 'Joined to a catalogue product by name only (join_method not gtin or barcode)',
      used: 'partly',
      usedWhy: [
        'price/src/estimate.ts:1041-1048 (D-267): a name-joined row counts as the product\'s own price only when no barcode-joined row exists, or when it is within 2x of the barcode-joined median. With no barcode-joined rows, name-joined rows still answer (1048 ownByNameOnly).',
        'price/src/range.ts:357-368 readObservations selects every row with a code and applies NO join_method filter: there, a name-joined row is used like any other.',
        'price/src/lookup.ts:120-138 skips only join_method none; a name-joined row is served.',
        'Size mismatch (seller\'s size differs from the catalogue product\'s by more than 5 percent, or another unit family) is the high-severity part: the price is for a different pack, very likely a different product.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'size_mismatch', label: 'size disagrees with the catalogue product (HIGH)', headline: true, severity: 'high' },
      { id: 'no_catalogue_row', label: 'the code is not in the catalogue, so the size cannot be compared', headline: true, severity: 'medium' },
      { id: 'size_unknown', label: 'seller or catalogue gives no size, so it cannot be compared', headline: true, severity: 'medium' },
      { id: 'size_match', label: 'size agrees with the catalogue product', headline: true, severity: 'low' },
      { id: 'size_unchecked', label: 'no --catalogue given, size not compared', headline: true, severity: 'medium' },
      { id: 'name_joined_readable', label: 'of all name-joined rows, how many the estimate reads', headline: false, severity: 'info' },
    ],
  );
  if (!hasJoin) b.notes.push('this prices file has no join_method column: the rule could not look');
  if (!cat) b.notes.push('no --catalogue: every name-joined row is reported as size_unchecked; pass --catalogue to split by size');
  for (const r of rows) {
    if (r.code === null || r.join === null) continue;
    if (r.join === 'gtin' || r.join === 'barcode') continue;
    const how = r.join === 'none' ? "join_method 'none' yet a code is set" : `joined by ${r.join}`;
    if (readByEstimate(r, asOfMs)) b.add('name_joined_readable', r, how);
    if (!cat) {
      b.add('size_unchecked', r, how);
      continue;
    }
    const c = cat.get(codeKey(r.code));
    if (!c) {
      b.add('no_catalogue_row', r, `${how}; code not in the catalogue`);
      continue;
    }
    const mine = sellerSize(r);
    if (!mine || !c.size) {
      b.add('size_unknown', r, `${how}; ${mine ? 'the catalogue gives no size' : 'the seller gives no size'} ("${r.name}")`);
    } else if (sizesDisagree(c.size, mine)) {
      b.add('size_mismatch', r, `${how}; seller "${r.name}" reads ${sizeText(mine)}, catalogue says ${sizeText(c.size)}`);
    } else {
      b.add('size_match', r, `${how}; size ${sizeText(mine)} agrees`);
    }
  }
  return b.result();
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** D4: a price far from its own product's median. */
function ruleD4(rows: readonly Row[], max: number): RuleResult {
  const b = new Builder(
    {
      id: 'D4',
      title: `Price outlier within one product: over ${OUTLIER_FACTOR}x or under 1/${OUTLIER_FACTOR} of its median, with ${OUTLIER_MIN_ROWS}+ rows`,
      used: 'partly',
      usedWhy: [
        `price/src/estimate.ts:677-681 statsOf drops a point more than ${OUTLIER_FACTOR}x off the median of its POOL (a category pool or product set), and 1130-1132 drops an own price more than ${OUTLIER_FACTOR}x off the CATEGORY centre. Both only when a category exists to compare with; with no category pool (catStats null) an own-price outlier is kept.`,
        'price/src/range.ts reads rows with no outlier cut at the row level.',
        'So a row flagged here is partly caught downstream and partly not; this rule looks within the product itself, which neither does.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'too_high', label: `more than ${OUTLIER_FACTOR}x the product's median`, headline: true, severity: 'medium' },
      { id: 'too_low', label: `less than 1/${OUTLIER_FACTOR} of the product's median`, headline: true, severity: 'medium' },
    ],
  );
  b.notes.push('rows counted per product: regular (not sale) rows with a code and a whole positive price, grouped by currency and code key, every age');
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.code === null || !priceOk(r) || isSale(r)) continue;
    const key = `${r.currency}|${codeKey(r.code)}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  for (const g of groups.values()) {
    if (g.length < OUTLIER_MIN_ROWS) continue;
    const m = median(g.map((r) => r.price).sort((x, y) => x - y));
    for (const r of g) {
      if (r.price > OUTLIER_FACTOR * m) b.add('too_high', r, `${dollars(r.price)} is ${(r.price / m).toFixed(1)}x the median ${dollars(m)} of ${g.length} rows`);
      else if (r.price * OUTLIER_FACTOR < m) b.add('too_low', r, `${dollars(r.price)} is 1/${(m / r.price).toFixed(1)} of the median ${dollars(m)} of ${g.length} rows`);
    }
  }
  return b.result();
}

/** D5: values that cannot be true. */
function ruleD5(rows: readonly Row[], asOf: string, max: number, hasJoin: boolean): RuleResult {
  const b = new Builder(
    {
      id: 'D5',
      title: 'Impossible values',
      used: 'partly',
      usedWhy: [
        'price <= 0 or not whole cents: dropped, estimate.ts:459-462 (posInt) and range.ts:377.',
        'seen_on in the future: dropped when more than a day ahead, estimate.ts:466 and range.ts:388 (isFutureDated, spine/src/money.ts:81, one day of slack); a row one day ahead is read. An unparseable seen_on is dropped (estimate.ts:468, range.ts:382-385).',
        `price over $2,000: NOT filtered anywhere in estimate.ts or range.ts, so it is read (the "yes" part).`,
        'currency not CAD for country CA: excluded from a CAD verdict by WHERE currency = ? (estimate.ts:454, range.ts:366), so it is silently left out, not wrong; it is still a data fault.',
        'missing code on a row that claims a join: estimate.ts:476 falls back to page_gtin, else the row is no product\'s own price (481); range.ts:357 needs a code. Rows with join_method none and no code are the normal unjoined rows and are not flagged.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'price_not_positive', label: 'price <= 0', headline: true, severity: 'high' },
      { id: 'price_not_whole', label: 'price not a whole number of cents (or not a number)', headline: true, severity: 'high' },
      // Not impossible: BC liquor really sells $2,000+ bottles (the September file: 154 rows, a 55-year Glenlivet,
      // Louis XIII). Listed for review, never counted as impossible, never fails the run.
      { id: 'price_over_2000', label: `price over $${MAX_GROCERY_CENTS / 100}.00 (review list, real for rare spirits)`, headline: false, severity: 'low' },
      { id: 'seen_future', label: `seen_on after ${asOf}`, headline: true, severity: 'high' },
      { id: 'seen_unparseable', label: 'seen_on is not a date', headline: true, severity: 'high' },
      { id: 'currency_not_cad', label: 'country CA but currency not CAD', headline: true, severity: 'high' },
      { id: 'missing_code', label: 'join_method says gtin, barcode or name but code is empty', headline: true, severity: 'high' },
    ],
  );
  if (!hasJoin) b.notes.push('this prices file has no join_method column: missing_code could not look');
  for (const r of rows) {
    if (Number.isNaN(r.price)) b.add('price_not_whole', r, 'price_cents is not a number');
    else if (!Number.isInteger(r.price)) b.add('price_not_whole', r, `price_cents ${r.price} is not whole cents`);
    else if (r.price <= 0) b.add('price_not_positive', r, `price_cents ${r.price}`);
    if (Number.isFinite(r.price) && r.price > MAX_GROCERY_CENTS) b.add('price_over_2000', r, `${dollars(r.price)} is over ${dollars(MAX_GROCERY_CENTS)}`);
    const t = Date.parse(r.seenOn);
    if (Number.isNaN(t)) b.add('seen_unparseable', r, `seen_on "${r.seenOn}"`);
    else if (r.seenOn.slice(0, 10) > asOf) b.add('seen_future', r, `seen_on ${r.seenOn.slice(0, 10)} is after ${asOf}`);
    if (r.country.trim().toUpperCase() === 'CA' && r.currency.trim().toUpperCase() !== 'CAD') b.add('currency_not_cad', r, `country CA, currency "${r.currency}"`);
    if (r.code === null && r.join !== null && r.join !== 'none') b.add('missing_code', r, `join_method ${r.join} but no code`);
  }
  return b.result();
}

/** D6: the same observation more than once. */
function ruleD6(rows: readonly Row[], max: number): RuleResult {
  const b = new Builder(
    {
      id: 'D6',
      title: 'Duplicates: the same code, seller, sku, date and price more than once',
      used: 'no',
      usedWhy: [
        'price/src/estimate.ts:587-594 latestPerShop and 1144 keep one row per shop for an item, and range.ts:403-410 does the same, so a duplicate does not count twice in a centre.',
        'price/src/store.ts:245 makes (seller, seller_sku, seen_on) the primary key, so an exact duplicate cannot exist in a file made by openPrices; the exact bucket guards an older or rebuilt file.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'exact', label: 'exact duplicate (same sku): extra rows beyond the first (the count)', headline: true, severity: 'medium' },
      { id: 'other_sku', label: 'same code, seller, date and price under another sku: extra rows beyond the first', headline: false, severity: 'info' },
    ],
  );
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = JSON.stringify([r.code, r.seller, r.seenOn.slice(0, 10), r.price]);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const skus = new Set<string>([g[0]!.sku]);
    for (const r of g.slice(1)) {
      if (skus.has(r.sku)) b.add('exact', r, `same code, seller, sku "${r.sku}", date and price ${dollars(r.price)} as another row`);
      else {
        skus.add(r.sku);
        if (r.code !== null) b.add('other_sku', r, `same code, seller, date and price ${dollars(r.price)} as sku "${g[0]!.sku}"`);
      }
    }
  }
  return b.result();
}

/** The quantity a printed unit price is "per", from unit_price_per ('100g', 'kg', 'each') or the label ("$2.62/100g"). */
function perQuantity(per: string | null, label: string | null): ComparisonQuantity | null {
  const fromText = (t: string | null, re: RegExp): ComparisonQuantity | null => {
    if (!t) return null;
    const m = re.exec(t.toLowerCase().trim());
    return m ? toComparison(m[1] ? Number(m[1]) : 1, m[2]!) : null;
  };
  return fromText(per, /^(\d+(?:\.\d+)?)?\s*([a-z]+)$/) ?? fromText(label, /\/\s*(\d+(?:\.\d+)?)?\s*([a-z]+)\.?\s*$/);
}

/** D7: the stored unit price against price / size. */
function ruleD7(rows: readonly Row[], max: number): RuleResult {
  const b = new Builder(
    {
      id: 'D7',
      title: `Stored unit price disagrees with price / size by more than ${UNIT_PRICE_FACTOR}x`,
      used: 'no',
      usedWhy: [
        'grep of unit_price in price/src/estimate.ts and price/src/range.ts finds nothing: neither reads the stored unit price. The estimate works the unit price out itself from price and size (estimate.ts:711-728 poolPoints).',
        'It is still a signal: when the stored unit price and price / size disagree, the SIZE the estimate parses (which IS used) or the price is probably wrong.',
      ],
    },
    rows.length,
    max,
    [{ id: 'unit_price_disagrees', label: `unit price off by more than ${UNIT_PRICE_FACTOR}x either way`, headline: true, severity: 'medium' }],
  );
  b.notes.push('only rows with a stored unit price, a unit it is per, and a seller size in the same unit family are judged; the rest cannot be');
  for (const r of rows) {
    if (r.unitCents === null || r.unitCents <= 0 || !priceOk(r)) continue;
    const per = perQuantity(r.unitPer, r.unitLabel);
    const size = sellerSize(r);
    if (!per || !size || per.family !== size.family) continue;
    const expected = (r.price / size.baseValue) * per.baseValue;
    const ratio = r.unitCents / expected;
    if (ratio > UNIT_PRICE_FACTOR || ratio < 1 / UNIT_PRICE_FACTOR) {
      b.add('unit_price_disagrees', r, `stored unit price ${r.unitCents.toFixed(1)} cents per ${r.unitPer ?? r.unitLabel}, but ${dollars(r.price)} for ${sizeText(size)} works out to ${expected.toFixed(1)} (${ratio.toFixed(2)}x)`);
    }
  }
  return b.result();
}

/** D8: priced codes the catalogue does not know, and a seller size that contradicts the catalogue. */
function ruleD8(rows: readonly Row[], max: number, cat: Map<string, CatInfo>): RuleResult {
  const b = new Builder(
    {
      id: 'D8',
      title: 'Catalogue cross-check: priced codes not in the catalogue, and sizes that disagree',
      used: 'partly',
      usedWhy: [
        'not in the catalogue: the row still serves as that barcode\'s own price (estimate.ts:1041), but with no catalogue row the product has no category, brand or size from the catalogue (estimate.ts:1028-1035, 1052-1055) and, with no leaf, does not feed any category pool (estimate.ts:618, 1115).',
        'size disagrees (barcode-joined rows; name-joined ones are D3): estimate.ts:1085-1099 notices, raises identity_conflict and uses the store\'s size, so the verdict is built on the seller\'s size. Counted as used: yes.',
        'The catalogue is read as estimate.ts:528-560 does, including the licensed-source filter: a code present only in an unlicensed source reads as not in the catalogue, as it does for the estimate.',
      ],
    },
    rows.length,
    max,
    [
      { id: 'not_in_catalogue', label: 'priced code is not in the catalogue', headline: true, severity: 'medium' },
      { id: 'size_disagrees', label: 'catalogue size and the seller\'s size disagree (barcode-joined rows)', headline: true, severity: 'high' },
    ],
  );
  for (const r of rows) {
    if (r.code === null) continue;
    const c = cat.get(codeKey(r.code));
    if (!c) {
      b.add('not_in_catalogue', r, `code ${r.code} is not in the catalogue`);
      continue;
    }
    if (r.join === 'name' || r.join === 'none') continue; // D3
    const mine = sellerSize(r);
    if (mine && c.size && sizesDisagree(c.size, mine)) {
      b.add('size_disagrees', r, `seller "${r.name}" reads ${sizeText(mine)}, catalogue says ${sizeText(c.size)}`);
    }
  }
  return b.result();
}

/* ------------------------------------------------------------------------ runner */

/** Runs every rule on an open prices handle. A rule that throws is recorded in `errors` and the rest still run. */
export function runChecks(prices: DatabaseSync, opts: CheckOptions): CheckRun {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf) || Number.isNaN(Date.parse(opts.asOf))) throw new Error(`as-of must be YYYY-MM-DD, got ${opts.asOf}`);
  const asOfMs = Date.parse(`${opts.asOf}T00:00:00Z`);
  const max = opts.maxExamples ?? 10;
  const have = new Set((prices.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[]).map((c) => c.name));
  const rows = loadRows(prices);
  const errors: { rule: string; error: string }[] = [];
  const rules: RuleResult[] = [];
  const attempt = (id: string, f: () => RuleResult): void => {
    try {
      rules.push(f());
    } catch (err) {
      errors.push({ rule: id, error: err instanceof Error ? err.message : String(err) });
    }
  };

  let cat: Map<string, CatInfo> | null = null;
  if (opts.catalogue) {
    try {
      cat = loadCatalogue(opts.catalogue, [...new Set(rows.flatMap((r) => (r.code === null ? [] : [r.code])))]);
    } catch (err) {
      errors.push({ rule: 'catalogue', error: err instanceof Error ? err.message : String(err) });
    }
  }
  const catalogueOk = cat !== null;

  attempt('D1', () => ruleD1(rows, asOfMs, max));
  attempt('D2', () => ruleD2(rows, asOfMs, max, have.has('in_stock')));
  attempt('D3', () => ruleD3(rows, asOfMs, max, cat, have.has('join_method')));
  attempt('D4', () => ruleD4(rows, max));
  attempt('D5', () => ruleD5(rows, opts.asOf, max, have.has('join_method')));
  attempt('D6', () => ruleD6(rows, max));
  attempt('D7', () => ruleD7(rows, max));
  if (catalogueOk) attempt('D8', () => ruleD8(rows, max, cat!));

  return { asOf: opts.asOf, totalRows: rows.length, hasCatalogue: catalogueOk, rules, errors };
}
