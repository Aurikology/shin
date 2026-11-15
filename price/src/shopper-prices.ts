/**
 * SHOPPER PRICES: a price a shopper typed for a product Pexi already identified becomes a price the next
 * shopper benefits from. Decided 2026-11-15 (docs/decisions.md, "Shopper prices").
 *
 * WHERE THEY LIVE. A `shopper_price` table in the corrections database (price/data/corrections.db, the one
 * file nothing else rewrites), not in prices.db. prices.db is crawled data the app opens read-only and the
 * estimate caches by the file's size and time: one shopper write there would make the next scan re-read about
 * 99,000 rows (about 2.5 s). The table is made on first use, so a file made before it gains it, and a test
 * that points SHIN_CORRECTIONS at a temp file never touches a real one.
 *
 * THE TRUST RULE (every line is a test in price/test/shopper-prices.test.ts):
 *   1. at most one price per device per product per day: the first stands, a repeat is ignored;
 *   2. when the product already has a centre (the answer the shopper just saw was built on prices for it),
 *      a price below x0.33 or above x3 of that centre is ignored as a typo;
 *   3. developer and probe devices (id starts "probe") are never recorded;
 *   4. ALL shoppers' prices for a product are ONE voice: the median of each device's newest price in the last
 *      180 days. The estimate (price/src/estimate.ts `shopperVoice`) takes that voice as one shop, only while
 *      the product has fewer than 2 shop prices. So a shopper price never weighs more than one shop's price,
 *      and never lifts a verdict above low confidence: one shop plus one voice is 2 prices, and the estimate
 *      marks fewer than 3 prices low confidence. Shopper prices alone (one device or many) are low too.
 *
 * Never throws: a missing or broken store is a price not saved, said in `why`.
 */
import type { DatabaseSync } from 'node:sqlite';

export const SHOPPER_MIN_RATIO = 0.33;
export const SHOPPER_MAX_RATIO = 3;
/** The voice is built from prices seen in this many days. */
export const SHOPPER_VOICE_DAYS = 180;
/** The estimate takes the voice only while the product has fewer shop prices than this. */
export const SHOPPER_VOICE_BELOW_SHOPS = 2;

const DDL = `
CREATE TABLE IF NOT EXISTS shopper_price (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT NOT NULL,
  code        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  region      TEXT,
  store       TEXT,
  seen_on     TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  centre_cents INTEGER
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS shopper_price_one_per_day ON shopper_price(device_id, code, seen_on);
CREATE INDEX IF NOT EXISTS shopper_price_code ON shopper_price(code, seen_on);
CREATE INDEX IF NOT EXISTS shopper_price_device ON shopper_price(device_id);
`;

const made = new WeakSet<DatabaseSync>();

function ensure(db: DatabaseSync): void {
  if (made.has(db)) return;
  db.exec(DDL);
  made.add(db);
}

/** The code as the estimate keys it: digits without their zero padding. */
export function shopperCodeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

/** Developer and probe devices (scripts' ids start "probe-"): never recorded. */
export function isProbeDevice(deviceId: string): boolean {
  return deviceId.trim().toLowerCase().startsWith('probe');
}

export interface ShopperPriceInput {
  readonly deviceId: string;
  readonly code: string;
  readonly priceCents: number;
  readonly region: string | null;
  readonly store: string | null;
  /** ISO day the price was typed. */
  readonly seenOn: string;
  /** The product's centre in the answer the shopper saw, or null when it had none. The typo guard's reference. */
  readonly centreCents: number | null;
}

export type SaveResult =
  | { readonly ok: true; readonly id: number }
  | { readonly ok: false; readonly why: 'probe_device' | 'bad_price' | 'already_today' | 'typo_guard' | 'store_unavailable' };

export function saveShopperPrice(db: DatabaseSync | null, input: ShopperPriceInput, now: Date = new Date()): SaveResult {
  if (isProbeDevice(input.deviceId)) return { ok: false, why: 'probe_device' };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) return { ok: false, why: 'bad_price' };
  if (!db) return { ok: false, why: 'store_unavailable' };
  const centre = input.centreCents;
  if (typeof centre === 'number' && Number.isFinite(centre) && centre > 0) {
    if (input.priceCents < centre * SHOPPER_MIN_RATIO || input.priceCents > centre * SHOPPER_MAX_RATIO) {
      return { ok: false, why: 'typo_guard' };
    }
  }
  try {
    ensure(db);
    const r = db
      .prepare(
        `INSERT OR IGNORE INTO shopper_price (device_id, code, price_cents, region, store, seen_on, recorded_at, centre_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.deviceId,
        shopperCodeKey(input.code),
        input.priceCents,
        input.region?.trim().slice(0, 80) || null,
        input.store?.trim().slice(0, 120) || null,
        input.seenOn,
        now.toISOString(),
        typeof centre === 'number' && centre > 0 ? Math.round(centre) : null,
      );
    if (Number(r.changes) === 0) return { ok: false, why: 'already_today' };
    return { ok: true, id: Number(r.lastInsertRowid) };
  } catch (err) {
    console.error(`[shopper-price-fault] save_failed ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, why: 'store_unavailable' };
  }
}

/** How many prices this device has saved for other shoppers. 0 for a missing store. */
export function shopperPriceCount(db: DatabaseSync | null, deviceId: string): number {
  if (!db) return 0;
  try {
    ensure(db);
    return (db.prepare('SELECT COUNT(*) AS n FROM shopper_price WHERE device_id = ?').get(deviceId) as { n: number }).n;
  } catch (err) {
    console.error(`[shopper-price-fault] count_failed ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

export interface ShopperVoice {
  /** The median of each device's newest price. */
  readonly cents: number;
  readonly seenOn: string;
  /** The region of the newest reading, or null. */
  readonly region: string | null;
  /** How many devices stand behind the price. */
  readonly devices: number;
}

/** The one voice for a product: see rule 4 above. Null when no price is in the window. */
export function shopperVoiceFor(db: DatabaseSync | null, code: string, asOf: string): ShopperVoice | null {
  if (!db) return null;
  try {
    ensure(db);
    const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - SHOPPER_VOICE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const rows = db
      .prepare(
        `SELECT device_id, price_cents, region, seen_on FROM shopper_price
          WHERE code = ? AND seen_on >= ? AND seen_on <= ?
          ORDER BY seen_on DESC, id DESC`,
      )
      .all(shopperCodeKey(code), since, asOf) as { device_id: string; price_cents: number; region: string | null; seen_on: string }[];
    if (rows.length === 0) return null;
    const newestPerDevice = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!newestPerDevice.has(r.device_id)) newestPerDevice.set(r.device_id, r);
    const picked = [...newestPerDevice.values()];
    const sorted = picked.map((r) => r.price_cents).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const cents = sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
    const newest = rows[0]!;
    return { cents, seenOn: newest.seen_on, region: newest.region, devices: picked.length };
  } catch (err) {
    console.error(`[shopper-price-fault] voice_failed ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Any shopper price on file for the product, of any age. The name preview's "Pexi has a price". */
export function hasShopperPrice(db: DatabaseSync | null, code: string): boolean {
  if (!db) return false;
  try {
    ensure(db);
    return db.prepare('SELECT 1 FROM shopper_price WHERE code = ? LIMIT 1').get(shopperCodeKey(code)) !== undefined;
  } catch (err) {
    console.error(`[shopper-price-fault] has_failed ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function spellings(code: string): string[] {
  const bare = shopperCodeKey(code);
  if (!/^\d+$/.test(bare)) return [bare];
  const out = [code.trim(), bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  return [...new Set(out)];
}

/**
 * Whether a shop (crawled seller) has a price for the product: two indexed reads of prices.db's
 * `observation`, no row scan, so the name preview stays fast. A file with no observation table, or none
 * at all, is "no".
 */
export function hasShopPrice(prices: DatabaseSync | null, code: string): boolean {
  if (!prices) return false;
  try {
    const keys = spellings(code);
    const marks = keys.map(() => '?').join(',');
    for (const col of ['code', 'page_gtin']) {
      try {
        const hit = prices.prepare(`SELECT 1 FROM observation WHERE ${col} IN (${marks}) AND price_cents > 0 LIMIT 1`).get(...keys);
        if (hit !== undefined) return true;
      } catch {
        /* a file without that column: the other one may still answer */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Takes the device id off every price recorded before `cutoffIso` (the retention sweep). The price stays. Returns the count. */
export function removeOldShopperDeviceIds(db: DatabaseSync | null, cutoffIso: string, prefix: string): number {
  if (!db) return 0;
  ensure(db);
  const r = db
    .prepare(`UPDATE shopper_price SET device_id = ? || id WHERE recorded_at < ? AND device_id NOT LIKE ? || '%'`)
    .run(prefix, cutoffIso, prefix);
  return Number(r.changes);
}
