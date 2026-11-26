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
 *   own_prices       this item's own regular prices, latest per shop, up to 2
 *                    years, each weighted by age (`ageWeight`, D-267 A3);
 *                    weighted median of shops; under 3 shops blended with the category centre,
 *                    mu = (n * mu_own + k * mu_cat) / (n + k), k = 1.
 *   cross_border     the same barcode's prices in the other of USD/CAD, times the
 *                    fitted ratio band; its shown range is exactly that band.
 *   other_size       siblings: the same first brand and name stem, same currency
 *                    and size dimension, size 5% or more apart, multipacks only
 *                    paired with multipacks (pack-count.ts). Median of
 *                    price x (size ratio)^0.69, shown as exactly [0.66, 1.51] x it.
 *   leaf_category    5+ priced products in the leaf, same unit family, pack-size
 *                    band, scaled to this size; median.
 *   parent_category  the same one level up.
 *   brand_markup     the brand's median ratio to its categories' medians, times
 *                    the nearest category centre.
 *   national_average Statistics Canada's monthly average for this staple in the
 *                    shopper's province (110 products), times its measured
 *                    shelf factor, scaled to this size, with the measured
 *                    spread (price/src/statcan.ts). Only when the caller
 *                    passes `nationalAverage`.
 *   claude_typical   the caller's capped, no-web-search Claude ask (RULINGS.md
 *                    "Catalogue first; Claude, with no web search, is the
 *                    capped price-range fallback"); its low/high read as
 *                    p10/p90. Down, capped, slow, keyless: the next rung.
 *   category_prior   the widest category Shin can place it in, any size, per item.
 *   department_prior every priced product in the item's own department, any
 *                    size, per item. With no department known, or none priced in
 *                    it, the fixed empty prior: drawn, never placed (`too_thin`).
 *
 * DEPARTMENTS (requirement 3.3, "Never pool prices across unrelated categories
 * (no all-of-Shin median)"): no rung reads a price from another department. A
 * catalogue row's department comes from its `source` (catalogue/src/placement.ts
 * DEPARTMENT_OF_SOURCE). An item's department is its own row's, else the one
 * department of the products under its deepest priced tag. Known: every pool is
 * cut to it (a product with no known department stays in a category pool, never
 * in the department prior). Unknown: a pool whose products span two departments
 * is refused, `mixed_departments`. There is no all-of-Shin rung any more.
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
import { departmentFromPath, departmentOf, fileStamp, nearestRankIndex, parentOf, readAge, MIN_CATEGORY_PRODUCTS, WINDOW_DAYS } from './range.ts';
import { flagWide, TARGET_WIDTH } from './width-flag.ts';
import { isExcludedSeller, licensedOnlySql } from '../../catalogue/src/source-rights.ts';
import type { Taxonomy } from '../../catalogue/src/category-taxonomy.ts';
import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';
import { SHOPPER_VOICE_BELOW_SHOPS, SHOPPER_VOICE_FLOOR_FRESH_DAYS, SHOPPER_VOICE_FLOOR_RATIO } from './shopper-prices.ts';
import { readPacks, sameSize } from './pack-size.ts';
import { pairable, packSide, stripPackCounts } from './pack-count.ts';
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
/**
 * How far ONE product's regular price varies from shop to shop, measured 2026-11-14 on Project Hammer's
 * 2026 prices: 14,493 products at two or more chains, sigmaLog p50 0.118, p75 0.183, p90 0.256, p95 0.301,
 * p99 0.429 (the same at 2, 3, 4 and 5+ chains). A product with own prices from fewer than
 * OWN_SPREAD_SHOPS shops takes the p90, not its category's spread: a category's spread is the spread
 * between DIFFERENT products (single packs and 5-packs, sizes unknown), and on instant noodles it drew
 * $2.35 to $20.70 around one $6.95 shelf price (Jamin 2026-11-14, RULINGS "A price range is never wider
 * than one product's prices across shops").
 */
export const SHOP_SPREAD_SIGMA = 0.26;
/** No bell is wider than this, from any rung or widening: p99 of one product across shops. 8 in 10 between x0.58 and x1.73 of the centre. */
export const MAX_SIGMA = 0.43;
/** Older than this (days), the newest price behind the centre makes it `old_prices`. */
export const OLD_DAYS = 365;
/** No price older than this (days) is read at all. */
export const HORIZON_DAYS = 730;
/**
 * D-267 A3, age weighting of own prices. Inside the range card's window (range.ts WINDOW_DAYS, 90 days)
 * a price counts in full, as the range card already treats it as current, so the bell and the card stand
 * on the same median whenever every shop is fresh (D-270 B1). Past the window it loses half its weight
 * every 180 days: 270 days old counts half, 450 days a quarter, the 730-day horizon about 8%. Shelf
 * prices move with sales cycles and yearly cost increases, so a year-old price is a weak witness of
 * today's, but it is never zero (RULINGS 2026-09-28, "every data point": weight rows, never drop them).
 */
export const HALF_LIFE_DAYS = 180;
export function ageWeight(age: number): number {
  return age <= WINDOW_DAYS ? 1 : Math.pow(0.5, (age - WINDOW_DAYS) / HALF_LIFE_DAYS);
}
/** A price this many times off its category median is a wrong row, left out of the centre. */
export const WRONG_ROW_FACTOR = 5;
/** D-267: a name-joined row agrees with the barcode-joined rows when within this factor of their median. */
export const NAME_JOIN_AGREE = 2;
/** The pack-size band: half to double this item's size. */
export const BAND_LOW = 0.5;
export const BAND_HIGH = 2;
/** A leaf category with this many priced products makes a leaf answer medium confidence. */
export const MEDIUM_LEAF_PRODUCTS = 20;
/** Own prices from this many shops, fresh, are high confidence. */
export const HIGH_OWN_SHOPS = 3;
/**
 * Own prices from this many shops give the centre and the spread on their own, with no category blend
 * and no category floor (D-270 A4/A5/B1, 2026-11-12; was 5 for the spread, and the centre always blended).
 * The same count as range.ts MIN_OWN_SHOPS, so the bell and the range card stand on the same shops.
 */
export const OWN_SPREAD_SHOPS = 3;
/** The widest-category prior needs at least this many products. */
export const MIN_PRIOR_PRODUCTS = 3;
/** At most this many dots. */
export const MAX_DOTS = 12;
/** How long the Claude rung is waited for before the ladder moves on (design case 27, "slow"). */
export const CLAUDE_WAIT_MS = 6000;
/** Default thresholds, his 2026-09-17 setup numbers (design call 4). */
export const DEFAULT_THRESHOLDS = { greatPct: 30, goodPct: 20, badPct: 20 } as const;
/**
 * The last resort when Shin holds no price in the item's department (or cannot
 * tell its department): a wide bell so the answer is still drawable. It is a
 * fixed number, not a pool, so no shopper is placed on it (`too_thin`).
 */
export const EMPTY_PRIOR = { centreCents: 1000, sigmaLog: 1 } as const;

/* ---------------------------------------------------------------- types */

export type Basis =
  | 'own_prices'
  | 'cross_border'
  | 'other_size'
  | 'leaf_category'
  | 'parent_category'
  | 'brand_markup'
  | 'national_average'
  | 'claude_typical'
  | 'category_prior'
  | 'department_prior';
export type SpreadFrom = 'own_prices' | 'cross_border' | 'other_size' | 'shop_spread' | 'leaf_category' | 'parent_category' | 'national_average' | 'claude' | 'prior';
export type Confidence = 'high' | 'medium' | 'low';
export type Zone = 'great' | 'good' | 'reasonable' | 'bad';
/**
 * `too_thin` (D-233): the only pool was too wide and Claude did not answer, so
 * the bell is drawn from a prior and no zone is given (`shopper` is null).
 */
export type Note = 'size_assumed' | 'other_region' | 'old_prices' | 'identity_conflict' | 'claude_estimate' | 'few_prices' | 'too_thin';
export type PerUnitLabel = 'per 100 g' | 'per 100 ml' | 'each' | 'per kg' | 'per lb';

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
  /**
   * The unit a weighed item is priced in: 'kg' (the default) or 'lb'. Loose produce is 'lb' (Canadian shelf tags
   * show $/lb): the bell is per lb, a category pool is scaled to one pound, and `perUnit.label` says 'per lb'.
   * Prices Pexi holds for the item itself are read as already in this unit (a weighed item's own rows carry
   * its price per unit, not per pack).
   */
  readonly weighedUnit?: 'kg' | 'lb';
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

/** What the ladder knew when it reached the Claude rung (requirement 6.1). */
export interface ClaudeAskContext {
  /** The category the item's name was sorted into, when it came with none (as `trace.sorted`). */
  readonly sorted: { readonly leafCategory: string | null; readonly categoryPath: readonly string[] } | null;
  /** A category pool was set aside as too wide on the way down (as `trace.widePool !== null`). */
  readonly poolSetAside: boolean;
}

export type ClaudeAnswer =
  | {
      readonly ok: true;
      readonly lowCents: number;
      readonly highCents: number;
      readonly currency: string;
      /**
       * D-270 A7: what one price in the range buys, as Claude stated it ("one 500 mL bottle", "per kg").
       * A rate is scaled to the item's size (or, with no size, is no shelf price and the next rung answers);
       * a pack size is scaled to the item's size (or, with none, the size is noted as assumed).
       */
      readonly unit?: string | null;
      /** D-270 A7: Claude's own confidence in its range; `low` widens the bell. */
      readonly confidence?: 'low' | 'medium' | 'high' | null;
    }
  | { readonly ok: false; readonly reason: string };

export interface EstimateDeps {
  /** The price database, read-only. Null: every price rung is empty. */
  readonly prices: DatabaseSync | null;
  /** The catalogue (`product` table), read-only. Optional. */
  readonly catalogue?: DatabaseSync | null;
  /** The category taxonomy the parent rung is read from (B2). Absent or null: the tag before the leaf, flagged `parent_unchecked` on the rung. */
  readonly taxonomy?: Taxonomy | null;
  /**
   * The capped, no-web-search Claude range ask. Absent: the rung is skipped. The second argument is
   * what the ladder knew when it reached this rung, so a caller can refuse the call when its own
   * range ladder already has a range (requirement 6.1, "0 calls where a range existed").
   */
  readonly askClaude?: (identity: ClaudeIdentity, context?: ClaudeAskContext) => Promise<ClaudeAnswer>;
  /** How long the Claude rung is waited for. Default CLAUDE_WAIT_MS. */
  readonly claudeWaitMs?: number;
  /**
   * The Statistics Canada rung (price/src/statcan.ts `nationalAverageFor` over the committed table), run
   * after Pexi's own data and before Claude. Absent: the rung is skipped, exactly as before it existed;
   * the server passes it only to a client that says it can show its source (`knows=national_average`).
   */
  readonly nationalAverage?: (q: {
    name: string | null;
    target: ComparisonQuantity | null;
    sizeText: string | null;
    path: readonly string[];
    region: string | null;
    asOf: string;
  }) => NationalAverageAnswer | { readonly miss: string };
  /** Places a name in a category (the existing catalogue search), for an item with none (design cases 2 and 5). */
  readonly sortName?: (name: string) => Promise<{ leafCategory: string | null; categoryPath: readonly string[] } | null>;
  /** Places a price row with no barcode in a category (broad to specific), or null. Absent: such rows stay out. */
  readonly categoryOfUnbarcoded?: (row: { name: string; storeCategory: string | null; seller: string }) => readonly string[] | null;
  /** One unit of each key currency in the item's currency (design case 26). No rate: the shopper's price is not placed. */
  readonly fxRates?: Readonly<Record<string, number>>;
  /**
   * Shoppers' prices for a product, as ONE voice (price/src/shopper-prices.ts `shopperVoiceFor`; the key is the code without
   * zero padding). Taken as one shop's price, only while the product has fewer than SHOPPER_VOICE_BELOW_SHOPS shop prices,
   * so it never weighs more than one shop and never lifts the answer past low confidence (decisions 2026-11-15).
   */
  readonly shopperVoice?: (codeKey: string) => { readonly cents: number; readonly seenOn: string; readonly region: string | null } | null;
}

/** What the Statistics Canada rung answers (statcan.ts `NationalAverage`, restated so this file imports no data). */
export interface NationalAverageAnswer {
  readonly centreCents: number;
  readonly sigmaLog: number;
  readonly product: string;
  readonly place: string;
  readonly month: string;
  readonly averageCents: number;
  readonly shelfFactor: number;
  readonly ratio: number;
  /** A premium version (organic, free-run ...): the premium factor was used. */
  readonly premium?: boolean;
  /** The item had no size: the product's own was assumed, and `sigmaLog` is already the wider measured spread. */
  readonly sizeAssumed?: boolean;
}

export interface RungTried {
  readonly rung: Basis;
  /** `too_wide` (D-233): enough products, but the width flag says the pool is too wide to price this item. */
  /** `mixed_departments` (3.3): the item's department is unknown and the pool spans two, so it is refused. */
  readonly outcome: 'used' | 'too_few' | 'not_applicable' | 'failed' | 'too_wide' | 'mixed_departments';
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
  /** The Statistics Canada product, place and month the centre stood on, when the verdict's basis is `national_average`. */
  readonly nationalAverage?: NationalAverageAnswer | null;
  /** The name the estimate used (the store's own product name when the catalogue had none). */
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  /** Own regular prices behind the centre (shops). */
  readonly ownShops: number;
  /**
   * D-233: the first category pool the ladder set aside as too wide, with the
   * prices it holds (scaled to this item's size where there is one, ascending),
   * so they can still be shown as context. Null when none was set aside.
   */
  readonly widePool: {
    readonly rung: 'leaf_category' | 'parent_category' | 'brand_markup';
    readonly tag: string;
    readonly n: number;
    readonly cents: readonly number[];
  } | null;
  /**
   * D-233: a pool was set aside and Claude did not answer (`why` is its reason:
   * `no_ask`, `timeout`, `threw`, a cap or key code). The verdict is drawn from a
   * prior, carries `too_thin` and no zone. Null otherwise.
   */
  readonly tooThin: { readonly why: string } | null;
  /**
   * 3.3: no rung had a price, the item's department holds none (or its
   * department is unknown) and Claude did not answer (`why` as above). The bell
   * is the fixed empty prior: drawn, never placed, `too_thin` in its notes. Not
   * a fault: data is missing. Null otherwise.
   */
  readonly noPrices: { readonly why: string } | null;
  /**
   * D-280 probe C: this barcode's own regular prices in the other of USD/CAD, and the range they imply
   * here (median x the probe's p10 and p90 ratios). When the item has no prices of its own in the shopper's
   * currency this range IS the verdict (basis `cross_border`); otherwise it is only recorded beside the answer.
   * Null with no barcode, no such prices, or a currency other than USD and CAD.
   */
  readonly crossBorder?: {
    readonly fromCurrency: 'USD' | 'CAD';
    /** Shops (one latest regular price each) behind the median. */
    readonly n: number;
    readonly medianOtherCents: number;
    readonly lowCents: number;
    readonly highCents: number;
    readonly ratioSource: string;
  } | null;
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
  /**
   * The barcode was attached by matching the shop's product NAME, not read off the shop's page
   * (`join_method = 'name'`). Such a row may be another product with a similar name, so it is the
   * product's own price only when no barcode-joined row exists (bug sweep 2026-11-11, D-267).
   */
  readonly nameJoined: boolean;
  /** Seen while the shop listed it out of stock (`in_stock = 0`): still a real price (D-267 A4). */
  readonly outOfStock: boolean;
  /** Dated only by the day it was loaded (`seen_on_unknown = 1`, D-267 A9): `age` is at least UNKNOWN_AGE_DAYS. */
  readonly dateUnknown: boolean;
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

function readRows(db: DatabaseSync, currency: string, asOf: string, codes?: readonly string[]): Row[] {
  const have = new Set((db.prepare('PRAGMA table_info(observation)').all() as { name: string }[]).map((c) => c.name));
  const col = (name: string) => (have.has(name) ? name : `NULL AS ${name}`);
  const rows = db
    .prepare(
      `SELECT code, ${col('page_gtin')}, seller, seller_sku, seller_name, seller_brand, price_cents, ${col('base_price_cents')},
              kind, ${col('is_sale')}, region, ${col('store_name')}, ${col('store_city')}, ${col('store_osm')}, seen_on, url,
              ${col('parsed_size')}, ${col('parsed_brand')}, ${col('store_category')}, ${col('capture_tile_id')}, ${col('price_verified')},
              ${col('join_method')}, ${col('in_stock')}, ${col('seen_on_unknown')}
         FROM observation WHERE currency = ?${codes ? ` AND code IN (${codes.map(() => '?').join(',')})` : ''}`,
    )
    .all(currency, ...(codes ?? [])) as Record<string, unknown>[];
  const out: Row[] = [];
  for (const r of rows) {
    const price = posInt(r.price_cents);
    const seen = str(r.seen_on);
    const seller = str(r.seller);
    if (price === null || seen === null || seller === null) continue;
    if (isExcludedSeller(seller)) continue; // the kill switch (source-rights.ts): an objecting source's rows are not read
    if (reservedHost(str(r.url))) continue;
    let age: number;
    try {
      if (isFutureDated(seen, asOf)) continue;
      // D-267 A9: a row dated only by its load day is read as of unknown age, weighted like an old price.
      age = readAge(ageDays(seen, asOf), r.seen_on_unknown);
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
      nameJoined: r.join_method === 'name',
      outOfStock: r.in_stock === 0,
      dateUnknown: r.seen_on_unknown === 1,
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
  /** From the row's `source`; null when the source names none. */
  readonly department: string | null;
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

export function readCatalogue(db: DatabaseSync, codes: readonly string[]): Map<string, CatRow> {
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
                ${col('category_path')}, ${col('leaf_category')}, ${col('source')}, ${col('department')}
           FROM product WHERE code IN (${chunk.map(() => '?').join(',')})${have.has('source') ? ` AND ${licensedOnlySql()}` : ''}`,
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
        department: departmentOf(str(r.source), str(r.department)),
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
  /** Its catalogue row's department; null with no row or a source that names none. */
  readonly department: string | null;
  /** The provinces its shops' prices were seen in (gap 72: Project Hammer is one Toronto neighbourhood); empty when none is known. */
  readonly provinces: ReadonlySet<string>;
}

/**
 * One price per shop: a row with the source's own date before one dated only by its load day (D-267 A9),
 * then the latest; on the same day, a listing not marked out of stock before one that is (D-267 A4: the
 * price a shopper can buy there), then the lower.
 */
function latestPerShop<T extends { shop: string; seenOn: string; cents: number; outOfStock?: boolean; dateUnknown?: boolean }>(rows: readonly T[]): T[] {
  const by = new Map<string, T>();
  for (const o of rows) {
    const have = by.get(o.shop);
    if (have && !!have.dateUnknown !== !!o.dateUnknown) {
      if (have.dateUnknown) by.set(o.shop, o);
    } else if (!have || o.seenOn > have.seenOn) by.set(o.shop, o);
    else if (o.seenOn === have.seenOn) {
      const stock = Number(!!have.outOfStock) - Number(!!o.outOfStock);
      if (stock > 0 || (stock === 0 && o.cents < have.cents)) by.set(o.shop, o);
    }
  }
  return [...by.values()];
}

function medianOf(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[nearestRankIndex(s.length, 50)]!;
}

/**
 * The rows that are this barcode's own prices (no printout rows), with the D-267 name-join rule: where rows
 * joined by the barcode itself exist, a name-joined row counts only when it agrees with them (NAME_JOIN_AGREE).
 */
function ownRowsOf(rows: readonly Row[], selfKey: string): Row[] {
  const ownAny = rows.filter((r) => r.key === selfKey && !r.printout);
  const ownByBarcode = ownAny.filter((r) => !r.nameJoined);
  const barcodeMid = ownByBarcode.length > 0 ? medianOf(ownByBarcode.map((r) => Math.log(r.cents))) : null;
  return barcodeMid === null
    ? ownAny
    : ownAny.filter((r) => !r.nameJoined || Math.abs(Math.log(r.cents) - barcodeMid) <= Math.log(NAME_JOIN_AGREE));
}

/**
 * Cross-border range (D-280 probe C, Mac, 2026-11-25; a rung of the ladder since the 730-day scoring of the same day): for 808 barcodes priced in both USD and CAD, the
 * ratio CAD/USD of each barcode's median regular price had median 1.22, p10 0.83, p90 1.70 (train half, n=394).
 * Predicting one currency's price as the other's median x [0.83, 1.70] (CAD to USD: divided by [1.70, 0.83])
 * hit the true price 83-86% of the time at width 2.04, against the live path's 48% (US to CA) and 39% (CA to US)
 * at width 3.01. Scored again on 414 items with a 730-day window: 84.5% (USD to CAD) and 84.1% (CAD to USD) at width
 * 2.05, against the live verdict's 51.4% and 42.8% at 3.01. The ratio band was fitted on all-time medians, so the
 * window is 730 days. The verdict's shown range for this basis is exactly [lowCents, highCents].
 */
export const CROSS_BORDER_RATIO_LOW = 0.83;
export const CROSS_BORDER_RATIO_HIGH = 1.7;
export const CROSS_BORDER_SOURCE = 'probe-c-2026-11-25';
/** Only prices this old or newer (days) count: the ratio band was fitted on all-time medians, so two years. */
export const CROSS_BORDER_WINDOW_DAYS = 730;

/**
 * Reads the rows of ONE barcode in one currency: an indexed lookup on `observation(code, seen_on)`, a few rows,
 * never the currency's whole table. Rows carrying the barcode only as `page_gtin` (no `code`) are not read: that
 * column has no index.
 */
function readRowsForCode(db: DatabaseSync, currency: string, asOf: string, barcode: string): Row[] {
  return readRows(db, currency, asOf, spellings(barcode));
}

/** One price per shop (latest, regular, in window), in the other of USD/CAD: the item's own prices there. */
function crossBorderOf(
  item: { currency: string; barcode: string | null; asOf: string },
  prices: DatabaseSync | undefined | null,
): { trace: NonNullable<EstimateTrace['crossBorder']>; newest: Row } | null {
  const other = item.currency === 'CAD' ? 'USD' : item.currency === 'USD' ? 'CAD' : null;
  if (!other || !item.barcode || !prices) return null;
  const selfKey = codeKey(item.barcode);
  const own = ownRowsOf(readRowsForCode(prices, other, item.asOf, item.barcode), selfKey).filter((r) => !r.sale);
  const shops = latestPerShop(own).filter((s) => s.age <= CROSS_BORDER_WINDOW_DAYS);
  if (shops.length === 0) return null;
  const medianOtherCents = medianOf(shops.map((s) => s.cents));
  // The row that names the product here: the newest one with a name (a row with none names nothing).
  const newest = [...shops].sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : 0)).find((r) => r.name !== '') ?? shops[0]!;
  // Other = USD, item = CAD: CAD = USD x [0.83, 1.70]. Other = CAD, item = USD: USD = CAD / [1.70, 0.83]. Rounded to whole cents.
  const lo = other === 'USD' ? medianOtherCents * CROSS_BORDER_RATIO_LOW : medianOtherCents / CROSS_BORDER_RATIO_HIGH;
  const hi = other === 'USD' ? medianOtherCents * CROSS_BORDER_RATIO_HIGH : medianOtherCents / CROSS_BORDER_RATIO_LOW;
  return {
    newest,
    trace: {
      fromCurrency: other,
      n: shops.length,
      medianOtherCents,
      lowCents: Math.max(1, Math.round(lo)),
      highCents: Math.max(1, Math.round(hi)),
      ratioSource: CROSS_BORDER_SOURCE,
    },
  };
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
      department: c?.department ?? null,
      provinces: new Set(shops.map((s) => province(s.region)).filter((p): p is string => p !== null)),
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
  /** The kept log values, ascending, for the width flag. */
  readonly logs: readonly number[];
}

/**
 * D-233: a category pool too wide to mean anything (width-flag.ts, p90/p10
 * above 1.5x by bootstrap) never prices an item that has no price of its own.
 */
function tooWide(s: Stats): boolean {
  // Back from log price; 12 significant digits drops the round-trip noise, so a pool exactly at 1.5x is not read as 1.5000000000000002x.
  return flagWide(s.logs.map((l) => Number(Math.exp(l).toPrecision(12))));
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
    logs: s,
  };
}

/** The nearest-rank `p`th percentile by weight; with equal weights exactly `nearestRankIndex`. */
function weightedPercentile(points: readonly { log: number; w: number }[], p: number): number {
  const s = [...points].sort((a, b) => a.log - b.log);
  const total = s.reduce((a, q) => a + q.w, 0);
  let cum = 0;
  for (const q of s) {
    cum += q.w;
    if (cum * 100 >= p * total * (1 - 1e-12)) return q.log;
  }
  return s[s.length - 1]!.log;
}

function weightedMedian(points: readonly { log: number; w: number }[]): number {
  return weightedPercentile(points, 50);
}

/**
 * `statsOf` with each point weighted (D-267 A3): the wrong-row cut around the weighted median, then
 * weighted percentiles, so older prices neither move nor widen the bell the fresh ones draw.
 */
function weightedStatsOf(points: readonly { log: number; age: number; w: number }[]): Stats | null {
  if (points.length === 0) return null;
  const m0 = weightedMedian(points);
  const kept = points.filter((p) => Math.abs(p.log - m0) <= Math.log(WRONG_ROW_FACTOR));
  if (kept.length === 0) return null;
  return {
    n: kept.length,
    mu: weightedPercentile(kept, 50),
    sigma: (weightedPercentile(kept, 75) - weightedPercentile(kept, 25)) / 1.349,
    p10: weightedPercentile(kept, 10),
    p90: weightedPercentile(kept, 90),
    newestAge: Math.min(...kept.map((p) => p.age)),
    logs: kept.map((p) => p.log).sort((a, b) => a - b),
  };
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

/**
 * Sibling sizes (D-280 probe B, Mac, 2026-11-25, offline and provisional): over 2,914 same-product pairs of
 * different size the price moved with size to the power 0.69 (a log-log slope, not the 1.0 of a straight unit
 * price), and the p10 and p90 of the residuals were x0.66 and x1.51. Scored on the Kroger holdout that range hit
 * 83.6% at width 2.28, against the live path's 74.6% at 2.83 on the same items. Coverage is thin (4 to 7% of
 * items, median one sibling). The verdict's shown range for this basis is exactly [low, high] below.
 */
export const OTHER_SIZE_SLOPE = 0.69;
export const OTHER_SIZE_RATIO_LOW = 0.66;
export const OTHER_SIZE_RATIO_HIGH = 1.51;
/** Two sizes closer than this fraction are one size, not siblings. */
export const OTHER_SIZE_MIN_DIFF = 0.05;
export const OTHER_SIZE_SOURCE = 'probe-b-2026-11-25';

/** The product's first listed brand: a brand column may list several, comma separated. */
function firstBrand(brand: string | null): string | null {
  const first = (brand ?? '').split(',')[0]?.trim();
  return first ? first : null;
}

/** Brand and name stem with size words and pack counts out, so a 6-pack and a 12-pack of one product share it. */
function siblingKey(name: string | null, brand: string | null): string | null {
  return name ? productKey(stripPackCounts(name), firstBrand(brand)) : null;
}

/** Standard median: the mean of the two middle values when there is an even number. */
function middle(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

/**
 * Each sibling's price at the target's size, in cents: sibling price x (target size / sibling size)^0.69. Sizes
 * are whole-pack totals (pack-count.ts); a sibling that cannot be paired, or whose size is within 5%, gives none.
 */
function siblingPrices(
  products: readonly Product[],
  target: { name: string | null; brand: string | null; sizeText: string | null; size: ComparisonQuantity | null },
): { prices: number[]; members: Product[] } {
  const out = { prices: [] as number[], members: [] as Product[] };
  const key = siblingKey(target.name, target.brand);
  const brand = brandKey(firstBrand(target.brand));
  if (!key) return out;
  const mine = packSide(target.name, target.sizeText, target.size);
  if (!mine.total) return out;
  for (const p of products) {
    if (!p.barcoded || brandKey(firstBrand(p.brand)) !== brand) continue;
    if (siblingKey(p.name, p.brand) !== key) continue;
    const theirs = packSide(p.name, p.sizeText, p.size);
    if (!pairable(mine, theirs)) continue;
    const ratio = mine.total.baseValue / theirs.total!.baseValue;
    if (Math.max(ratio, 1 / ratio) < 1 + OTHER_SIZE_MIN_DIFF) continue;
    out.prices.push(p.cents * ratio ** OTHER_SIZE_SLOPE);
    out.members.push(p);
  }
  return out;
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

/** The typical price as the phone shows it (app/public/js/lib/verdict-chart.js roundEstimateCents). */
function shownCents(cents: number): number {
  if (cents < 1000) return Math.round(cents / 5) * 5;
  if (cents < 10000) return Math.round(cents / 10) * 10;
  return Math.round(cents / 100) * 100;
}

/**
 * D-270 A2/B3 (bug sweep 2026-11-11, family 5). The word agrees with the band the phone shades
 * ("8 in 10 prices", p10 to p90): a price inside it is never good, great or bad. A default line that
 * would cut into the band is moved to just past its end; a line the shopper set himself is his and is
 * kept as typed (as in `categoryOnlyLines`). The cut is made against both the exact centre and the
 * rounded centre the phone draws (`zoneCuts` on `asShown`), so the server's word and the phone's agree.
 * Great keeps its gap past good.
 */
export function bandLines(base: Thresholds, given: LinesGiven, centreCents: number, p10Cents: number, p90Cents: number): Thresholds {
  const up1 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10;
  const shown = shownCents(centreCents) > 0 ? shownCents(centreCents) : centreCents;
  const lo = Math.min(centreCents, shown);
  const hi = Math.max(centreCents, shown);
  const underPct = up1(Math.min(99, Math.max(0, (1 - (p10Cents - 0.5) / hi) * 100)));
  const overPct = up1(Math.min(1000, Math.max(0, ((p90Cents + 0.5) / lo - 1) * 100)));
  const goodPct = given.goodPct ? base.goodPct : Math.max(base.goodPct, underPct);
  const badPct = given.badPct ? base.badPct : Math.max(base.badPct, overPct);
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

/**
 * D-270 A7: what one price in Claude's range buys. A rate ("per kg", "$/lb", "per 100 g") is a price per
 * that quantity; a pack ("one 500 mL bottle", "6 x 355 mL cans") is a price for that size; "each" and
 * anything unread is neither, and the range is read as the item's own price, as before.
 */
export function claudeUnit(unit: string | null | undefined): { rate: ComparisonQuantity } | { pack: ComparisonQuantity } | null {
  if (!unit) return null;
  const t = unit.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const rate = /(?:\bper\b|\/)\s*(\d+(?:\.\d+)?)?\s*(fl\.?\s*oz|[a-z]+)\b/.exec(t);
  if (rate) {
    const q = toComparison(rate[1] ? Number(rate[1]) : 1, rate[2]);
    if (q && q.family !== 'count') return { rate: q };
  }
  const p = parseQuantity(t);
  if (p) {
    const q = toComparison(p.value, p.unit);
    if (q && q.family !== 'count') return { pack: q };
  }
  return null;
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
/*
 * READ CACHE. Every estimate reads every observation row and the catalogue rows behind them, to build
 * its category pools. With Project Hammer loaded (2026-11-08, about 99,000 rows) that took about 2.5 s
 * per scan, measured on the PC copy, and 1.5 to 3.5 s on the live server: 2.4 s reading prices and
 * 3.0 s reading the catalogue in a profile of three calls. Both reads depend only on the two files,
 * the currency and the day, so they are kept for the next request and read again only when either
 * file (or its write-ahead log) changes size or time, or the day changes. A handle with no file
 * behind it (`:memory:`, every test fixture) is never cached.
 */
// Up to SNAPSHOT_SLOTS versions (currency x day), least recently used dropped first. One slot thrashed
// when US and Canadian answers alternated, so each answer re-read every row (Mac probe A, 2026-11-25:
// 2.26 s per answer, peak 2.1 GB).
const SNAPSHOT_SLOTS = 4;
const snapshots = new Map<string, { rows: Row[]; cat: Map<string, CatRow> }>();
let snapshotStats = { hits: 0, misses: 0 };

/** Read-cache hits and misses since start (or the last clear), for probes and the health check. */
export function estimateCacheStats(): { hits: number; misses: number; slots: number } {
  return { ...snapshotStats, slots: snapshots.size };
}

/** The cache key for these files, currency and day, or null when they cannot be cached. */
function snapshotKey(deps: EstimateDeps, currency: string, asOf: string): string | null {
  const p = fileStamp(deps.prices);
  const c = fileStamp(deps.catalogue);
  if (p === null || c === null || (p === 'none' && c === 'none')) return null;
  return `${p}#${c}#${currency}#${asOf}`;
}

/** Drops the read cache (tests, and a caller that knows the files changed in place). */
export function clearEstimateCache(): void {
  snapshots.clear();
  snapshotStats = { hits: 0, misses: 0 };
}

export async function estimate(item: EstimateItem, shopper: ShopperInput | null, deps: EstimateDeps): Promise<EstimateResult> {
  const currency = (item.currency ?? 'CAD').trim().toUpperCase() || 'CAD';
  const tried: RungTried[] = [];
  const notes = new Set<Note>();
  let claudeTrace: EstimateTrace['claude'] = null;
  await loadSizeFill();

  /* ---- data (read once per file version: see READ CACHE above `snapshotKey`) */
  const barcode = item.barcode?.trim() ? item.barcode.trim() : null;
  const selfKey = barcode ? codeKey(barcode) : null;
  const key = snapshotKey(deps, currency, item.asOf);
  let rows: Row[] = [];
  let cat = new Map<string, CatRow>();
  const cached = key !== null ? snapshots.get(key) : undefined;
  if (cached) {
    snapshotStats.hits++;
    snapshots.delete(key!);
    snapshots.set(key!, cached);
    rows = cached.rows;
    cat = cached.cat;
  } else {
    if (key !== null) snapshotStats.misses++;
    if (deps.prices) {
      try {
        rows = readRows(deps.prices, currency, item.asOf);
      } catch {
        rows = [];
      }
    }
    if (deps.catalogue) {
      try {
        cat = readCatalogue(deps.catalogue, [...new Set(rows.map((r) => r.key).filter((k): k is string => k !== null))]);
      } catch {
        cat = new Map();
      }
    }
    if (key !== null) {
      snapshots.set(key, { rows, cat });
      while (snapshots.size > SNAPSHOT_SLOTS) snapshots.delete(snapshots.keys().next().value!);
    }
  }
  // The scanned item's own catalogue row, when no price row brought it in. Added to the snapshot's map:
  // it is the same catalogue version, so it is as true for the next request as for this one.
  if (deps.catalogue && selfKey && !cat.has(selfKey)) {
    try {
      for (const [k, v] of readCatalogue(deps.catalogue, [barcode!])) cat.set(k, v);
    } catch {
      /* no row for it: the ladder goes on without its catalogue identity, as before */
    }
  }
  const selfCat = selfKey ? cat.get(selfKey) ?? null : null;
  // D-267: a row joined to this barcode by name only may be another product with a similar name. Where
  // rows joined by the barcode itself exist, a name-joined row counts (as a price and a dot) only when
  // it agrees with them, within NAME_JOIN_AGREE of their median; alone, name-joined rows still answer
  // but never make the answer "Certain". Live 2026-11-11: dropping every name-joined row moved Kraft
  // peanut butter from $7.55 to $9.78, because most shops' rows for it are name-joined and right.
  // Shoppers' prices: one voice, one shop's weight, only while shops have fewer than two prices for it (decisions 2026-11-15).
  if (selfKey && deps.shopperVoice) {
    try {
      const shopsHere = new Set(rows.filter((r) => r.key === selfKey && !r.printout).map((r) => r.shop));
      const v0 = shopsHere.size < SHOPPER_VOICE_BELOW_SHOPS ? deps.shopperVoice(selfKey) : null;
      // Security finding F2: where a shop price under 90 days old exists, the typed voice never pulls the
      // answer below x0.8 of the lowest such price. Older shop prices get no floor (they weigh less than a
      // typed price today, and the floor only guards a fresh price).
      const fresh = rows.filter((r) => r.key === selfKey && !r.printout && r.age < SHOPPER_VOICE_FLOOR_FRESH_DAYS).map((r) => r.cents);
      const floor = fresh.length > 0 ? Math.ceil(Math.min(...fresh) * SHOPPER_VOICE_FLOOR_RATIO) : 0;
      const v = v0 && Number.isInteger(v0.cents) ? { ...v0, cents: Math.max(v0.cents, floor) } : v0;
      if (v && Number.isInteger(v.cents) && v.cents > 0 && !isFutureDated(v.seenOn, item.asOf)) {
        rows = [
          ...rows,
          {
            key: selfKey,
            seller: 'shopper',
            sku: '',
            shop: 'shopper|',
            cents: v.cents,
            sale: false,
            seenOn: v.seenOn,
            age: ageDays(v.seenOn, item.asOf),
            region: v.region,
            store: 'Shopper price',
            city: null,
            name: str(item.name) ?? '',
            brand: null,
            sizeText: null,
            size: null,
            storeCategory: null,
            printout: false,
            nameJoined: false,
            outOfStock: false,
            dateUnknown: false,
          },
        ];
      }
    } catch {
      /* a broken shopper store is no voice: the answer goes on from the shops' prices */
    }
  }
  let ownAll = selfKey ? ownRowsOf(rows, selfKey) : [];
  const ownNewest = [...ownAll].sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : 0))[0] ?? null;

  /*
   * The barcode's prices in the other of USD/CAD (D-280 probe C), read at most once and only when asked: the
   * cross_border rung below, the trace, and the name of a barcode no catalogue row and no price here names.
   */
  let crossBorder: EstimateTrace['crossBorder'] = null;
  let crossBorderNewest = null as Row | null;
  let crossBorderRead = false;
  const readCrossBorder = (): EstimateTrace['crossBorder'] => {
    if (!crossBorderRead) {
      crossBorderRead = true;
      try {
        const found = crossBorderOf({ currency, barcode, asOf: item.asOf }, deps.prices);
        crossBorder = found ? found.trace : null;
        crossBorderNewest = found ? found.newest : null;
      } catch (err) {
        console.error(`[cross-border-fault] threw ${barcode ?? ''} - ${err instanceof Error ? err.message : String(err)}`);
        crossBorder = null;
        crossBorderNewest = null;
      }
    }
    return crossBorder;
  };

  /* ---- identity: the catalogue first, else the store's own product name (design case 2) */
  // A barcode named nowhere here (no item name, no catalogue row, no price row in this currency) is named by the
  // other currency's rows when it has any: the product is the same one, and it then reaches the cross_border rung.
  const nameKnownHere = str(item.name) ?? selfCat?.name ?? ownNewest?.name ?? null;
  if (!nameKnownHere && barcode) readCrossBorder();
  const named: Row | null = nameKnownHere ? null : crossBorderNewest;
  const name = nameKnownHere ?? str(named?.name) ?? null;
  const brand = str(item.brand) ?? selfCat?.brand ?? ownNewest?.brand ?? named?.brand ?? null;
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
  const perLb = item.weighed === true && item.weighedUnit === 'lb';
  if (item.weighed) {
    target = toComparison(1, perLb ? 'lb' : 'kg');
    sizeText = perLb ? '1 lb' : '1 kg';
  }

  /*
   * ---- which pack the shops' prices are for (price/src/pack-size.ts; review 2026-11-21, Coca-Cola 710 ml
   * answered with the 6-pack's $7.99). Rows of another pack are another product's prices and leave the own
   * prices and the dots. Design case 9: when the shops sell the barcode as another size than the catalogue's
   * (or the one given), that size prices it, noted and logged.
   */
  let conflict: EstimateTrace['conflict'] = null;
  let unitHeld = false;
  if (!item.weighed) {
    const given = sizeFromText(str(item.size));
    const own = given ?? (selfCat?.size ? { q: selfCat.size, text: selfCat.sizeText ?? sizeLabel(selfCat.size) } : null);
    const packs = readPacks(ownAll, own?.q ?? null);
    ownAll = packs.keep;
    // Boss check 2026-11-21: the shops sell the barcode as a bigger pack, but the shelf price the shopper typed
    // sits nearer one unit's price than the pack's (below pack median / sqrt(count), pack-size.ts's own cut):
    // the shopper holds the catalogue's size. Those rows are the pack's prices, not this item's, so none of them
    // stands as its own price; the catalogue's size is priced like for like by the rungs below, not sure.
    const ratio = own && packs.conflict && packs.size && packs.size.family === own.q.family ? packs.size.baseValue / own.q.baseValue : 0;
    const packCents = ownAll.filter((r) => !r.sale && r.size).map((r) => r.cents);
    if (ratio > 1 && packCents.length > 0 && shopper && Number.isInteger(shopper.cents) && shopper.cents > 0 && shopper.cents < medianOf(packCents) / Math.sqrt(ratio)) {
      unitHeld = true;
      ownAll = [];
      notes.add('identity_conflict');
      target = own!.q;
      sizeText = own!.text;
    } else if (own && packs.conflict && packs.size) {
      const storeSize = packs.sizeText ?? sizeLabel(packs.size);
      conflict = { barcode: barcode!, catalogueSize: own.text, storeSize };
      notes.add('identity_conflict');
      target = packs.size;
      sizeText = storeSize;
    } else if (own) {
      target = own.q;
      sizeText = own.text;
    } else if (packs.size) {
      target = packs.size;
      sizeText = packs.sizeText ?? sizeLabel(packs.size);
    } else {
      // The name's tail, else the size the other currency's row carries for this barcode.
      const fromName = sizeFromName(name) ?? (named?.size ? { q: named.size, text: named.sizeText ?? sizeLabel(named.size) } : null);
      target = fromName?.q ?? null;
      sizeText = fromName?.text ?? null;
    }
  }
  const ownByNameOnly = ownAll.length > 0 && ownAll.every((r) => r.nameJoined);

  /* ---- products and category pools */
  const products = buildProducts(rows, cat, deps.categoryOfUnbarcoded).filter((p) => p.key !== selfKey);
  // The parent rung is the taxonomy parent of the leaf (B2); with no taxonomy, the tag before the leaf and the rung says parent_unchecked.
  const { parent, unchecked: parentUnchecked } = parentOf(leaf, path, deps.taxonomy ?? null);
  const parentFlag = parentUnchecked ? { flag: 'parent_unchecked' as const } : {};

  /* ---- 3.3: the item's department bounds every pool */
  const itemDept = selfCat?.department ?? departmentFromPath(products, path);
  const scoped = itemDept ? products.filter((p) => p.department === null || p.department === itemDept) : products;
  // Unknown department: a pool spanning two known departments is refused (null), never pooled.
  const oneDepartment = (members: Product[]): Product[] | null =>
    itemDept || new Set(members.map((p) => p.department).filter((d) => d !== null)).size <= 1 ? members : null;
  const inLeaf = (tag: string) => oneDepartment(scoped.filter((p) => p.leaf === tag));
  const inTree = (tag: string) => oneDepartment(scoped.filter((p) => p.path.includes(tag)));
  const categoryStats = (members: readonly Product[] | null): Stats | null => {
    if (!members) return null;
    const s = statsOf(poolPoints(members, target, target !== null && item.weighed !== true));
    return s && s.n >= MIN_CATEGORY_PRODUCTS ? s : null;
  };
  const leafMembers = leaf ? inLeaf(leaf) : null;
  const parentMembers = parent ? inTree(parent) : null;
  const mixed = { leaf_category: leaf !== null && leafMembers === null, parent_category: parent !== null && parentMembers === null };
  const leafStats = categoryStats(leafMembers);
  const parentStats = categoryStats(parentMembers);
  const catStats = leafStats ?? parentStats;

  /* ---- own prices */
  const ownRegular = ownAll.filter((r) => !r.sale);
  // A loose-produce item (weighed, joined to its PLU key) has per-lb rows already in the asked unit, not name-joined
  // guesses: a category pool of packaged goods scaled to a pound is not the check on them (live 2026-11-15, 4011).
  const wrongCut = catStats && item.weighed !== true ? Math.log(WRONG_ROW_FACTOR) : Infinity;
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
  // D-267 A3: one price per shop (the newest leads), every shop kept and weighted by age, none dropped.
  const ownShops = latestPerShop(regional);
  const freshShops = ownShops.filter((s) => s.age <= WINDOW_DAYS).length;
  const ownWeighted = ownShops.map((s) => ({ log: Math.log(s.cents), age: s.age, w: ageWeight(s.age) }));

  let basis: Basis | null = null;
  let mu = 0;
  let n = 0;
  let evidenceAge: number | null = null;
  let claudeSigma: number | null = null;
  let priorStats: Stats | null = null;
  let scaled = false;
  /** The products the centre stood on, when it stood on a pool (gap 72: are any priced in the shopper's province?). */
  let basisMembers: readonly Product[] | null = null;

  if (ownShops.length > 0) {
    const muOwn = weightedMedian(ownWeighted);
    n = ownShops.length;
    // D-270 A4/A5/B1: from OWN_SPREAD_SHOPS shops up the centre is theirs alone (the range card's median);
    // under that it is blended with the category, never with a pool too wide to mean anything (D-233).
    const blendWith = n < OWN_SPREAD_SHOPS && catStats && !tooWide(catStats) && item.weighed !== true ? catStats : null;
    mu = blendWith ? (n * muOwn + BLEND_K * blendWith.mu) / (n + BLEND_K) : muOwn;
    basis = 'own_prices';
    evidenceAge = Math.min(...ownShops.map((s) => s.age));
    if (fromOtherRegion) notes.add('other_region');
    tried.push({ rung: 'own_prices', outcome: 'used', n });
  } else {
    tried.push({ rung: 'own_prices', outcome: selfKey ? 'too_few' : 'not_applicable', n: 0 });
  }

  /*
   * ---- cross-border (D-280 probe C): the same barcode's prices in the other of USD/CAD, times the fitted ratio
   * band. Only when the item has no prices of its own here, and before every rung below. Its range is exact.
   */
  let crossBorderRange: { low: number; high: number } | null = null;
  if (basis === null) {
    const cb = readCrossBorder();
    if (cb) {
      basis = 'cross_border';
      crossBorderRange = { low: cb.lowCents, high: cb.highCents };
      // The geometric mean of the two ends: the verdict's p10 and p90 then land exactly on them (sigma below).
      mu = (Math.log(cb.lowCents) + Math.log(cb.highCents)) / 2;
      n = cb.n;
      tried.push({ rung: 'cross_border', outcome: 'used', n, detail: `${cb.fromCurrency} ${cb.medianOtherCents}` });
    } else {
      const applicable = !!barcode && (currency === 'USD' || currency === 'CAD') && !!deps.prices;
      tried.push({ rung: 'cross_border', outcome: applicable ? 'too_few' : 'not_applicable', n: 0 });
    }
  }

  /* ---- same product, other sizes; the bigger pack is a side note only (design call 2) */
  const pKey = productKey(name, brand);
  const sameProduct = pKey && target ? scoped.filter((p) => p.barcoded && p.size?.family === target!.family && productKey(p.name, p.brand) === pKey) : [];
  // D-270 A11: a price from another province than the shopper's (when known and the product has none from it).
  const elsewhere = (p: Product): boolean => wantRegion !== null && p.provinces.size > 0 && !p.provinces.has(wantRegion);
  let biggerPack: Verdict['biggerPack'] = null;
  let biggerPackPerUnit: number | null = null;
  if (target) {
    let best: { perUnit: number; p: Product } | null = null;
    for (const p of sameProduct) {
      if (p.size!.baseValue / target.baseValue <= BAND_HIGH) continue;
      // D-270 A11: offered as the cheaper way to buy today, so a current price (the range card's window) from the shopper's province.
      if (p.newestAge > WINDOW_DAYS || elsewhere(p)) continue;
      const perUnit = (p.cents * target.perQuantity) / p.size!.baseValue;
      if (!best || perUnit < best.perUnit) best = { perUnit, p };
    }
    if (best) {
      biggerPack = { quantity: best.p.sizeText ?? sizeLabel(best.p.size!), perUnitCents: Math.round(best.perUnit), store: best.p.store };
      biggerPackPerUnit = best.perUnit;
    }
  }
  // Sibling sizes (probe B): the median of the siblings' prices at this size, shown as exactly [0.66, 1.51] x it.
  let otherSizeRange: { low: number; high: number } | null = null;
  if (basis === null) {
    const sib = target ? siblingPrices(scoped, { name, brand, sizeText, size: target }) : { prices: [], members: [] };
    if (sib.prices.length > 0) {
      const m = middle(sib.prices);
      const low = Math.max(1, Math.round(m * OTHER_SIZE_RATIO_LOW));
      const high = Math.max(low, Math.round(m * OTHER_SIZE_RATIO_HIGH));
      basis = 'other_size';
      basisMembers = sib.members;
      otherSizeRange = { low, high };
      // The geometric mean of the two ends: the verdict's p10 and p90 then land exactly on them (sigma below).
      mu = (Math.log(low) + Math.log(high)) / 2;
      n = sib.prices.length;
      evidenceAge = Math.min(...sib.members.map((p) => p.newestAge));
      scaled = true;
      tried.push({ rung: 'other_size', outcome: 'used', n, detail: `median ${Math.round(m)}` });
    } else {
      tried.push({ rung: 'other_size', outcome: pKey && target ? 'too_few' : 'not_applicable', n: 0 });
    }
  }

  /*
   * ---- leaf, then parent (a missing size: per item, any size, noted and wider; design case 4)
   *
   * D-233: a pool the width flag calls too wide is set aside: it sets neither
   * the centre, the spread nor the zone, and the ladder moves on (to Claude, as
   * for "no Pexi price"). Its prices travel in the trace as context.
   */
  const aside: { pool: EstimateTrace['widePool']; stats: Set<Stats> } = { pool: null, stats: new Set() };
  const asideFor = (rung: NonNullable<EstimateTrace['widePool']>['rung'], tag: string, s: Stats): void => {
    aside.stats.add(s);
    aside.pool ??= { rung, tag, n: s.n, cents: s.logs.map((l) => Math.max(1, Math.round(Math.exp(l)))) };
  };
  for (const [rung, tag, stats] of [
    ['leaf_category', leaf, leafStats],
    ['parent_category', parent, parentStats],
  ] as const) {
    if (basis !== null) break;
    if (!tag) {
      tried.push({ rung, outcome: 'not_applicable', n: 0 });
      continue;
    }
    if (stats && tooWide(stats)) {
      asideFor(rung, tag, stats);
      tried.push({ rung, outcome: 'too_wide', n: stats.n, detail: tag, ...(rung === 'parent_category' ? parentFlag : {}) });
    } else if (stats) {
      basis = rung;
      basisMembers = rung === 'leaf_category' ? leafMembers : parentMembers;
      mu = stats.mu;
      n = stats.n;
      evidenceAge = stats.newestAge;
      scaled = target !== null;
      if (!target) notes.add('size_assumed');
      tried.push({ rung, outcome: 'used', n, detail: tag, ...(rung === 'parent_category' ? parentFlag : {}) });
    } else {
      tried.push({ rung, outcome: mixed[rung] ? 'mixed_departments' : 'too_few', n: 0, detail: tag, ...(rung === 'parent_category' ? parentFlag : {}) });
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
          const pts = (inLeaf(tag) ?? [])
            .filter((p) => p.size?.family === family)
            .map((p) => ({ log: Math.log(p.cents / p.size!.baseValue), age: p.newestAge }));
          const s = statsOf(pts);
          leafUnit.set(k, s && s.n >= MIN_CATEGORY_PRODUCTS ? s.mu : null);
        }
        return leafUnit.get(k)!;
      };
      const ratios: number[] = [];
      for (const p of scoped) {
        if (!p.size || !p.leaf || brandKey(p.brand) !== bk) continue;
        const m = unitMedian(p.leaf, p.size.family);
        if (m !== null) ratios.push(Math.log(p.cents / p.size.baseValue) - m);
      }
      let wide = false;
      if (ratios.length >= 3) {
        const ratio = medianOf(ratios);
        for (let i = path.length - 1; i >= 0; i -= 1) {
          const s = statsOf(poolPoints(inTree(path[i]!) ?? [], target, false));
          // D-233: a category centre from a pool too wide to mean anything is set aside here as well.
          if (s && s.n >= MIN_CATEGORY_PRODUCTS && tooWide(s)) {
            wide = true;
            asideFor('brand_markup', path[i]!, s);
            continue;
          }
          if (s && s.n >= MIN_CATEGORY_PRODUCTS) {
            basis = 'brand_markup';
            basisMembers = inTree(path[i]!);
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
      if (!used) tried.push({ rung: 'brand_markup', outcome: wide ? 'too_wide' : 'too_few', n: ratios.length });
    } else {
      tried.push({ rung: 'brand_markup', outcome: 'not_applicable', n: 0 });
    }
  }

  /*
   * ---- Statistics Canada's average for this staple in the shopper's province, shelf-adjusted and scaled
   * to this size (price/src/statcan.ts). Public data, so it comes before the paid Claude ask.
   */
  let national: NationalAverageAnswer | null = null;
  let nationalSigma: number | null = null;
  if (basis === null) {
    if (!deps.nationalAverage) {
      tried.push({ rung: 'national_average', outcome: 'not_applicable', n: 0, detail: 'no_table' });
    } else {
      let got: NationalAverageAnswer | { readonly miss: string };
      try {
        got = deps.nationalAverage({ name, target, sizeText, path, region: item.region ?? null, asOf: item.asOf });
      } catch (err) {
        console.error(`[statcan-fault] threw ${name ?? ''} - ${err instanceof Error ? err.message : String(err)}`);
        got = { miss: 'threw' };
      }
      if ('miss' in got) {
        tried.push({ rung: 'national_average', outcome: got.miss === 'threw' ? 'failed' : 'not_applicable', n: 0, detail: got.miss });
      } else if (!(got.centreCents > 0) || !(got.sigmaLog > 0)) {
        tried.push({ rung: 'national_average', outcome: 'failed', n: 0, detail: 'unusable' });
      } else {
        national = got;
        basis = 'national_average';
        mu = Math.log(got.centreCents);
        nationalSigma = got.sigmaLog;
        n = 0;
        scaled = target !== null && !got.sizeAssumed;
        // The client says "size assumed"; the spread for it was measured (statcan.ts), so no second widening below.
        if (got.sizeAssumed) notes.add('size_assumed');
        tried.push({ rung: 'national_average', outcome: 'used', n: 0, detail: `${got.product} | ${got.place} | ${got.month}` });
      }
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
          }, { sorted, poolSetAside: aside.pool !== null }),
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
        // D-270 A7: Claude's unit is carried. A rate is scaled to this size, and with no size it is not a shelf
        // price, so the next rung answers; a pack is scaled to this size, and with no size the size is assumed.
        const u = claudeUnit(got.unit);
        let factor = 1;
        let unusable: string | null = null;
        let assumed = false;
        if (u && 'rate' in u) {
          if (target && target.family === u.rate.family) factor = target.baseValue / u.rate.baseValue;
          else unusable = 'unit_is_rate';
        } else if (u && 'pack' in u) {
          if (target && target.family === u.pack.family) factor = sameSize(target, u.pack) ? 1 : target.baseValue / u.pack.baseValue;
          else if (!target) assumed = true;
        }
        if (unusable) {
          claudeTrace = { ok: false, reason: unusable };
          tried.push({ rung: 'claude_typical', outcome: 'failed', n: 0, detail: unusable });
        } else {
          claudeTrace = got;
          const lo = Math.log(got.lowCents * factor);
          const hi = Math.log(got.highCents * factor);
          basis = 'claude_typical';
          mu = (lo + hi) / 2;
          claudeSigma = (hi - lo) / (2 * Z10);
          // Claude unsure of its own range: the bell says so (the confidence is already "Not fully confident").
          if (got.confidence === 'low') claudeSigma *= WIDEN;
          n = 0;
          scaled = factor !== 1;
          notes.add('claude_estimate');
          if (assumed) notes.add('size_assumed');
          tried.push({ rung: 'claude_typical', outcome: 'used', n: 0 });
        }
      }
    }
  }

  /*
   * ---- the priors: always drawable. D-270 A6: a sized item's prior is its pool scaled to its size (same
   * unit family, any pack size), never the median of whatever sizes the pool holds; with no size, or too few
   * products to scale, it is per item at any size and says the size was assumed (and is wider for it).
   */
  const widest = path[0] ?? null;
  const widestMembers = widest ? inTree(widest) : null;
  const departmentMembers = itemDept ? scoped.filter((p) => p.department === itemDept) : null;
  const priorOf = (members: readonly Product[] | null): { stats: Stats | null; scaled: boolean } => {
    if (!members) return { stats: null, scaled: false };
    if (target) {
      const s = statsOf(poolPoints(members, target, false));
      if (s && s.n >= MIN_PRIOR_PRODUCTS) return { stats: s, scaled: true };
    }
    return { stats: statsOf(poolPoints(members, null, false)), scaled: false };
  };
  const categoryPriorOf = priorOf(widestMembers);
  const categoryPrior = categoryPriorOf.stats;
  // Only products the catalogue places in the department: one with no known department is never in it.
  const departmentPriorOf = priorOf(departmentMembers);
  const departmentPrior = departmentPriorOf.stats;
  if (basis === null) {
    if (categoryPrior && categoryPrior.n >= MIN_PRIOR_PRODUCTS) {
      basis = 'category_prior';
      mu = categoryPrior.mu;
      n = categoryPrior.n;
      priorStats = categoryPrior;
      basisMembers = widestMembers;
      scaled = categoryPriorOf.scaled;
      if (!categoryPriorOf.scaled) notes.add('size_assumed');
      tried.push({ rung: 'category_prior', outcome: 'used', n, detail: widest! });
    } else {
      const outcome = !widest ? 'not_applicable' : widestMembers === null ? 'mixed_departments' : 'too_few';
      tried.push({ rung: 'category_prior', outcome, n: categoryPrior?.n ?? 0 });
      basis = 'department_prior';
      if (departmentPrior) {
        mu = departmentPrior.mu;
        n = departmentPrior.n;
        priorStats = departmentPrior;
        basisMembers = departmentMembers;
        scaled = departmentPriorOf.scaled;
        if (!departmentPriorOf.scaled) notes.add('size_assumed');
      } else {
        mu = Math.log(EMPTY_PRIOR.centreCents);
        n = 0;
      }
      tried.push({ rung: 'department_prior', outcome: departmentPrior ? 'used' : 'too_few', n, ...(itemDept ? { detail: itemDept } : {}) });
    }
  }

  /*
   * ---- D-270 A9: an item seen only on sale. Its regular price is never below what shops sold it for on
   * sale, so a centre from its category, Claude or a prior is raised to its dearest sale price; and with no
   * regular price of its own the answer is not sure (the confidence below).
   */
  // The cross-border range is shown exactly as scored, so a sale-only item's centre is not raised there (its confidence is low anyway).
  const saleOnly = basis !== 'own_prices' && ownAll.length > 0 && ownAll.every((r) => r.sale);
  if (saleOnly && basis !== 'cross_border' && basis !== 'other_size') {
    const dearestSale = Math.max(...latestPerShop(ownAll).map((r) => r.cents));
    if (Math.log(dearestSale) > mu) mu = Math.log(dearestSale);
  }

  /*
   * ---- D-270 A10, gap 72: a centre that stood only on prices from another province than the shopper's.
   * Most store prices are one Toronto neighbourhood's (Project Hammer, region ON). A pool none of whose
   * products was priced in the shopper's province (when it is known, and some province is known for the
   * pool) is noted `other_region`: wider, and one step less sure below. Still an answer.
   */
  if (basisMembers && basisMembers.length > 0 && basisMembers.every(elsewhere)) notes.add('other_region');

  /*
   * ---- D-233: too thin. A pool was set aside as too wide and Claude did not
   * answer, so what is left is a prior: the bell stays drawable, but it carries
   * no zone and says so. The reason is the Claude rung's own.
   */
  let tooThin: EstimateTrace['tooThin'] = null;
  let noPrices: EstimateTrace['noPrices'] = null;
  const claudeWhy = tried.find((t) => t.rung === 'claude_typical')?.detail ?? 'no_ask';
  if (aside.pool && (basis === 'category_prior' || basis === 'department_prior')) {
    tooThin = { why: claudeWhy };
    notes.add('too_thin');
  } else if (basis === 'department_prior' && n === 0) {
    // 3.3: the empty prior is a fixed number, not a pool; like a set-aside pool it is drawn and never placed.
    noPrices = { why: claudeWhy };
    notes.add('too_thin');
  }

  /* ---- spread: first that applies, then the floors and the widenings. A pool set aside as too wide gives none. */
  const leafSpread = leafStats && !aside.stats.has(leafStats) ? leafStats : null;
  const parentSpread = parentStats && !aside.stats.has(parentStats) ? parentStats : null;
  const catSpread = aside.stats.size > 0 ? leafSpread ?? parentSpread : catStats;
  let sigma: number;
  let spreadFrom: SpreadFrom;
  // The scored ranges (cross_border, other_size) are shown exactly: the bell is the range.
  const exactRange = crossBorderRange ?? otherSizeRange;
  const crossSpread = exactRange !== null;
  const ownSpread = basis === 'own_prices' && ownShops.length >= OWN_SPREAD_SHOPS ? weightedStatsOf(ownWeighted) : null;
  const fewShops = basis === 'own_prices' && !ownSpread;
  if (exactRange) {
    // The bell is the range: p10 and p90 are exactly its two ends (the floors and widenings below are skipped).
    sigma = Math.max(Math.log(exactRange.high / exactRange.low) / (2 * Z10), 0.001);
    spreadFrom = crossBorderRange ? 'cross_border' : 'other_size';
  } else if (ownSpread) {
    sigma = ownSpread.sigma;
    spreadFrom = 'own_prices';
  } else if (fewShops) {
    // One or two shops: the product's own price is the centre, and its spread is how one product's price
    // varies between shops, never its category's spread between different products.
    sigma = SHOP_SPREAD_SIGMA;
    spreadFrom = 'shop_spread';
  } else if (leafSpread) {
    sigma = leafSpread.sigma;
    spreadFrom = 'leaf_category';
  } else if (parentSpread) {
    sigma = parentSpread.sigma;
    spreadFrom = 'parent_category';
  } else if (nationalSigma !== null) {
    sigma = nationalSigma;
    spreadFrom = 'national_average';
  } else if (claudeSigma !== null) {
    sigma = claudeSigma;
    spreadFrom = 'claude';
  } else {
    const prior = priorStats ?? categoryPrior ?? departmentPrior;
    sigma = prior && prior.n >= 3 && prior.sigma > 0 ? prior.sigma : EMPTY_PRIOR.sigmaLog;
    spreadFrom = 'prior';
  }
  // Never below the category's spread (equal provincial prices cannot collapse the bell), never below 0.05.
  // D-270 A4: a spread from 3+ shops' own prices is theirs alone, floored only at 0.05.
  if (!crossSpread) sigma = Math.max(sigma, ownSpread || fewShops ? 0 : catSpread?.sigma ?? 0, MIN_SIGMA);
  if (evidenceAge !== null && evidenceAge > OLD_DAYS) notes.add('old_prices');
  if (!crossSpread) {
    if (notes.has('old_prices')) sigma *= WIDEN;
    if (notes.has('other_region')) sigma *= WIDEN;
    // Statistics Canada's size-assumed spread is measured, not this rule of thumb, so it is not widened twice.
    if (notes.has('size_assumed') && spreadFrom !== 'national_average') sigma *= WIDEN;
    // RULINGS "A price range is never wider than one product's prices across shops": the doubt beyond this
    // is said by the confidence, not by a range too wide to tell the shopper anything.
    sigma = Math.min(sigma, MAX_SIGMA);
  }

  /* ---- confidence (design call 5) */
  let confidence: Confidence = 'low';
  if (basis === 'own_prices') {
    // "Certain" needs HIGH_OWN_SHOPS shops seen inside the window; a newest price over a year old caps at "Fairly sure".
    confidence = freshShops >= HIGH_OWN_SHOPS && !notes.has('old_prices') && !ownByNameOnly ? 'high' : 'medium';
  } else if (basis === 'other_size') {
    confidence = 'medium';
  } else if (basis === 'leaf_category' && n >= MEDIUM_LEAF_PRODUCTS && !notes.has('size_assumed')) {
    confidence = 'medium';
  }
  // D-270 A3: the confidence agrees with the bell drawn beside it. A shaded band (p90/p10) wider than
  // the 1.5x line the category safeguards call narrow (width-flag.ts) is never "Certain"; wider than
  // that line twice over (2.25x) it is "Not fully confident". A starting guess, to be replaced by each
  // rung's measured hit rate like the rest of design call 5.
  const bandWidth = Math.exp(2 * Z10 * sigma);
  if (bandWidth > TARGET_WIDTH * TARGET_WIDTH) confidence = 'low';
  else if (bandWidth > TARGET_WIDTH && confidence === 'high') confidence = 'medium';
  if ((basis === 'own_prices' || basis === 'cross_border' || basis === 'other_size') && n < 3) notes.add('few_prices');
  if ((basis === 'category_prior' || basis === 'department_prior') && n < MIN_CATEGORY_PRODUCTS) notes.add('few_prices');
  // D-258: "Few prices behind this" and "Fairly sure" never sit side by side. One or two prices (one or
  // two shops) still answer and still set the centre; the confidence says how thin that is.
  if (notes.has('few_prices')) confidence = 'low';
  // D-270 A10, gap 72: prices only from another province are one step less sure ("Certain" becomes "Fairly sure").
  if (notes.has('other_region')) confidence = confidence === 'high' ? 'medium' : 'low';
  // D-270 A9: no regular price of its own.
  if (saleOnly) confidence = 'low';
  // The shops and the shopper disagree on which pack this barcode is: whatever answered, it is not sure.
  if (unitHeld) confidence = 'low';

  /* ---- the numbers */
  const centreCents = Math.max(1, Math.round(Math.exp(mu)));
  const read = readThresholdsGiven(shopper?.thresholds, centreCents);
  const categoryOnly = (basis === 'leaf_category' || basis === 'parent_category') && catSpread !== null;
  const p10Cents = Math.max(1, Math.round(Math.exp(mu - Z10 * sigma)));
  const p90Cents = Math.max(1, Math.round(Math.exp(mu + Z10 * sigma)));
  const lines = categoryOnly ? categoryOnlyLines(read.thresholds, read.given, mu, catSpread!.p10, catSpread!.p90) : read.thresholds;
  const thresholds = bandLines(lines, read.given, centreCents, p10Cents, p90Cents);
  let perUnit: Verdict['perUnit'] = null;
  if (item.weighed) perUnit = { label: perLb ? 'per lb' : 'per kg', centreCents };
  else if (target) perUnit = { label: perUnitLabel(target), centreCents: Math.round((centreCents * target.perQuantity) / target.baseValue) };
  // D-270 A11: the bigger pack is offered only when it works out cheaper than this one.
  if (biggerPack && target && biggerPackPerUnit !== null && biggerPackPerUnit >= (centreCents * target.perQuantity) / target.baseValue) biggerPack = null;

  // Newest first; a row dated only by its load day after every dated one (D-267 A9).
  const dots: Dot[] = [...ownAll]
    .sort((a, b) =>
      a.dateUnknown !== b.dateUnknown ? Number(a.dateUnknown) - Number(b.dateUnknown) : a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : a.cents - b.cents,
    )
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
  // D-233: a too-thin estimate places no shopper, so no zone is ever read off it.
  if (shopper && Number.isInteger(shopper.cents) && shopper.cents > 0 && (!item.weighed || perLb) && !tooThin && !noPrices) {
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
    p10Cents,
    p90Cents,
    basis: basis!,
    spreadFrom,
    confidence,
    n,
    perUnit,
    // The pack priced is said whenever it is not plainly the item's own: scaled to it, or the shops' pack (case 9).
    scaledTo: (scaled || conflict !== null) && target ?(item.weighed ? (perLb ? '1 lb' : '1 kg') : sizeText ?? sizeLabel(target)) : null,
    dots,
    biggerPack,
    shopper: placed,
    thresholds,
    notes: [...notes],
  };
  // D-280 probe C: recorded for every answer (the rung above read it once; an item that never reached the rung reads it here).
  readCrossBorder();
  return {
    verdict,
    trace: { tried, claude: claudeTrace, conflict, sorted, nationalAverage: national, name, brand, size: sizeText, ownShops: basis === 'own_prices' ? ownShops.length : 0, widePool: aside.pool, tooThin, noPrices, crossBorder },
  };
}

/** The contract's field names, in order, for a wire test that a response carries them exactly. */
export const VERDICT_FIELDS = [
  'kind', 'currency', 'centreCents', 'sigmaLog', 'p10Cents', 'p90Cents', 'basis', 'spreadFrom', 'confidence', 'n',
  'perUnit', 'scaledTo', 'dots', 'biggerPack', 'shopper', 'thresholds', 'notes',
] as const;
