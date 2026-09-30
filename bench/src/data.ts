/**
 * Reading the price database and the catalogue for the bench. READ-ONLY.
 *
 * Every handle on a real file is opened with `readOnly: true`, so a write
 * through it throws inside SQLite rather than relying on this code to be
 * careful. The bench never calls `openPrices` on a real path: that function
 * runs DDL and ALTERs, which is a write.
 *
 * The shop rule is the same as `price/src/range.ts` (which does not export it),
 * so "3 shops" here means what it means there. The barcode key goes one step
 * further than range.ts: UPC-E is expanded (see `codeKey`).
 */

import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { upcAOf, upcEOf } from '../../catalogue/src/upc.ts';

export type PriceKind = 'regular' | 'promotional';

export interface Observation {
  /** Barcode with leading zeros stripped; null when the row has no barcode. */
  readonly key: string | null;
  readonly code: string | null;
  readonly seller: string;
  readonly sellerSku: string;
  readonly sellerName: string;
  /** `${seller}|${store_osm ?? store_name ?? region ?? ''}` lowercased, as in range.ts. */
  readonly shop: string;
  readonly cents: number;
  readonly kind: PriceKind;
  readonly seenOn: string;
  readonly currency: string;
  readonly country: string;
  readonly region: string | null;
  readonly storeName: string | null;
  readonly storeOsm: string | null;
  readonly joinMethod: string;
  readonly url: string | null;
  /**
   * True when the row is a sale: `kind = 'promotional'`, or `is_sale = 1` where
   * that column exists (added by unit A1, 2026-09-28). A row can carry
   * is_sale = 1 with kind 'regular'; the bench treats it as a sale.
   */
  readonly isSale: boolean;
  /** The printed "was" price, where the `was_cents` column exists and holds one. */
  readonly wasCents: number | null;
  /** Raw `flags` JSON (unit A1), or null when the column is absent or empty. */
  readonly flags: string | null;
  /** The printout tile the row came from (unit A1); null for crawled rows or old databases. */
  readonly captureTileId: number | null;
  /** 1 when a printout price was checked (lane B's `price_verified`); null when the column is absent. */
  readonly priceVerified: number | null;
}

/** The optional columns, newest first, read only when the table has them. */
export const OPTIONAL_COLUMNS = ['is_sale', 'was_cents', 'flags', 'capture_tile_id', 'price_verified'] as const;

/** True when `flags` holds anything: a non-empty JSON array, or any non-JSON text. */
export function hasFlags(flags: string | null): boolean {
  if (flags === null || !flags.trim()) return false;
  try {
    const v = JSON.parse(flags) as unknown;
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== '';
  } catch {
    return true;
  }
}

export type KeyExclusion = 'flagged' | 'unverified_printout';

/**
 * Whether a row may be EVIDENCE in an answer key. Rule (2026-09-28):
 *   - any row carrying flags is excluded (a flag says "do not trust as-is");
 *   - a printout-derived row (capture_tile_id set) counts only when
 *     price_verified = 1.
 * Returns null when the row may be used, else why not. Training rows are not
 * filtered by this: the model sees what production sees.
 */
export function keyExclusion(o: Observation): KeyExclusion | null {
  if (hasFlags(o.flags)) return 'flagged';
  if (o.captureTileId !== null && o.priceVerified !== 1) return 'unverified_printout';
  return null;
}

export interface CatalogueInfo {
  readonly key: string;
  readonly name: string | null;
  readonly leaf: string | null;
  /** Broad to specific. */
  readonly path: readonly string[];
  /** Size as text, for `priceRangeFor`'s `size` input; null when the catalogue has none. */
  readonly size: string | null;
}

/** GS1 mod-10 check over a full code (8, 12, 13 or 14 digits). */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < code.length - 1; i++) {
    const d = Number(code[code.length - 2 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

/**
 * The product key: one string for every spelling of one barcode.
 *
 * UPC-E (8 digits, number system 0 or 1) is expanded to its UPC-A when the
 * expansion's own check digit passes; same rule as app/src/barcode.ts
 * `interpret` (UPC-E wins over EAN-8 on North American shelves), using the same
 * `upcAOf` from catalogue/src/upc.ts. Then leading zeros are stripped, which
 * collapses UPC-A, EAN-13 (0 + UPC-A) and GTIN-14 (00 + UPC-A) to one key, the
 * rule range.ts already uses. NOT done: weighed-item (variable measure) labels.
 */
export function codeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  let full = d;
  if (/^[01]\d{7}$/.test(d)) {
    const upca = upcAOf(d);
    if (upca && isValidGtin(upca)) full = upca;
  }
  return full.replace(/^0+/, '') || full;
}

/** Every spelling a key may be stored under: bare, 8, 12, 13, 14 digits, and its UPC-E when it has one. */
export function spellings(code: string): string[] {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return [d];
  const bare = codeKey(d);
  const out = [d, bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  const e = bare.length <= 12 ? upcEOf(bare.padStart(12, '0')) : null;
  if (e) out.push(e);
  return [...new Set(out)];
}

/** Hosts reserved for documentation and tests (range.ts drops these rows too). */
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

/** Open a real database file so that SQLite itself refuses every write. */
export function openReadOnly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}

/** Size and mtime of a file, so a run can prove it did not change the database. */
export function fingerprint(path: string): { bytes: number; mtimeMs: number } {
  const s = statSync(path);
  return { bytes: s.size, mtimeMs: s.mtimeMs };
}

/**
 * Every usable observation in one currency. Selects only columns that exist on
 * the oldest schema still in use (an old database may lack `base_price_cents`).
 */
export function loadObservations(db: DatabaseSync, currency = 'CAD'): Observation[] {
  const cols = new Set((db.prepare('PRAGMA table_info(observation)').all() as { name: string }[]).map((c) => c.name));
  const extra = OPTIONAL_COLUMNS.map((c) => (cols.has(c) ? c : `NULL AS ${c}`)).join(', ');
  const rows = db
    .prepare(
      `SELECT code, seller, seller_sku, seller_name, price_cents, kind, seen_on, currency, country,
              region, store_name, store_osm, join_method, url, ${extra}
         FROM observation WHERE currency = ?`,
    )
    .all(currency) as Record<string, unknown>[];
  const out: Observation[] = [];
  for (const r of rows) {
    const cents = r.price_cents;
    if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0) continue;
    if (typeof r.seen_on !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(r.seen_on)) continue;
    if (r.kind !== 'regular' && r.kind !== 'promotional') continue;
    const url = typeof r.url === 'string' ? r.url : null;
    if (reservedHost(url)) continue;
    const code = typeof r.code === 'string' && r.code.trim() ? r.code.trim() : null;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const place = str(r.store_osm) ?? str(r.store_name) ?? str(r.region) ?? '';
    const was = r.was_cents;
    out.push({
      key: code ? codeKey(code) : null,
      code,
      seller: String(r.seller),
      sellerSku: String(r.seller_sku),
      sellerName: String(r.seller_name ?? ''),
      shop: `${String(r.seller)}|${place.toLowerCase().trim()}`,
      cents,
      kind: r.kind,
      seenOn: r.seen_on.slice(0, 10),
      currency: String(r.currency),
      country: String(r.country ?? 'CA'),
      region: str(r.region),
      storeName: str(r.store_name),
      storeOsm: str(r.store_osm),
      joinMethod: String(r.join_method ?? 'none'),
      url,
      isSale: r.kind === 'promotional' || r.is_sale === 1,
      wasCents: typeof was === 'number' && Number.isInteger(was) && was > 0 ? was : null,
      flags: typeof r.flags === 'string' && r.flags.trim() ? r.flags : null,
      captureTileId: typeof r.capture_tile_id === 'number' ? r.capture_tile_id : null,
      priceVerified: typeof r.price_verified === 'number' ? r.price_verified : null,
    });
  }
  return out;
}

/** Whole days between two ISO dates, absolute. */
export function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000;
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

/** Catalogue rows for these keys, by any spelling. Keys with no row are absent from the map. */
export function readCatalogueInfo(db: DatabaseSync | null, keys: Iterable<string>): Map<string, CatalogueInfo> {
  const out = new Map<string, CatalogueInfo>();
  if (!db) return out;
  const all = [...new Set([...keys].flatMap(spellings))];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const rows = db
      .prepare(
        `SELECT code, name, quantity, size_value, size_unit, category_path, leaf_category
           FROM product WHERE code IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as Record<string, unknown>[];
    for (const r of rows) {
      const key = codeKey(String(r.code));
      if (out.has(key)) continue;
      const path = parsePath(r.category_path);
      const leaf = typeof r.leaf_category === 'string' ? r.leaf_category : path[path.length - 1] ?? null;
      const size =
        typeof r.size_value === 'number' && typeof r.size_unit === 'string'
          ? `${r.size_value} ${r.size_unit}`
          : typeof r.quantity === 'string' && r.quantity.trim()
            ? r.quantity
            : null;
      out.set(key, { key, name: typeof r.name === 'string' ? r.name : null, leaf, path, size });
    }
  }
  return out;
}

/** One price per shop: the latest; on the same day, the lower (range.ts's rule). */
export function latestPerShop<T extends { shop: string; seenOn: string; cents: number }>(obs: readonly T[]): T[] {
  const by = new Map<string, T>();
  for (const o of obs) {
    const have = by.get(o.shop);
    if (!have || o.seenOn > have.seenOn || (o.seenOn === have.seenOn && o.cents < have.cents)) by.set(o.shop, o);
  }
  return [...by.values()];
}

/** Lower-middle median of numbers (a value some shop actually charged). */
export function lowerMedian(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of empty set');
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

/** The median: the middle value, or the mean of the two middle values. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of empty set');
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Nearest-rank percentile p (0..100) of a non-empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of empty set');
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(1, Math.ceil((p / 100) * s.length)) - 1]!;
}
