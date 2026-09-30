/**
 * A general price range from Shin's own stored prices. Pure math: no network,
 * no model call, no write.
 *
 * The founders, 2026-09-27: "identify if it is in our catalogue, catalogue has
 * a bunch of categories and a general price range for those categories, use
 * pure math instead of calling apis to generate an avg price range".
 *
 * The ladder, stopping at the first step with enough evidence:
 *
 *   this_product     the product's own recent prices, one per shop, from one shop up.
 *   leaf_category    unit prices of other priced products in the product's
 *                    leaf category, scaled back to this product's size.
 *   parent_category  the same, one step up the category path. Never the
 *                    grandparent (RULINGS, "Product identity and catalogue
 *                    matching": leaf, then parent, never grandparent).
 *   none             with a reason, so the caller can go to the capped model.
 *
 * WHAT THIS READS, AND WHAT IT DOES NOT. Only `observation` in the price
 * database and `product` in the catalogue, both through handles the caller
 * passes in (open them read-only). `observation` has no moderation or source
 * column: its rows are crawled seller pages plus Open Prices crowd receipts
 * (seller 'openprices', photographed with a proof), and it holds no
 * shopper-typed prices at all. Those live in `price/data/corrections.db` and in
 * `app/data/user-catalogue.db` (`user_observation`, trusted = 0), and this file
 * reads neither, so unmoderated typed prices cannot reach a range.
 *
 * MONEY. Every stored amount stays integer cents. The only division is the size
 * scaling on the category steps, and it is rounded once, at the end, to whole
 * cents. Unit prices are ordered by cross-multiplication, not by dividing.
 *
 * PERCENTILES are nearest-rank (the same rule as `spine/src/money.ts`), because
 * every low, median and high on the own-product step is then a price some shop
 * actually charged, never an interpolated one.
 */

import type { DatabaseSync } from 'node:sqlite';
import { ageDays, isFutureDated, ratio } from '../../spine/src/money.ts';
import { parseQuantity, toComparison, type ComparisonQuantity, type ComparisonLabel } from '../../catalogue/src/units.ts';

/* ------------------------------------------------------------ thresholds */

/**
 * How far back a price still counts. One quarter: long enough to span several
 * crawl passes and a flyer cycle, short enough that a price from before the
 * last shelf re-price is not quoted as today's.
 */
export const WINDOW_DAYS = 90;

/*
 * Own-product step: ONE shop is enough (Jamin, 2026-09-30: "A products price
 * should be used even if only one store carries it"; RULINGS.md "Judge and
 * gauge mechanics"). The old floor of 3 shops is retired and no count of
 * stores suppresses a product's own price. With one shop the answer is that
 * price (low = high = median) and carries the store; with two or more it is
 * the range over them. The count is still of shops, never of rows, so one
 * chain crawled daily is one shop.
 */

/**
 * Category steps: at least 5 priced products. At 5, nearest-rank puts the 25th
 * and 75th percentiles on the 2nd and 4th values, so one outlier product at
 * either end can never set the low or the high. At 4 it would.
 */
export const MIN_CATEGORY_PRODUCTS = 5;

/* ----------------------------------------------------------------- types */

export interface RangeInput {
  /** Canonical barcode, when known. */
  readonly barcode?: string | null;
  readonly name?: string | null;
  readonly brand?: string | null;
  /** The size as printed, e.g. "500 g" or "6 x 355 ml". */
  readonly size?: string | null;
  /** Deepest category tag, e.g. "en:peanut-butters". */
  readonly leafCategory?: string | null;
  /** Broad to specific, the catalogue's own `category_path` order. */
  readonly categoryPath?: readonly string[] | null;
  /** ISO date the range is for. Prices after it are ignored. */
  readonly asOf: string;
  /** Only prices in this currency are used. Default 'CAD'. */
  readonly currency?: string;
  /** Override WINDOW_DAYS. */
  readonly windowDays?: number;
}

export interface RangeSources {
  /** The price database (`observation` table). Open it read-only. */
  readonly prices: DatabaseSync;
  /** The catalogue (`product` table). Optional: without it only the own-product step can run. */
  readonly catalogue?: DatabaseSync | null;
}

export type RangeBasis = 'this_product' | 'leaf_category' | 'parent_category' | 'none';

/** What each step of the ladder found, in order, so a caller can see why it stopped where it did. */
export interface RangeStep {
  readonly basis: Exclude<RangeBasis, 'none'>;
  /** The category tag the step used; null on the own-product step. */
  readonly category: string | null;
  readonly n: number;
  readonly outcome: 'used' | 'too_few' | 'no_barcode' | 'no_category' | 'no_size';
}

interface RangeCommon {
  readonly lowCents: number;
  readonly highCents: number;
  readonly medianCents: number;
  /** Shops on the own-product step, products on a category step. */
  readonly n: number;
  /** Distinct `seller` values behind the points (Open Prices counts as one). */
  readonly sellers: number;
  readonly oldest: string;
  readonly newest: string;
  /** high / low, two decimals. 1 means every point agreed. */
  readonly spread: number;
  readonly currency: string;
  readonly windowDays: number;
  readonly tried: readonly RangeStep[];
}

export interface RangeThisProduct extends RangeCommon {
  readonly basis: 'this_product';
  /** The seller, when exactly one shop carries it (then low = high = median and `newest` is its date); else null. */
  readonly store: string | null;
  /** With one shop: that shop's own name and city when the row carries them (Open Prices rows do); else null. */
  readonly shop: string | null;
}

export interface RangeCategory extends RangeCommon {
  readonly basis: 'leaf_category' | 'parent_category';
  readonly category: string;
  /** The category's unit prices at the 25th and 75th percentile, whole cents per `label`. */
  readonly unit: { readonly label: ComparisonLabel; readonly lowCents: number; readonly highCents: number };
  /** The size the range was scaled to, as given. */
  readonly scaledTo: { readonly value: number; readonly unit: string };
}

export type NoneReason = 'no_barcode_and_no_category' | 'size_unknown' | 'too_few_prices';

export interface RangeNone {
  readonly basis: 'none';
  readonly reason: NoneReason;
  /** Largest n any step reached. */
  readonly n: number;
  readonly spread: null;
  readonly tried: readonly RangeStep[];
}

export type RangeResult = RangeThisProduct | RangeCategory | RangeNone;

/* ------------------------------------------------------------ percentiles */

/**
 * Zero-based index of the nearest-rank percentile `p` (0 to 100) in a sorted
 * list of `n`. Integer arithmetic only.
 */
export function nearestRankIndex(n: number, p: number): number {
  if (n <= 0) throw new Error('percentile of empty set');
  return Math.max(1, Math.floor((p * n + 99) / 100)) - 1;
}

/** 25th, 50th and 75th nearest-rank percentiles of integer cents. */
export function quartiles(values: readonly number[]): { low: number; median: number; high: number } {
  const s = [...values].sort((a, b) => a - b);
  return {
    low: s[nearestRankIndex(s.length, 25)]!,
    median: s[nearestRankIndex(s.length, 50)]!,
    high: s[nearestRankIndex(s.length, 75)]!,
  };
}

/* ---------------------------------------------------------------- codes */

/** Leading zeros stripped: the key two spellings of one barcode share. */
function codeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

/** Every spelling a code may be stored under: as given, bare, 8, 12, 13, 14 digits. */
function spellings(code: string): string[] {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return [d];
  const bare = codeKey(d);
  const out = [d, bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  return [...new Set(out)];
}

/* --------------------------------------------------------------- prices */

interface Obs {
  readonly key: string;
  readonly seller: string;
  readonly shop: string;
  readonly cents: number;
  readonly seenOn: string;
  /** The store's own name for the product, and its brand when it gives one. */
  readonly name: string;
  readonly brand: string | null;
  /** The actual shop (store name, with its city when known), when the row names one. */
  readonly shopName: string | null;
}

/** "Store name, City" from the row, or null when the row names no shop. */
function shopNameOf(name: unknown, city: unknown): string | null {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n === '') return null;
  const c = typeof city === 'string' ? city.trim() : '';
  return c ? `${n}, ${c}` : n;
}

/** Hosts reserved for documentation and tests: a row linking there came from a test double. */
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

/**
 * Joined, regular-price rows in the window and currency. Promotional prices are
 * left out: the question is what the thing normally costs, and a sale price
 * would drag the low end below any shelf's regular tag.
 */
function readObservations(db: DatabaseSync, codes: readonly string[] | null, currency: string, asOf: string, windowDays: number): Obs[] {
  const where = codes === null ? 'code IS NOT NULL' : `code IN (${codes.map(() => '?').join(',')})`;
  const rows = db
    .prepare(
      `SELECT code, seller, seller_name, seller_brand, region, store_name, store_city, store_osm, price_cents, seen_on, url
         FROM observation
        WHERE ${where} AND kind = 'regular' AND currency = ?`,
    )
    .all(...(codes ?? []), currency) as Record<string, unknown>[];
  const out: Obs[] = [];
  for (const r of rows) {
    const cents = r.price_cents;
    const seen = r.seen_on;
    if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0) continue;
    if (typeof seen !== 'string' || typeof r.code !== 'string' || typeof r.seller !== 'string') continue;
    if (reservedHost(typeof r.url === 'string' ? r.url : null)) continue;
    let age: number;
    try {
      if (isFutureDated(seen, asOf)) continue;
      age = ageDays(seen, asOf);
    } catch {
      continue;
    }
    if (age > windowDays) continue;
    // The shop, not the publisher: Open Prices publishes many shops under one seller string.
    const place = (r.store_osm ?? r.store_name ?? r.region ?? '') as string;
    out.push({
      key: codeKey(r.code),
      seller: r.seller,
      shop: `${r.seller}|${String(place).toLowerCase().trim()}`,
      cents,
      seenOn: seen,
      name: typeof r.seller_name === 'string' ? r.seller_name.trim() : '',
      brand: typeof r.seller_brand === 'string' && r.seller_brand.trim() !== '' ? r.seller_brand.trim() : null,
      shopName: shopNameOf(r.store_name, r.store_city),
    });
  }
  return out;
}

/** One price per shop: the latest; on the same day, the lower. */
function latestPerShop(obs: readonly Obs[]): Obs[] {
  const by = new Map<string, Obs>();
  for (const o of obs) {
    const have = by.get(o.shop);
    if (!have || o.seenOn > have.seenOn || (o.seenOn === have.seenOn && o.cents < have.cents)) by.set(o.shop, o);
  }
  return [...by.values()];
}

function dates(points: readonly Obs[]): { oldest: string; newest: string } {
  const d = points.map((p) => p.seenOn).sort();
  return { oldest: d[0]!, newest: d[d.length - 1]! };
}

/* ------------------------------------------------------------ catalogue */

interface CatalogueRow {
  readonly key: string;
  readonly size: ComparisonQuantity | null;
  readonly leaf: string | null;
  readonly path: readonly string[];
}

function sizeOf(value: unknown, unit: unknown, quantity: unknown): ComparisonQuantity | null {
  const fromCols = toComparison(typeof value === 'number' ? value : null, typeof unit === 'string' ? unit : null);
  if (fromCols) return fromCols;
  const p = parseQuantity(typeof quantity === 'string' ? quantity : null);
  return p ? toComparison(p.value, p.unit) : null;
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

function readCatalogue(db: DatabaseSync, codes: readonly string[]): Map<string, CatalogueRow> {
  const out = new Map<string, CatalogueRow>();
  const all = [...new Set(codes.flatMap(spellings))];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const rows = db
      .prepare(
        `SELECT code, size_value, size_unit, quantity, category_path, leaf_category
           FROM product WHERE code IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as Record<string, unknown>[];
    for (const r of rows) {
      const key = codeKey(String(r.code));
      if (out.has(key)) continue;
      out.set(key, {
        key,
        size: sizeOf(r.size_value, r.size_unit, r.quantity),
        leaf: typeof r.leaf_category === 'string' ? r.leaf_category : null,
        path: parsePath(r.category_path),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------- category */

interface ProductPoint {
  readonly key: string;
  /** This product's own middle price in the window, lower middle on an even count. */
  readonly cents: number;
  readonly base: number;
  readonly sellers: readonly string[];
  readonly oldest: string;
  readonly newest: string;
}

/** a.cents / a.base against b.cents / b.base, by cross-multiplying. */
function byUnitPrice(a: ProductPoint, b: ProductPoint): number {
  const d = a.cents * b.base - b.cents * a.base;
  return d !== 0 ? d : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function categoryRange(
  basis: 'leaf_category' | 'parent_category',
  tag: string,
  target: ComparisonQuantity,
  selfKey: string | null,
  priced: ReadonlyMap<string, Obs[]>,
  catalogue: ReadonlyMap<string, CatalogueRow>,
  currency: string,
  windowDays: number,
  tried: RangeStep[],
): RangeCategory | null {
  const points: ProductPoint[] = [];
  for (const [key, obs] of priced) {
    // The product itself is left out: this step runs because its own evidence was too thin.
    if (key === selfKey) continue;
    const row = catalogue.get(key);
    if (!row || !row.size || row.size.family !== target.family) continue;
    const inCategory = basis === 'leaf_category' ? row.leaf === tag : row.path.includes(tag);
    if (!inCategory) continue;
    const shops = latestPerShop(obs);
    const cents = [...shops.map((s) => s.cents)].sort((a, b) => a - b)[nearestRankIndex(shops.length, 50)]!;
    const d = dates(shops);
    points.push({ key, cents, base: row.size.baseValue, sellers: shops.map((s) => s.seller), ...d });
  }
  if (points.length < MIN_CATEGORY_PRODUCTS) {
    tried.push({ basis, category: tag, n: points.length, outcome: 'too_few' });
    return null;
  }
  tried.push({ basis, category: tag, n: points.length, outcome: 'used' });
  points.sort(byUnitPrice);
  const at = (p: number) => points[nearestRankIndex(points.length, p)]!;
  // The one rounding: stored cents times a size ratio, to whole cents.
  const scale = (pt: ProductPoint) => Math.round((pt.cents * target.baseValue) / pt.base);
  const perUnit = (pt: ProductPoint) => Math.round((pt.cents * target.perQuantity) / pt.base);
  const lo = at(25);
  const hi = at(75);
  const lowCents = scale(lo);
  const highCents = scale(hi);
  const allDates = points.flatMap((p) => [p.oldest, p.newest]).sort();
  return {
    basis,
    category: tag,
    lowCents,
    highCents,
    medianCents: scale(at(50)),
    n: points.length,
    sellers: new Set(points.flatMap((p) => p.sellers)).size,
    oldest: allDates[0]!,
    newest: allDates[allDates.length - 1]!,
    spread: ratio(highCents, lowCents),
    currency,
    windowDays,
    unit: { label: target.label, lowCents: perUnit(lo), highCents: perUnit(hi) },
    scaledTo: target.original,
    tried,
  };
}

/* ------------------------------------------------------------------ main */

/** The own-product answer over one or more shops (one latest price each). */
function ownRange(shops: readonly Obs[], currency: string, windowDays: number, tried: RangeStep[]): RangeThisProduct {
  const q = quartiles(shops.map((s) => s.cents));
  return {
    basis: 'this_product',
    lowCents: q.low,
    highCents: q.high,
    medianCents: q.median,
    n: shops.length,
    sellers: new Set(shops.map((s) => s.seller)).size,
    store: shops.length === 1 ? shops[0]!.seller : null,
    shop: shops.length === 1 ? shops[0]!.shopName : null,
    ...dates(shops),
    spread: ratio(q.high, q.low),
    currency,
    windowDays,
    tried,
  };
}

/** A product known only from the price store: the store's own name for it, and the range over its shops. */
export interface PriceStoreProduct {
  readonly name: string;
  readonly brand: string | null;
  readonly range: RangeThisProduct;
}

/**
 * A barcode the catalogue does not hold but the price store does (RULINGS.md
 * "Judge and gauge mechanics": a product's own price is used even from one
 * store). Named by the store's own product name, taken from the newest
 * observation (on the same day, the lower price, as `latestPerShop` does).
 * Null when no regular price in the window and currency carries the code.
 * Read-only, no network.
 */
export function ownProductFromPrices(
  db: DatabaseSync,
  barcode: string,
  opts: { asOf: string; currency?: string; windowDays?: number },
): PriceStoreProduct | null {
  const currency = opts.currency ?? 'CAD';
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const shops = latestPerShop(readObservations(db, spellings(barcode.trim()), currency, opts.asOf, windowDays));
  if (shops.length === 0) return null;
  const named = [...shops].filter((s) => s.name !== '').sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : a.cents - b.cents))[0];
  if (!named) return null;
  return {
    name: named.name,
    brand: named.brand,
    range: ownRange(shops, currency, windowDays, [{ basis: 'this_product', category: null, n: shops.length, outcome: 'used' }]),
  };
}

/**
 * The general price range for one product, from Shin's own stored prices.
 * Never calls out; reads only the two handles given.
 */
export function priceRangeFor(input: RangeInput, sources: RangeSources): RangeResult {
  const currency = input.currency ?? 'CAD';
  const windowDays = input.windowDays ?? WINDOW_DAYS;
  const tried: RangeStep[] = [];
  const barcode = input.barcode?.trim() ? input.barcode.trim() : null;
  const selfKey = barcode ? codeKey(barcode) : null;

  // The catalogue's own row fills whatever the caller left out.
  const selfRow = barcode && sources.catalogue ? readCatalogue(sources.catalogue, [barcode]).get(selfKey!) ?? null : null;
  const path = input.categoryPath && input.categoryPath.length > 0 ? input.categoryPath : selfRow?.path ?? [];
  const leaf = input.leafCategory ?? selfRow?.leaf ?? path[path.length - 1] ?? null;
  const fromText = parseQuantity(input.size ?? null);
  const target = (fromText ? toComparison(fromText.value, fromText.unit) : null) ?? selfRow?.size ?? null;

  // Step 1: this product.
  let best = 0;
  if (barcode) {
    const shops = latestPerShop(readObservations(sources.prices, spellings(barcode), currency, input.asOf, windowDays));
    best = shops.length;
    if (shops.length >= 1) {
      tried.push({ basis: 'this_product', category: null, n: shops.length, outcome: 'used' });
      return ownRange(shops, currency, windowDays, tried);
    }
    tried.push({ basis: 'this_product', category: null, n: shops.length, outcome: 'too_few' });
  } else {
    tried.push({ basis: 'this_product', category: null, n: 0, outcome: 'no_barcode' });
  }

  // Steps 2 and 3: the category, leaf then parent, never further.
  const idx = leaf ? path.lastIndexOf(leaf) : -1;
  const parent = idx > 0 ? path[idx - 1]! : null;
  const none = (reason: NoneReason): RangeNone => ({ basis: 'none', reason, n: best, spread: null, tried });

  if (!leaf || !sources.catalogue) {
    tried.push({ basis: 'leaf_category', category: leaf, n: 0, outcome: 'no_category' });
    return none(barcode ? 'too_few_prices' : 'no_barcode_and_no_category');
  }
  if (!target) {
    tried.push({ basis: 'leaf_category', category: leaf, n: 0, outcome: 'no_size' });
    if (parent) tried.push({ basis: 'parent_category', category: parent, n: 0, outcome: 'no_size' });
    return none('size_unknown');
  }

  const all = readObservations(sources.prices, null, currency, input.asOf, windowDays);
  const priced = new Map<string, Obs[]>();
  for (const o of all) {
    const list = priced.get(o.key);
    if (list) list.push(o);
    else priced.set(o.key, [o]);
  }
  const catalogue = readCatalogue(sources.catalogue, [...priced.keys()]);

  const leafRange = categoryRange('leaf_category', leaf, target, selfKey, priced, catalogue, currency, windowDays, tried);
  if (leafRange) return leafRange;
  best = Math.max(best, tried[tried.length - 1]!.n);

  if (!parent) {
    tried.push({ basis: 'parent_category', category: null, n: 0, outcome: 'no_category' });
    return none('too_few_prices');
  }
  const parentRange = categoryRange('parent_category', parent, target, selfKey, priced, catalogue, currency, windowDays, tried);
  if (parentRange) return parentRange;
  best = Math.max(best, tried[tried.length - 1]!.n);
  return none('too_few_prices');
}
