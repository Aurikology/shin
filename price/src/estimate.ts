/**
 * THE PRICE VERDICT AS A DISTRIBUTION. docs/verdict-distribution-design-2026-09-30.md
 * is the spec; this file builds its Server unit's ladder and its response
 * contract, `verdict`, field for field.
 *
 * Every case reduces to two numbers for this item, a centre and a spread, fitted
 * on LOG price: `centreCents = exp(mu)`, `sigmaLog = sigma`, p10/p90 =
 * exp(mu -/+ 1.2816 sigma). Less sure means a wider bell and a lower
 * confidence, never no answer (RULINGS.md "Always answer, never refuse for
 * wasting time").
 *
 * THE LADDER, first rung with evidence:
 *   own_prices       this item's own regular prices, latest per shop, 90 days
 *                    first, else up to 2 years with age weighting; median of
 *                    shops; blended with the category centre,
 *                    mu = (n * mu_own + k * mu_cat) / (n + k), k = 1.
 *   other_size       the same product (normalised brand and name) in another
 *                    size inside the pack-size band, unit price scaled here.
 *   leaf_category    5+ priced products in the leaf, same unit family, pack-size
 *                    band, scaled to this size; median.
 *   parent_category  the same one level up.
 *   brand_markup     the brand's median ratio to its categories' medians, times
 *                    the nearest category centre.
 *   claude_typical   the caller's capped, no-web-search Claude ask (RULINGS.md
 *                    "Catalogue first; Claude, with no web search, is the
 *                    capped price-range fallback"); its low/high read as
 *                    p10/p90. Down, capped, slow, keyless: the next rung.
 *   category_prior   the widest category Shin can place it in, any size, per item.
 *   global_prior     every regular price Shin holds in the currency.
 *
 * WHAT THIS READS. The `observation` table and the catalogue `product` table,
 * through handles the caller opens read-only, and nothing else. No network and
 * no model: the Claude rung is a function the caller passes in, so this file
 * never imports a provider. It edits neither `range.ts` nor the size system
 * (`catalogue/src/units.ts`, `catalogue/src/size-fill.ts`); it reads both.
 *
 * ROWS: a sale row (kind 'promotional', or is_sale = 1) never enters a centre;
 * it comes back as a `sale` dot. A row with no barcode (neither `code` nor
 * `page_gtin`) is never an item's own price; it counts at category level only
 * when the caller can place it in a category (`categoryOfUnbarcoded`). A
 * printout row counts only when `price_verified = 1`, and never as an own price.
 * Where a row carries a pre-tax figure (`base_price_cents`) that is the price
 * compared, so tax-in and tax-out rows are never mixed (design case 22).
 */

import type { DatabaseSync } from 'node:sqlite';
import { ageDays, isFutureDated } from '../../spine/src/money.ts';
import { nearestRankIndex, parentOf, MIN_CATEGORY_PRODUCTS, WINDOW_DAYS } from './range.ts';
import type { Taxonomy } from '../../catalogue/src/category-taxonomy.ts';
import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';
// Loaded on first use, not at import: size-fill.ts pulls in the catalogue schema and its vector
// extension, and every server path that imports this file would pay for that at startup.
type FillFromName = (typeof import('../../catalogue/src/size-fill.ts'))['fillFromName'];
let fillFromName: FillFromName | null = null;
async function loadSizeFill(): Promise<void> {
  if (fillFromName) return;
  try {
    fillFromName = (await import('../../catalogue/src/size-fill.ts')).fillFromName;
  } catch {
    fillFromName = null;
  }
}

/* ------------------------------------------------------------ constants */

/** p10 / p90 of a standard normal. */
export const Z10 = 1.2816;
/** p1 / p99 of a standard normal: past these a shopper's price is `beyond`. */
export const Z01 = 2.3263;
/** A price further than this many sigma out may be a typo (`suspect`). */
export const SUSPECT_SIGMA = 4;
/** Blend weight of the category centre against own prices (the design's k). */
export const BLEND_K = 1;
/** The floor under every spread. */
export const MIN_SIGMA = 0.05;
/** Old data, other-region data and an assumed size each widen the bell by this. */
export const WIDEN = 1.25;
/** Older than this (days), the newest price behind the centre makes it `old_prices`. */
export const OLD_DAYS = 365;
/** No price older than this (days) is read at all. */
export const HORIZON_DAYS = 730;
/** Age weighting past the window: a price loses half its weight per year. */
export const HALF_LIFE_DAYS = 365;
/** A price this many times off its category median is a wrong row, left out of the centre. */
export const WRONG_ROW_FACTOR = 5;
/** The pack-size band: half to double this item's size. */
export const BAND_LOW = 0.5;
export const BAND_HIGH = 2;
/** A leaf category with this many priced products makes a leaf answer medium confidence. */
export const MEDIUM_LEAF_PRODUCTS = 20;
/** Own prices from this many shops, fresh, are high confidence. */
export const HIGH_OWN_SHOPS = 3;
/** Own prices from this many shops give their own spread. */
export const OWN_SPREAD_SHOPS = 5;
/** The widest-category prior needs at least this many products. */
export const MIN_PRIOR_PRODUCTS = 3;
/** At most this many dots. */
export const MAX_DOTS = 12;
/** How long the Claude rung is waited for before the ladder moves on (design case 27, "slow"). */
export const CLAUDE_WAIT_MS = 6000;
/** Default thresholds, his 2026-09-17 setup numbers (design call 4). */
export const DEFAULT_THRESHOLDS = { greatPct: 30, goodPct: 20, badPct: 20 } as const;
/**
 * The last resort when Shin holds no price at all in the currency (no price
 * file, or an empty one): a wide bell so the answer is still drawable. The
 * design: "Never reached in practice; it exists so the answer is always
 * drawable."
 */
export const EMPTY_PRIOR = { centreCents: 1000, sigmaLog: 1 } as const;

/* ---------------------------------------------------------------- types */

export type Basis =
  | 'own_prices'
  | 'other_size'
  | 'leaf_category'
  | 'parent_category'
  | 'brand_markup'
  | 'claude_typical'
  | 'category_prior'
  | 'global_prior';
export type SpreadFrom = 'own_prices' | 'leaf_category' | 'parent_category' | 'claude' | 'prior';
export type Confidence = 'high' | 'medium' | 'low';
export type Zone = 'great' | 'good' | 'reasonable' | 'bad';
export type Note = 'size_assumed' | 'other_region' | 'old_prices' | 'identity_conflict' | 'claude_estimate' | 'few_prices';
export type PerUnitLabel = 'per 100 g' | 'per 100 ml' | 'each' | 'per kg';

export interface Dot {
  readonly cents: number;
  readonly store: string;
  readonly city: string | null;
  readonly seenOn: string;
  readonly kind: 'regular' | 'sale';
  readonly quantity: string | null;
}

export interface ShopperPlacement {
  readonly cents: number;
  readonly zone: Zone;
  readonly offByPct: number;
  readonly beyond: 'low' | 'high' | null;
  readonly suspect: { readonly suggestCents: number } | null;
}

export interface Thresholds {
  readonly greatPct: number;
  readonly goodPct: number;
  readonly badPct: number;
  readonly fromShopper: boolean;
}

/** The response contract, field for field. Do not rename: a screen lane builds against these names. */
export interface Verdict {
  readonly kind: 'distribution';
  readonly currency: string;
  readonly centreCents: number;
  readonly sigmaLog: number;
  readonly p10Cents: number;
  readonly p90Cents: number;
  readonly basis: Basis;
  readonly spreadFrom: SpreadFrom;
  readonly confidence: Confidence;
  readonly n: number;
  readonly perUnit: { readonly label: PerUnitLabel; readonly centreCents: number } | null;
  readonly scaledTo: string | null;
  readonly dots: readonly Dot[];
  readonly biggerPack: { readonly quantity: string; readonly perUnitCents: number; readonly store: string } | null;
  readonly shopper: ShopperPlacement | null;
  readonly thresholds: Thresholds;
  readonly notes: readonly Note[];
}

export interface EstimateItem {
  readonly barcode?: string | null;
  readonly name?: string | null;
  readonly brand?: string | null;
  /** As printed: "750 ml", "6 x 355 ml". */
  readonly size?: string | null;
  readonly leafCategory?: string | null;
  /** Broad to specific. */
  readonly categoryPath?: readonly string[] | null;
  /** The shopper's province or state, in English ("British Columbia"), or null when unknown. */
  readonly region?: string | null;
  /** ISO country code of the market ("CA"), for the Claude ask. */
  readonly country?: string | null;
  /** Default 'CAD'. */
  readonly currency?: string | null;
  /** ISO date the estimate is for. */
  readonly asOf: string;
  /** A weighed item (variable-measure label, loose produce): the bell is per kg (design case 10). */
  readonly weighed?: boolean;
}

export interface ShopperInput {
  /** The shelf price, whole cents. */
  readonly cents: number;
  /** Its currency, when it is not the item's. */
  readonly currency?: string | null;
  /**
   * The shopper's own lines: `{ greatPct, goodPct, badPct }`, or the client's
   * `{ unit: 'percent' | 'amount', great, good, bad }` (amount in dollars).
   */
  readonly thresholds?: unknown;
}

export interface ClaudeIdentity {
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
  readonly category: string | null;
  readonly market: string;
}

export type ClaudeAnswer =
  | { readonly ok: true; readonly lowCents: number; readonly highCents: number; readonly currency: string }
  | { readonly ok: false; readonly reason: string };

export interface EstimateDeps {
  /** The price database, read-only. Null: every price rung is empty. */
  readonly prices: DatabaseSync | null;
  /** The catalogue (`product` table), read-only. Optional. */
  readonly catalogue?: DatabaseSync | null;
  /** The category taxonomy the parent rung is read from (B2). Absent or null: the tag before the leaf, flagged `parent_unchecked` on the rung. */
  readonly taxonomy?: Taxonomy | null;
  /** The capped, no-web-search Claude range ask. Absent: the rung is skipped. */
  readonly askClaude?: (identity: ClaudeIdentity) => Promise<ClaudeAnswer>;
  /** How long the Claude rung is waited for. Default CLAUDE_WAIT_MS. */
  readonly claudeWaitMs?: number;
  /** Places a name in a category (the existing catalogue search), for an item with none (design cases 2 and 5). */
  readonly sortName?: (name: string) => Promise<{ leafCategory: string | null; categoryPath: readonly string[] } | null>;
  /** Places a price row with no barcode in a category (broad to specific), or null. Absent: such rows stay out. */
  readonly categoryOfUnbarcoded?: (row: { name: string; storeCategory: string | null; seller: string }) => readonly string[] | null;
  /** One unit of each key currency in the item's currency (design case 26). No rate: the shopper's price is not placed. */
  readonly fxRates?: Readonly<Record<string, number>>;
}

export interface RungTried {
  readonly rung: Basis;
  readonly outcome: 'used' | 'too_few' | 'not_applicable' | 'failed';
  /** `parent_unchecked`: the parent rung was taken by position, never checked against a taxonomy. */
  readonly flag?: 'parent_unchecked';
  readonly n: number;
  readonly detail?: string;
}

export interface EstimateTrace {
  readonly tried: readonly RungTried[];
  /** The Claude rung's outcome when it was reached, else null. */
  readonly claude: ClaudeAnswer | { readonly ok: false; readonly reason: 'timeout' | 'threw' } | null;
  /** Design case 9: the catalogue and the store row disagree on the size. The caller logs it. */
  readonly conflict: { readonly barcode: string; readonly catalogueSize: string; readonly storeSize: string } | null;
  /** The category the name was sorted into, when the item came with none. */
  readonly sorted: { readonly leafCategory: string | null; readonly categoryPath: readonly string[] } | null;
  /** The name the estimate used (the store's own product name when the catalogue had none). */
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  /** Own regular prices behind the centre (shops). */
  readonly ownShops: number;
}

export interface EstimateResult {
  readonly verdict: Verdict;
  readonly trace: EstimateTrace;
}

/* --------------------------------------------------------------- codes */

function codeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

function spellings(code: string): string[] {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return [d];
  const bare = codeKey(d);
  const out = [d, bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  return [...new Set(out)];
}

function reservedHost(url: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return /(^|\.)example\.(com|net|org)$/.test(host) || /\.(example|test|invalid|localhost)$/.test(host) || host === 'localhost';
}

/* ---------------------------------------------------------------- rows */

interface Row {
  /** codeKey of `code`, else of `page_gtin`; null when the row has no barcode. */
  readonly key: string | null;
  readonly seller: string;
  readonly sku: string;
  readonly shop: string;
  readonly cents: number;
  readonly sale: boolean;
  readonly seenOn: string;
  readonly age: number;
  readonly region: string | null;
  readonly store: string;
  readonly city: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly sizeText: string | null;
  readonly size: ComparisonQuantity | null;
  readonly storeCategory: string | null;
  /** Derived from a printout: never an own price. */
  readonly printout: boolean;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function posInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

/** A size from printed text, via the size system: the quantity parser, then the name's own tail. */
function sizeFromText(text: string | null): { q: ComparisonQuantity; text: string } | null {
  if (!text) return null;
  const p = parseQuantity(text);
  if (p) {
    const q = toComparison(p.value, p.unit);
    if (q) return { q, text: `${p.value} ${p.unit}` };
  }
  return null;
}

function sizeFromName(name: string | null): { q: ComparisonQuantity; text: string } | null {
  const f = fillFromName ? fillFromName(name) : null;
  if (!f) return null;
  const q = toComparison(f.value, f.unit);
  return q ? { q, text: f.matchedText } : null;
}

function readRows(db: DatabaseSync, currency: string, asOf: string): Row[] {
  const have = new Set((db.prepare('PRAGMA table_info(observation)').all() as { name: string }[]).map((c) => c.name));
  const col = (name: string) => (have.has(name) ? name : `NULL AS ${name}`);
  const rows = db
    .prepare(
      `SELECT code, ${col('page_gtin')}, seller, seller_sku, seller_name, seller_brand, price_cents, ${col('base_price_cents')},
              kind, ${col('is_sale')}, region, ${col('store_name')}, ${col('store_city')}, ${col('store_osm')}, seen_on, url,
              ${col('parsed_size')}, ${col('parsed_brand')}, ${col('store_category')}, ${col('capture_tile_id')}, ${col('price_verified')}
         FROM observation WHERE currency = ?`,
    )
    .all(currency) as Record<string, unknown>[];
  const out: Row[] = [];
  for (const r of rows) {
    const price = posInt(r.price_cents);
    const seen = str(r.seen_on);
    const seller = str(r.seller);
    if (price === null || seen === null || seller === null) continue;
    if (reservedHost(str(r.url))) continue;
    let age: number;
    try {
      if (isFutureDated(seen, asOf)) continue;
      age = ageDays(seen, asOf);
    } catch {
      continue;
    }
    if (age > HORIZON_DAYS) continue;
    const printout = r.capture_tile_id !== null && r.capture_tile_id !== undefined;
    if (printout && r.price_verified !== 1) continue;
    // Like with like: the pre-tax figure where the row carries one (design case 22).
    const cents = posInt(r.base_price_cents) ?? price;
    const code = str(r.code) ?? str(r.page_gtin);
    const name = str(r.seller_name) ?? '';
    const parsed = sizeFromText(str(r.parsed_size)) ?? sizeFromName(name);
    const place = (r.store_osm ?? r.store_name ?? r.region ?? '') as string;
    out.push({
      key: code ? codeKey(code) : null,
      seller,
      sku: str(r.seller_sku) ?? '',
      shop: `${seller}|${String(place).toLowerCase().trim()}`,
      cents,
      sale: r.kind === 'promotional' || r.is_sale === 1,
      seenOn: seen.slice(0, 10),
      age,
      region: str(r.region),
      store: str(r.store_name) ?? seller,
      city: str(r.store_city),
      name,
      brand: str(r.seller_brand) ?? str(r.parsed_brand),
      sizeText: parsed?.text ?? null,
      size: parsed?.q ?? null,
      storeCategory: str(r.store_category),
      printout,
    });
  }
  return out;
}

/* ----------------------------------------------------------- catalogue */

interface CatRow {
  readonly key: string;
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: ComparisonQuantity | null;
  readonly sizeText: string | null;
  readonly leaf: string | null;
  readonly path: readonly string[];
}

function parsePath(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  try {
    const p = JSON.parse(v) as unknown;
    return Array.isArray(p) ? p.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function readCatalogue(db: DatabaseSync, codes: readonly string[]): Map<string, CatRow> {
  const out = new Map<string, CatRow>();
  if (codes.length === 0) return out;
  const have = new Set((db.prepare('PRAGMA table_info(product)').all() as { name: string }[]).map((c) => c.name));
  const col = (name: string) => (have.has(name) ? name : `NULL AS ${name}`);
  const all = [...new Set(codes.flatMap(spellings))];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const rows = db
      .prepare(
        `SELECT code, name, ${col('name_en')}, ${col('brands')}, ${col('quantity')}, ${col('size_value')}, ${col('size_unit')},
                ${col('category_path')}, ${col('leaf_category')}
           FROM product WHERE code IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as Record<string, unknown>[];
    for (const r of rows) {
      const key = codeKey(String(r.code));
      if (out.has(key)) continue;
      const quantity = str(r.quantity);
      const fromCols = toComparison(typeof r.size_value === 'number' ? r.size_value : null, str(r.size_unit));
      const fromText = sizeFromText(quantity);
      const size = fromText?.q ?? fromCols ?? null;
      const path = parsePath(r.category_path);
      const name = str(r.name_en) ?? str(r.name);
      out.set(key, {
        key,
        name,
        brand: (str(r.brands) ?? '').split(',')[0]?.trim() || null,
        size,
        sizeText: quantity ?? (fromCols ? `${fromCols.original.value} ${fromCols.original.unit}` : null),
        leaf: str(r.leaf_category) ?? path[path.length - 1] ?? null,
        path,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------- products */

interface Product {
  readonly key: string;
  readonly barcoded: boolean;
  readonly name: string;
  readonly brand: string | null;
  readonly size: ComparisonQuantity | null;
  readonly sizeText: string | null;
  readonly leaf: string | null;
  readonly path: readonly string[];
  /** Median of its shops' latest regular prices, whole cents. */
  readonly cents: number;
  readonly newestAge: number;
  readonly store: string;
}

/** One price per shop: the latest; on the same day, the lower. */
function latestPerShop<T extends { shop: string; seenOn: string; cents: number }>(rows: readonly T[]): T[] {
  const by = new Map<string, T>();
  for (const o of rows) {
    const have = by.get(o.shop);
    if (!have || o.seenOn > have.seenOn || (o.seenOn === have.seenOn && o.cents < have.cents)) by.set(o.shop, o);
  }
  return [...by.values()];
}

function medianOf(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[nearestRankIndex(s.length, 50)]!;
}

function buildProducts(
  rows: readonly Row[],
  cat: ReadonlyMap<string, CatRow>,
  categoryOfUnbarcoded: EstimateDeps['categoryOfUnbarcoded'],
): Product[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.sale) continue;
    const k = r.key ?? `nobarcode:${r.seller}|${r.sku}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: Product[] = [];
  for (const [k, g] of groups) {
    const barcoded = g[0]!.key !== null;
    const c = barcoded ? cat.get(k) ?? null : null;
    let leaf = c?.leaf ?? null;
    let path: readonly string[] = c?.path ?? [];
    if (!barcoded) {
      if (!categoryOfUnbarcoded) continue;
      let placed: readonly string[] | null = null;
      try {
        placed = categoryOfUnbarcoded({ name: g[0]!.name, storeCategory: g[0]!.storeCategory, seller: g[0]!.seller });
      } catch {
        placed = null;
      }
      if (!placed || placed.length === 0) continue;
      path = placed;
      leaf = placed[placed.length - 1]!;
    }
    const shops = latestPerShop(g);
    const newest = shops.reduce((a, s) => (s.seenOn > a.seenOn ? s : a), shops[0]!);
    const size = c?.size ?? newest.size;
    out.push({
      key: k,
      barcoded,
      name: c?.name ?? newest.name,
      brand: c?.brand ?? newest.brand,
      size,
      sizeText: c?.sizeText ?? newest.sizeText,
      leaf,
      path,
      cents: medianOf(shops.map((s) => s.cents)),
      newestAge: Math.min(...shops.map((s) => s.age)),
      store: newest.store,
    });
  }
  return out;
}

/* --------------------------------------------------------------- stats */

interface Stats {
  readonly n: number;
  readonly mu: number;
  /** IQR / 1.349 on the log values. */
  readonly sigma: number;
  /** Nearest-rank 10th and 90th percentile of the same kept log values: prices the group really holds. */
  readonly p10: number;
  readonly p90: number;
  readonly newestAge: number;
}

function statsOf(points: readonly { log: number; age: number }[]): Stats | null {
  if (points.length === 0) return null;
  // A point more than 5x off the median is a wrong row (design case 19): out, then recount.
  const m0 = medianOf(points.map((p) => p.log));
  const kept = points.filter((p) => Math.abs(p.log - m0) <= Math.log(WRONG_ROW_FACTOR));
  const s = kept.map((p) => p.log).sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  return {
    n,
    mu: s[nearestRankIndex(n, 50)]!,
    sigma: (s[nearestRankIndex(n, 75)]! - s[nearestRankIndex(n, 25)]!) / 1.349,
    p10: s[nearestRankIndex(n, 10)]!,
    p90: s[nearestRankIndex(n, 90)]!,
    newestAge: Math.min(...kept.map((p) => p.age)),
  };
}

function weightedMedian(points: readonly { log: number; w: number }[]): number {
  const s = [...points].sort((a, b) => a.log - b.log);
  const total = s.reduce((a, p) => a + p.w, 0);
  let cum = 0;
  for (const p of s) {
    cum += p.w;
    if (cum >= total / 2) return p.log;
  }
  return s[s.length - 1]!.log;
}

/**
 * The log prices of `members`, scaled to `target` when there is one (same
 * family, and inside the pack-size band when `band`), else per item at any size.
 */
function poolPoints(
  members: readonly Product[],
  target: ComparisonQuantity | null,
  band: boolean,
): { log: number; age: number }[] {
  const out: { log: number; age: number }[] = [];
  for (const p of members) {
    if (target) {
      if (!p.size || p.size.family !== target.family) continue;
      const r = p.size.baseValue / target.baseValue;
      if (band && (r < BAND_LOW || r > BAND_HIGH)) continue;
      out.push({ log: Math.log((p.cents * target.baseValue) / p.size.baseValue), age: p.newestAge });
    } else {
      out.push({ log: Math.log(p.cents), age: p.newestAge });
    }
  }
  return out;
}

/* -------------------------------------------------------------- naming */

const PACK_WORDS = new Set(['pack', 'pk', 'bottle', 'bottles', 'can', 'cans', 'x', 'size', 'format']);
const SIZE_TOKENS = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\b/g;

function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Normalised brand and name, sizes and pack words out: two sizes of one product share it. */
export function productKey(name: string | null, brand: string | null): string | null {
  if (!name) return null;
  const lower = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(SIZE_TOKENS, (whole, _p, v: string, u: string) => (toComparison(Number(v), u) ? ' ' : whole));
  const b = words(brand ?? '');
  const bs = new Set(b);
  const t = words(lower).filter((w) => !bs.has(w) && !PACK_WORDS.has(w));
  if (t.length === 0) return null;
  if (b.length === 0 && t.length < 2) return null;
  return `${b.join(' ')}|${t.join(' ')}`;
}

function brandKey(brand: string | null): string | null {
  const w = words(brand ?? '');
  return w.length ? w.join(' ') : null;
}

/* ----------------------------------------------------------- regions */

const PROVINCES = new Set(
  [
    'alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland and labrador', 'nova scotia',
    'ontario', 'prince edward island', 'quebec', 'saskatchewan', 'northwest territories', 'nunavut', 'yukon',
    'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'pe', 'qc', 'sk', 'nt', 'nu', 'yt',
  ],
);
const ABBREV: Readonly<Record<string, string>> = {
  ab: 'alberta', bc: 'british columbia', mb: 'manitoba', nb: 'new brunswick', nl: 'newfoundland and labrador',
  ns: 'nova scotia', on: 'ontario', pe: 'prince edward island', qc: 'quebec', sk: 'saskatchewan',
  nt: 'northwest territories', nu: 'nunavut', yt: 'yukon',
};

/** A province name, normalised, or null when the text is not one (Open Prices keeps a shop id in `region`). */
function province(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!PROVINCES.has(t)) return null;
  return ABBREV[t] ?? t;
}

/* ---------------------------------------------------------- thresholds */

function pctOk(v: unknown, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
}

/**
 * The shopper's own lines, or the defaults. Reads the contract's own shape
 * (`greatPct`, `goodPct`, `badPct`) and the client store's
 * (`{ unit: 'percent' | 'amount', great, good, bad }`, amount in dollars,
 * turned into a percent of this item's centre). A line not given keeps its default.
 */
export function readThresholds(raw: unknown, centreCents: number): Thresholds {
  return readThresholdsGiven(raw, centreCents).thresholds;
}

/** Which of the three lines the shopper actually set (the rest are defaults). */
export interface LinesGiven {
  readonly greatPct: boolean;
  readonly goodPct: boolean;
  readonly badPct: boolean;
}

function readThresholdsGiven(raw: unknown, centreCents: number): { thresholds: Thresholds; given: LinesGiven } {
  const out = { greatPct: DEFAULT_THRESHOLDS.greatPct as number, goodPct: DEFAULT_THRESHOLDS.goodPct as number, badPct: DEFAULT_THRESHOLDS.badPct as number };
  const given = { greatPct: false, goodPct: false, badPct: false };
  let fromShopper = false;
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      obj = null;
    }
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const direct = { greatPct: pctOk(o.greatPct, 99), goodPct: pctOk(o.goodPct, 99), badPct: pctOk(o.badPct, 1000) };
    const amount = o.unit === 'amount';
    const toPct = (v: unknown, max: number): number | null => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
      if (!amount) return pctOk(v, max);
      if (centreCents <= 0) return null;
      return Math.min(max, Math.round(((v * 100) / centreCents) * 1000) / 10);
    };
    const client = { greatPct: toPct(o.great, 99), goodPct: toPct(o.good, 99), badPct: toPct(o.bad, 1000) };
    for (const k of ['greatPct', 'goodPct', 'badPct'] as const) {
      const v = direct[k] ?? client[k];
      if (v !== null) {
        out[k] = v;
        given[k] = true;
        fromShopper = true;
      }
    }
  }
  return { thresholds: { ...out, fromShopper }, given };
}

/**
 * B6 (docs/category-safeguards-2026-10-08.md). An answer that stands on the
 * category alone has no price of its own, so a normal price is not "good" just
 * for being a cheap item of its group, nor "bad" for being a dear one. For such
 * an answer the good cut-off is the STRICTER (lower) of the line and the group's
 * 10th percentile of comparable unit prices, and the bad cut-off the stricter
 * (higher) of the line and its 90th percentile. Great keeps its gap past good.
 * The percentiles are nearest-rank on the same kept rows the centre comes from.
 *
 * A line the shopper set himself is his and is kept as typed; the group's
 * percentile replaces only a default line. (The B6 control with the shopper's own
 * 10% lines must still call ordinary prices good and bad.)
 */
export function categoryOnlyLines(base: Thresholds, given: LinesGiven, mu: number, p10Log: number, p90Log: number): Thresholds {
  const up1 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10;
  const underPct = up1(Math.min(99, Math.max(0, (1 - Math.exp(p10Log - mu)) * 100)));
  const overPct = up1(Math.min(1000, Math.max(0, (Math.exp(p90Log - mu) - 1) * 100)));
  const goodPct = given.goodPct ? base.goodPct : Math.max(base.goodPct, underPct);
  const badPct = given.badPct ? base.badPct : Math.max(base.badPct, overPct);
  // Great stays as far past good as the base lines put it, so the good band does not vanish.
  const greatPct = given.greatPct ? base.greatPct : Math.min(99, Math.max(base.greatPct, goodPct + Math.max(0, base.greatPct - base.goodPct)));
  return { greatPct, goodPct, badPct, fromShopper: base.fromShopper };
}

/* ------------------------------------------------------------- shopper */

function zoneOf(cents: number, centre: number, t: Thresholds): Zone {
  if (cents <= centre * (1 - t.greatPct / 100)) return 'great';
  if (cents <= centre * (1 - t.goodPct / 100)) return 'good';
  if (cents >= centre * (1 + t.badPct / 100)) return 'bad';
  return 'reasonable';
}

function placeShopper(
  cents: number,
  mu: number,
  sigma: number,
  centreCents: number,
  t: Thresholds,
  target: ComparisonQuantity | null,
  weighed: boolean,
): ShopperPlacement {
  const x = Math.log(cents);
  const z = (x - mu) / sigma;
  const p1 = Math.exp(mu - Z01 * sigma);
  const p99 = Math.exp(mu + Z01 * sigma);
  const p10 = Math.exp(mu - Z10 * sigma);
  const p90 = Math.exp(mu + Z10 * sigma);
  let suspect: { suggestCents: number } | null = null;
  if (Math.abs(z) > SUSPECT_SIGMA) {
    const readings: number[] = z > 0 ? [cents / 100] : [cents * 100];
    // A per-kg price typed for a packed item: what the pack would cost at that rate.
    if (target && target.family === 'mass' && !weighed) readings.push((cents * target.baseValue) / 1000);
    for (const r of readings) {
      const c = Math.round(r);
      if (c > 0 && c >= p10 && c <= p90) {
        suspect = { suggestCents: c };
        break;
      }
    }
  }
  return {
    cents,
    zone: zoneOf(cents, centreCents, t),
    offByPct: Math.round(((cents - centreCents) / centreCents) * 1000) / 10,
    beyond: cents < p1 ? 'low' : cents > p99 ? 'high' : null,
    suspect,
  };
}

/* ---------------------------------------------------------------- misc */

function sizeLabel(q: ComparisonQuantity): string {
  return `${Number(q.original.value.toFixed(3))} ${q.original.unit}`;
}

function perUnitLabel(q: ComparisonQuantity): PerUnitLabel {
  return q.label === '100 g' ? 'per 100 g' : q.label === '100 ml' ? 'per 100 ml' : 'each';
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- main */

/**
 * The verdict for one item. Never throws: a broken price file is an empty
 * one, a failed Claude ask is the next rung, and the last rung always draws.
 */
export async function estimate(item: EstimateItem, shopper: ShopperInput | null, deps: EstimateDeps): Promise<EstimateResult> {
  const currency = (item.currency ?? 'CAD').trim().toUpperCase() || 'CAD';
  const tried: RungTried[] = [];
  const notes = new Set<Note>();
  let claudeTrace: EstimateTrace['claude'] = null;
  await loadSizeFill();

  /* ---- data */
  let rows: Row[] = [];
  if (deps.prices) {
    try {
      rows = readRows(deps.prices, currency, item.asOf);
    } catch {
      rows = [];
    }
  }
  const barcode = item.barcode?.trim() ? item.barcode.trim() : null;
  const selfKey = barcode ? codeKey(barcode) : null;
  let cat = new Map<string, CatRow>();
  if (deps.catalogue) {
    try {
      const keys = [...new Set(rows.map((r) => r.key).filter((k): k is string => k !== null))];
      cat = readCatalogue(deps.catalogue, selfKey ? [...keys, barcode!] : keys);
    } catch {
      cat = new Map();
    }
  }
  const selfCat = selfKey ? cat.get(selfKey) ?? null : null;
  const ownAll = selfKey ? rows.filter((r) => r.key === selfKey && !r.printout) : [];
  const ownNewest = [...ownAll].sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : 0))[0] ?? null;

  /* ---- identity: the catalogue first, else the store's own product name (design case 2) */
  const name = str(item.name) ?? selfCat?.name ?? ownNewest?.name ?? null;
  const brand = str(item.brand) ?? selfCat?.brand ?? ownNewest?.brand ?? null;
  let path: readonly string[] = item.categoryPath && item.categoryPath.length > 0 ? item.categoryPath : selfCat?.path ?? [];
  let leaf: string | null = str(item.leafCategory) ?? selfCat?.leaf ?? path[path.length - 1] ?? null;
  let sorted: EstimateTrace['sorted'] = null;
  if (!leaf && path.length === 0 && name && deps.sortName) {
    try {
      const s = await deps.sortName(name);
      if (s && (s.leafCategory || s.categoryPath.length > 0)) {
        sorted = s;
        path = s.categoryPath;
        leaf = s.leafCategory ?? s.categoryPath[s.categoryPath.length - 1] ?? null;
      }
    } catch {
      sorted = null;
    }
  }
  if (leaf && !path.includes(leaf)) path = [...path, leaf];

  /* ---- size: as given, the catalogue's, the store row's, then the name's tail */
  let target: ComparisonQuantity | null = null;
  let sizeText: string | null = null;
  if (item.weighed) {
    target = toComparison(1, 'kg');
    sizeText = '1 kg';
  } else {
    const given = sizeFromText(str(item.size));
    const pick = given ?? (selfCat?.size ? { q: selfCat.size, text: selfCat.sizeText ?? sizeLabel(selfCat.size) } : null) ??
      (ownNewest?.size ? { q: ownNewest.size, text: ownNewest.sizeText! } : null) ?? sizeFromName(name);
    target = pick?.q ?? null;
    sizeText = pick?.text ?? null;
  }

  /* ---- design case 9: the catalogue and the store row disagree on the size */
  let conflict: EstimateTrace['conflict'] = null;
  if (!item.weighed && selfCat?.size) {
    const store = ownAll.find((r) => r.size !== null);
    if (store?.size) {
      const a = selfCat.size;
      const b = store.size;
      const r = a.family === b.family ? b.baseValue / a.baseValue : 0;
      if (r < 1 / 1.05 || r > 1.05) {
        conflict = { barcode: barcode!, catalogueSize: selfCat.sizeText ?? sizeLabel(a), storeSize: store.sizeText ?? sizeLabel(b) };
        notes.add('identity_conflict');
        // The store row's size is used for the price.
        target = b;
        sizeText = store.sizeText ?? sizeLabel(b);
      }
    }
  }

  /* ---- products and category pools */
  const products = buildProducts(rows, cat, deps.categoryOfUnbarcoded).filter((p) => p.key !== selfKey);
  // The parent rung is the taxonomy parent of the leaf (B2); with no taxonomy, the tag before the leaf and the rung says parent_unchecked.
  const { parent, unchecked: parentUnchecked } = parentOf(leaf, path, deps.taxonomy ?? null);
  const parentFlag = parentUnchecked ? { flag: 'parent_unchecked' as const } : {};
  const inLeaf = (tag: string) => products.filter((p) => p.leaf === tag);
  const inTree = (tag: string) => products.filter((p) => p.path.includes(tag));
  const categoryStats = (members: readonly Product[]): Stats | null => {
    const s = statsOf(poolPoints(members, target, target !== null));
    return s && s.n >= MIN_CATEGORY_PRODUCTS ? s : null;
  };
  const leafStats = leaf ? categoryStats(inLeaf(leaf)) : null;
  const parentStats = parent ? categoryStats(inTree(parent)) : null;
  const catStats = leafStats ?? parentStats;

  /* ---- own prices */
  const ownRegular = ownAll.filter((r) => !r.sale);
  const wrongCut = catStats ? Math.log(WRONG_ROW_FACTOR) : Infinity;
  const plausible = ownRegular.filter((r) => !catStats || Math.abs(Math.log(r.cents) - catStats.mu) <= wrongCut);
  const wantRegion = province(item.region);
  const otherRegion = (r: Row) => {
    const p = province(r.region);
    return wantRegion !== null && p !== null && p !== wantRegion;
  };
  let regional = plausible.filter((r) => !otherRegion(r));
  let fromOtherRegion = false;
  if (regional.length === 0 && plausible.length > 0) {
    regional = plausible;
    fromOtherRegion = wantRegion !== null;
  }
  const shopsAll = latestPerShop(regional);
  const fresh = shopsAll.filter((s) => s.age <= WINDOW_DAYS);
  const ownShops = fresh.length > 0 ? fresh : shopsAll;
  const ownAged = fresh.length === 0 && shopsAll.length > 0;

  let basis: Basis | null = null;
  let mu = 0;
  let n = 0;
  let evidenceAge: number | null = null;
  let claudeSigma: number | null = null;
  let priorStats: Stats | null = null;
  let scaled = false;

  if (ownShops.length > 0) {
    const muOwn = ownAged
      ? weightedMedian(ownShops.map((s) => ({ log: Math.log(s.cents), w: Math.pow(0.5, s.age / HALF_LIFE_DAYS) })))
      : medianOf(ownShops.map((s) => Math.log(s.cents)));
    n = ownShops.length;
    mu = catStats ? (n * muOwn + BLEND_K * catStats.mu) / (n + BLEND_K) : muOwn;
    basis = 'own_prices';
    evidenceAge = Math.min(...ownShops.map((s) => s.age));
    if (fromOtherRegion) notes.add('other_region');
    tried.push({ rung: 'own_prices', outcome: 'used', n });
  } else {
    tried.push({ rung: 'own_prices', outcome: selfKey ? 'too_few' : 'not_applicable', n: 0 });
  }

  /* ---- same product, other sizes; the bigger pack is a side note only (design call 2) */
  const pKey = productKey(name, brand);
  const sameProduct = pKey && target ? products.filter((p) => p.barcoded && p.size?.family === target!.family && productKey(p.name, p.brand) === pKey) : [];
  let biggerPack: Verdict['biggerPack'] = null;
  if (target) {
    let best: { perUnit: number; p: Product } | null = null;
    for (const p of sameProduct) {
      if (p.size!.baseValue / target.baseValue <= BAND_HIGH) continue;
      const perUnit = (p.cents * target.perQuantity) / p.size!.baseValue;
      if (!best || perUnit < best.perUnit) best = { perUnit, p };
    }
    if (best) biggerPack = { quantity: best.p.sizeText ?? sizeLabel(best.p.size!), perUnitCents: Math.round(best.perUnit), store: best.p.store };
  }
  if (basis === null) {
    const pts = poolPoints(sameProduct, target, true);
    if (pts.length > 0) {
      const s = statsOf(pts)!;
      basis = 'other_size';
      mu = s.mu;
      n = s.n;
      evidenceAge = s.newestAge;
      scaled = true;
      tried.push({ rung: 'other_size', outcome: 'used', n });
    } else {
      tried.push({ rung: 'other_size', outcome: pKey && target ? 'too_few' : 'not_applicable', n: 0 });
    }
  }

  /* ---- leaf, then parent (a missing size: per item, any size, noted and wider; design case 4) */
  for (const [rung, tag, stats] of [
    ['leaf_category', leaf, leafStats],
    ['parent_category', parent, parentStats],
  ] as const) {
    if (basis !== null) break;
    if (!tag) {
      tried.push({ rung, outcome: 'not_applicable', n: 0 });
      continue;
    }
    if (stats) {
      basis = rung;
      mu = stats.mu;
      n = stats.n;
      evidenceAge = stats.newestAge;
      scaled = target !== null;
      if (!target) notes.add('size_assumed');
      tried.push({ rung, outcome: 'used', n, detail: tag, ...(rung === 'parent_category' ? parentFlag : {}) });
    } else {
      tried.push({ rung, outcome: 'too_few', n: 0, detail: tag, ...(rung === 'parent_category' ? parentFlag : {}) });
    }
  }

  /* ---- brand markup (RULINGS "Always answer": a name brand with no data gets its category markup) */
  if (basis === null) {
    const bk = brandKey(brand);
    let used = false;
    if (bk && path.length > 0) {
      const leafUnit = new Map<string, number | null>();
      const unitMedian = (tag: string, family: string): number | null => {
        const k = `${tag}|${family}`;
        if (!leafUnit.has(k)) {
          const pts = products
            .filter((p) => p.leaf === tag && p.size?.family === family)
            .map((p) => ({ log: Math.log(p.cents / p.size!.baseValue), age: p.newestAge }));
          const s = statsOf(pts);
          leafUnit.set(k, s && s.n >= MIN_CATEGORY_PRODUCTS ? s.mu : null);
        }
        return leafUnit.get(k)!;
      };
      const ratios: number[] = [];
      for (const p of products) {
        if (!p.size || !p.leaf || brandKey(p.brand) !== bk) continue;
        const m = unitMedian(p.leaf, p.size.family);
        if (m !== null) ratios.push(Math.log(p.cents / p.size.baseValue) - m);
      }
      if (ratios.length >= 3) {
        const ratio = medianOf(ratios);
        for (let i = path.length - 1; i >= 0; i -= 1) {
          const s = statsOf(poolPoints(inTree(path[i]!), target, false));
          if (s && s.n >= MIN_CATEGORY_PRODUCTS) {
            basis = 'brand_markup';
            mu = s.mu + ratio;
            n = ratios.length;
            evidenceAge = s.newestAge;
            scaled = target !== null;
            if (!target) notes.add('size_assumed');
            used = true;
            tried.push({ rung: 'brand_markup', outcome: 'used', n, detail: path[i]! });
            break;
          }
        }
      }
      if (!used) tried.push({ rung: 'brand_markup', outcome: 'too_few', n: ratios.length });
    } else {
      tried.push({ rung: 'brand_markup', outcome: 'not_applicable', n: 0 });
    }
  }

  /* ---- Claude, cheapest, no web search, capped; down, capped, slow or keyless: the next rung */
  if (basis === null) {
    if (!deps.askClaude || !name) {
      tried.push({ rung: 'claude_typical', outcome: 'not_applicable', n: 0, detail: !name ? 'no_name' : 'no_ask' });
    } else {
      let got: ClaudeAnswer | 'timeout';
      try {
        got = await withTimeout(
          deps.askClaude({
            name,
            brand,
            size: sizeText,
            category: leaf ? leaf.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ') : null,
            market: (item.country ?? '').trim().toUpperCase(),
          }),
          deps.claudeWaitMs ?? CLAUDE_WAIT_MS,
        );
      } catch {
        got = { ok: false, reason: 'threw' };
      }
      if (got === 'timeout') {
        claudeTrace = { ok: false, reason: 'timeout' };
        tried.push({ rung: 'claude_typical', outcome: 'failed', n: 0, detail: 'timeout' });
      } else if (!got.ok) {
        claudeTrace = got;
        tried.push({ rung: 'claude_typical', outcome: 'failed', n: 0, detail: got.reason });
      } else if (
        got.currency !== currency ||
        !Number.isInteger(got.lowCents) ||
        !Number.isInteger(got.highCents) ||
        got.lowCents <= 0 ||
        got.highCents < got.lowCents
      ) {
        claudeTrace = { ok: false, reason: 'unusable_range' };
        tried.push({ rung: 'claude_typical', outcome: 'failed', n: 0, detail: 'unusable_range' });
      } else {
        claudeTrace = got;
        const lo = Math.log(got.lowCents);
        const hi = Math.log(got.highCents);
        basis = 'claude_typical';
        mu = (lo + hi) / 2;
        claudeSigma = (hi - lo) / (2 * Z10);
        n = 0;
        notes.add('claude_estimate');
        tried.push({ rung: 'claude_typical', outcome: 'used', n: 0 });
      }
    }
  }

  /* ---- the priors: always drawable */
  const widest = path[0] ?? null;
  const categoryPrior = widest ? statsOf(poolPoints(inTree(widest), null, false)) : null;
  const allRegular = rows.filter((r) => !r.sale);
  const globalPrior = statsOf(latestPerShop(allRegular.map((r) => ({ ...r, shop: `${r.key ?? r.seller + r.sku}|${r.shop}` }))).map((r) => ({ log: Math.log(r.cents), age: r.age })));
  if (basis === null) {
    if (categoryPrior && categoryPrior.n >= MIN_PRIOR_PRODUCTS) {
      basis = 'category_prior';
      mu = categoryPrior.mu;
      n = categoryPrior.n;
      priorStats = categoryPrior;
      tried.push({ rung: 'category_prior', outcome: 'used', n, detail: widest! });
    } else {
      tried.push({ rung: 'category_prior', outcome: widest ? 'too_few' : 'not_applicable', n: categoryPrior?.n ?? 0 });
      basis = 'global_prior';
      if (globalPrior) {
        mu = globalPrior.mu;
        n = globalPrior.n;
        priorStats = globalPrior;
      } else {
        mu = Math.log(EMPTY_PRIOR.centreCents);
        n = 0;
      }
      tried.push({ rung: 'global_prior', outcome: 'used', n });
    }
  }

  /* ---- spread: first that applies, then the floors and the widenings */
  let sigma: number;
  let spreadFrom: SpreadFrom;
  const ownSpread = basis === 'own_prices' && ownShops.length >= OWN_SPREAD_SHOPS ? statsOf(ownShops.map((s) => ({ log: Math.log(s.cents), age: s.age }))) : null;
  if (ownSpread) {
    sigma = ownSpread.sigma;
    spreadFrom = 'own_prices';
  } else if (leafStats) {
    sigma = leafStats.sigma;
    spreadFrom = 'leaf_category';
  } else if (parentStats) {
    sigma = parentStats.sigma;
    spreadFrom = 'parent_category';
  } else if (claudeSigma !== null) {
    sigma = claudeSigma;
    spreadFrom = 'claude';
  } else {
    const prior = priorStats ?? categoryPrior ?? globalPrior;
    sigma = prior && prior.n >= 3 && prior.sigma > 0 ? prior.sigma : EMPTY_PRIOR.sigmaLog;
    spreadFrom = 'prior';
  }
  // Never below the category's spread (equal provincial prices cannot collapse the bell), never below 0.05.
  sigma = Math.max(sigma, catStats?.sigma ?? 0, MIN_SIGMA);
  if (evidenceAge !== null && evidenceAge > OLD_DAYS) notes.add('old_prices');
  if (notes.has('old_prices')) sigma *= WIDEN;
  if (notes.has('other_region')) sigma *= WIDEN;
  if (notes.has('size_assumed')) sigma *= WIDEN;

  /* ---- confidence (design call 5) */
  let confidence: Confidence = 'low';
  if (basis === 'own_prices') {
    confidence = ownShops.length >= HIGH_OWN_SHOPS && !ownAged && !notes.has('old_prices') ? 'high' : 'medium';
  } else if (basis === 'other_size') {
    confidence = 'medium';
  } else if (basis === 'leaf_category' && n >= MEDIUM_LEAF_PRODUCTS && !notes.has('size_assumed')) {
    confidence = 'medium';
  }
  if ((basis === 'own_prices' || basis === 'other_size') && n < 3) notes.add('few_prices');
  if ((basis === 'category_prior' || basis === 'global_prior') && n < MIN_CATEGORY_PRODUCTS) notes.add('few_prices');

  /* ---- the numbers */
  const centreCents = Math.max(1, Math.round(Math.exp(mu)));
  const read = readThresholdsGiven(shopper?.thresholds, centreCents);
  const categoryOnly = (basis === 'leaf_category' || basis === 'parent_category') && catStats !== null;
  const thresholds = categoryOnly ? categoryOnlyLines(read.thresholds, read.given, mu, catStats!.p10, catStats!.p90) : read.thresholds;
  let perUnit: Verdict['perUnit'] = null;
  if (item.weighed) perUnit = { label: 'per kg', centreCents };
  else if (target) perUnit = { label: perUnitLabel(target), centreCents: Math.round((centreCents * target.perQuantity) / target.baseValue) };

  const dots: Dot[] = [...ownAll]
    .sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : a.cents - b.cents))
    .slice(0, MAX_DOTS)
    .map((r) => ({
      cents: r.cents,
      store: r.store,
      city: r.city,
      seenOn: r.seenOn,
      kind: r.sale ? ('sale' as const) : ('regular' as const),
      quantity: r.sizeText ?? selfCat?.sizeText ?? null,
    }));

  let placed: ShopperPlacement | null = null;
  if (shopper && Number.isInteger(shopper.cents) && shopper.cents > 0 && !item.weighed) {
    const from = (shopper.currency ?? currency).trim().toUpperCase() || currency;
    const rate = from === currency ? 1 : deps.fxRates?.[from];
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      placed = placeShopper(Math.round(shopper.cents * rate), mu, sigma, centreCents, thresholds, target, false);
    }
  }

  const verdict: Verdict = {
    kind: 'distribution',
    currency,
    centreCents,
    sigmaLog: Math.round(sigma * 10000) / 10000,
    p10Cents: Math.max(1, Math.round(Math.exp(mu - Z10 * sigma))),
    p90Cents: Math.max(1, Math.round(Math.exp(mu + Z10 * sigma))),
    basis: basis!,
    spreadFrom,
    confidence,
    n,
    perUnit,
    scaledTo: scaled && target ? (item.weighed ? '1 kg' : sizeText ?? sizeLabel(target)) : null,
    dots,
    biggerPack,
    shopper: placed,
    thresholds,
    notes: [...notes],
  };
  return {
    verdict,
    trace: { tried, claude: claudeTrace, conflict, sorted, name, brand, size: sizeText, ownShops: basis === 'own_prices' ? ownShops.length : 0 },
  };
}

/** The contract's field names, in order, for a wire test that a response carries them exactly. */
export const VERDICT_FIELDS = [
  'kind', 'currency', 'centreCents', 'sigmaLog', 'p10Cents', 'p90Cents', 'basis', 'spreadFrom', 'confidence', 'n',
  'perUnit', 'scaledTo', 'dots', 'biggerPack', 'shopper', 'thresholds', 'notes',
] as const;
